# Root Cause Analysis: Deliver generated worker prompts exactly once before settlement

**Issue**: #347
**Date**: 2026-08-31
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/
---

## Root Cause

A new worker is started empty (`herdr agent start <name> --kind omp --pane <pane>`). On `session_start`, `src/extension.ts` reads `.omp/sdlc/run.json` and `appendEntry("com.nmg-sdlc.run", run)` when that file exists. The sibling session can become idle, done, or exit with only that custom entry and no generated user prompt.

`runExecute` in `scripts/sdlc-execute.mjs` then generates the step prompt and calls `herdrApi.agentPrompt({ name, prompt })` (`herdr agent prompt <name> <prompt> --wait`). The main start-then-prompt block samples `agentState(herdrApi.agentGet(agentName))` *before* that prompt. If the empty session is already idle/done, stall/paste recovery is skipped unless the prompt text is visible or detection contains `Working`. `observeExpectedHandoff` then treats two idle/done observations with no `.omp/sdlc/handoffs/<N>-<step>.json` as `missing_handoff`. `stopResult` closes owned panes by default unless `--retain-worker` was requested.

The same start-then-prompt path is used for start, implement, fix1, fix2, verify, deliver, and rem workers. Review workers use `submitReviewProtocol` and stay out of this fix.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-execute.mjs` | `runExecute` main `while (step)` start-then-prompt (~2344–2442) | Starts `s<N>-<step>`, samples state before `agentPrompt`, then observes handoff |
| `scripts/sdlc-execute.mjs` | `runRemediationLoop` fresh rem start-then-prompt (~1712–1784) | Same start-then-prompt for `r<N>-<step>` |
| `scripts/sdlc-execute.mjs` | `runRemediationLoop` `remLive` idle/done without handoff (~1788–1816) | Sends a generated `agentPrompt` to an already-live rem worker |
| `scripts/sdlc-execute.mjs` | `waitForAgentStartRetry`, `workerStillPresent`, `hasPastedWorkerPrompt`, `retryPromptSubmission`, `appearsWorking`, `observeExpectedHandoff`, `stopResult` | Existing start retry, live-presence, paste recovery, observation, and close-on-stop |
| `src/extension.ts` | `session_start` `appendEntry("com.nmg-sdlc.run", run)` | Empty-session custom entry; do not remove |

### Triggering Conditions

- Fresh sibling `--kind omp` worker for a non-review step
- `.omp/sdlc/run.json` exists so `session_start` appends `com.nmg-sdlc.run`
- Session becomes idle/done or exits before the generated prompt is visible in the live session
- No `.omp/sdlc/handoffs/<N>-<step>.json` yet

---

## Fix Strategy

### Approach

Keep `session_start` unchanged. Add one unexported helper in `scripts/sdlc-execute.mjs` because no existing helper proves generated-prompt delivery to a live session before observation. Use it from the two fresh start-then-prompt sites (main `s<N>-<step>` and rem `r<N>-<step>`). Stop sending a generated prompt on the live rem resume path; that path must match retained `s<N>-<step>` resume (paste/working recovery only).

Do not export the helper. Do not change `submitReviewProtocol`, review resume, close-on-stop after proven delivery, or handoff validation.

### Changes

| File | Change |
|------|--------|
| `scripts/sdlc-execute.mjs` | Add `deliverGeneratedPromptOnce` and call it from both fresh non-review start-then-prompt sites; remove generated `agentPrompt` from live rem resume |
| `scripts/__tests__/sdlc-execute.test.mjs` | Add focused regressions for pre-prompt death retry, single prompt before observe, no double-prompt on retained live workers, and post-delivery `missing_handoff` close-on-stop |

### deliverGeneratedPromptOnce

Place next to `waitForWorkerSettlement`. Signature:

```javascript
function deliverGeneratedPromptOnce({
  herdr,
  agentName,
  paneId,
  prompt,
  start,
}) {
  // algorithm
}
```

`start` is `() => herdr.agentStart({ name: agentName, paneId, kind: 'omp' })`.

Gone means `!workerStillPresent(herdr, agentName, paneId)`. Idle/done while still listed on that pane is live, not gone.

Algorithm:

1. If the worker is gone before the first prompt: `waitForAgentStartRetry()` then `start()` once. If that start command fails, return `{ delivered: false, reasonCode: 'agent_start_failed' }`. If the worker is still gone after a successful retry start, return `{ delivered: false, reasonCode: 'process_lost' }`. Do not call `agentPrompt` on a gone session. Do not use `missing_handoff`.
2. If the worker is live, call `herdr.agentPrompt({ name: agentName, prompt })` exactly once. This is the only generated prompt for this invocation on this live session.
3. Once that submission is accepted, persist the worker as `promptDelivery: "activating"` with `promptDeliveryVersion: 2` before entering `awaitInitialPromptActivation`.
4. Bounded activation treats only working, blocked, or a valid expected handoff as proof. Proof persists `delivered`. Exhaustion persists `pending` and stops as retained `prompt_pending`; idle/done alone never reaches settlement or close.
5. On startup, `pending` may re-enter one-shot dispatch, `activating` re-enters only bounded activation, and versioned `delivered` proceeds to normal settlement. Unversioned legacy `delivered` migrates to `activating` because the old checkpoint cannot prove whether activation completed.

The same persisted state machine wraps standard, review, and remediation submission. Review prompt content, review artifact validation, and positive-visibility-only Enter recovery remain unchanged.

Callers may invoke `observeExpectedHandoff` or `observeReviewHandoff` only after the activation helper has persisted `delivered`. A missing handoff after that proof remains `missing_handoff`; before proof it remains retained `prompt_pending`.

The existing command-failure start retry (`!commandSucceeded(started)` → `waitForAgentStartRetry` → start again → `agent_start_failed`) stays immediately after the first `agentStart` and before ownership persist. `deliverGeneratedPromptOnce` covers the distinct case where start already succeeded and the session is gone before the first prompt.

### Fresh main worker (`s<N>-<step>`)

Create ownership with versioned `pending`. After the one accepted standard or review prompt, `awaitPersistedPromptActivation` atomically advances `pending → activating`, persists, and runs the bounded activation guard. It advances `activating → delivered` only on proof.

### Fresh rem worker (`r<N>-<step>`)

Use the same versioned state transitions for standard and review remediation workers. Activation exhaustion persists `pending` before returning `prompt_pending`.

### Activating resume

Before retained-worker settlement, scan the current owned worker. For `activating`, validate ownership and re-enter `awaitInitialPromptActivation` without generating or submitting a prompt. If activation succeeds, persist `delivered` and continue the existing standard/review/remediation observation path. If it exhausts, persist `pending`, retain the pane, and stop with `prompt_pending`.

Track review workers resumed through this guard for the invocation so the retained review path observes evidence without invoking `submitReviewProtocol` again.

### State validation and migration

Checkpoint writes accept only `pending`, `activating`, and `delivered`. Version 2 identifies checkpoints written by the activation-safe state machine. On startup, unversioned `pending` is versioned in place and unversioned `delivered` migrates to versioned `activating`; missing delivery state remains legacy unknown and is never interpreted as permission to re-prompt.

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| **A: Remove `com.nmg-sdlc.run` append** | Stop empty-session settlement by deleting the session_start entry | Smaller execute change | Drops run provenance; issue forbids this | Rejected |
| **B: Treat pre-prompt idle as success** | Skip missing_handoff when no prompt was sent | Avoids false fail | Abandons the step with no work | Rejected |
| **C: Prove live session, prompt once, then observe** | Retry start only when gone; never double-prompt a live session | Matches AC1/AC2 | Live mutations stay on start-then-prompt workers | **Selected** |

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Execute controller | Jest with injected `herdr` | `scripts/__tests__/sdlc-execute.test.mjs` |
| Feature | Gherkin @SCN001–@SCN002 @regression | this package; Jest is executable evidence |

---

## Open Questions

- None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #347 | 2026-08-31 | Initial defect report |
