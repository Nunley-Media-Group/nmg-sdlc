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
3. If the worker is gone after that first prompt and `hasPastedWorkerPrompt` is false and `appearsWorking` is false: treat as pre-prompt death. Reuse the same one-shot start retry from step 1 if it has not already been used in this call; then call `agentPrompt` exactly once on the new live session. If the retry start is unavailable or fails, return `{ delivered: false, reasonCode: 'agent_start_failed' }` or `'process_lost'` as in step 1. Never send a second generated prompt to a session that already received this invocation's prompt.
4. After a prompt call on a live session, keep the existing stall recovery only: if the handoff file is still missing and (`isPromptStalled(prompted)` or current state is idle/done): `hasPastedWorkerPrompt` → `retryPromptSubmission`; else `appearsWorking` → `waitForWorkerSettlement`; else stalled → `{ delivered: false, reasonCode: 'agent_prompt_stalled' }`. `retryPromptSubmission` and `waitForWorkerSettlement` are not generated prompts.
5. Re-read state with `agentState(herdr.agentGet(agentName))` after the prompt and any recovery. Return `{ delivered: true, state }`.

Callers: if `delivered === false`, `stopResult` with the returned `reasonCode` (never `missing_handoff` for pre-prompt death). If `delivered === true`, then `observeExpectedHandoff` as today. After proven delivery, missing handoff is still `missing_handoff` and `stopResult` still closes the owned pane unless `parsedArgs.retainWorker`.

The existing command-failure start retry (`!commandSucceeded(started)` → `waitForAgentStartRetry` → start again → `agent_start_failed`) stays immediately after the first `agentStart` and before ownership persist. `deliverGeneratedPromptOnce` covers the distinct case where start already succeeded and the session is gone before the first prompt.

### Fresh main worker (`s<N>-<step>`)

Replace the non-review block that currently samples state then calls `agentPrompt` (~2390, 2404–2437) with:

- keep review branch on `submitReviewProtocol`
- non-review: `const delivered = deliverGeneratedPromptOnce({ herdr: herdrApi, agentName, paneId, prompt, start: () => herdrApi.agentStart({ name: agentName, paneId, kind: 'omp' }) })`
- failed delivery → `stop` with `delivered.reasonCode`
- success → set `state = delivered.state`, then existing `latestMatchingRunState` + `observeExpectedHandoff`

Do not sample idle/done before the prompt and use that pre-prompt state as the stall predicate.

### Fresh rem worker (`r<N>-<step>`)

Same replacement in the `else` (no `remLive`) non-review branch after successful rem `agentStart`.

### Live rem resume

Delete the `if (remLive) { herdrApi.agentPrompt(...) ... }` block under `if (!reviewStep && !existsSync(handoffPath) && ['idle', 'done'].includes(state))`. After that condition, use the same recovery as retained `s<N>-<step>` resume (~2176–2202): if handoff missing, `hasPastedWorkerPrompt` → `retryPromptSubmission`; else `appearsWorking` → `waitForWorkerSettlement`; never `agentPrompt`. Then observe as today.

### Retained `s<N>-<step>` resume

Leave the non-review missing-handoff recovery at ~2176–2202 unchanged: no generated `agentPrompt`. That already satisfies FR3 for matching retained live workers.

### Review

Do not edit `submitReviewProtocol`, review resume, or review rem protocol prompts.

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
