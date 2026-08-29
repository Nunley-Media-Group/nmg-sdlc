# Root Cause Analysis: Keep observing live review workers after prompt-wait failure

**Issue**: #320
**Date**: 2026-08-29
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/292-select-review-base-without-interactive-picker-parsing/

---

## Root Cause

`scripts/sdlc-execute.mjs` centralizes fresh, remediation-resume, and retained-review submission in `submitReviewProtocol`. The function calls `herdr.agentPrompt({ name, prompt })` and immediately returns `{ handoff: null, reasonCode: 'review_failed' }` whenever the result is non-success and does not contain `agent_prompt_stalled`.

That early return runs before `readExpectedHandoff` and before `observeReviewHandoff`. It therefore ignores two stronger facts: the prompt call may already have produced a valid artifact-backed handoff, or the exact owned review worker may still be registered and able to finish. `observeReviewHandoff` already implements the correct lifecycle boundary: repeatedly validate the expected handoff while `workerStillPresent` matches both agent name and pane, then return `process_lost` if that exact worker disappears.

Issue #292 intentionally made `agent_prompt_stalled` handoff-driven while classifying every other prompt error as immediate `review_failed`. The observed #311 failure proves command status alone is not authoritative for any live review worker. The handoff and exact worker registration must remain authoritative without broadening stalled-prompt keyboard recovery.

### Affected Code

| File | Role |
|------|------|
| `scripts/sdlc-execute.mjs` | `submitReviewProtocol` returns before checking handoff or worker presence; `observeReviewHandoff` already supplies the required handoff-or-disappearance loop. |
| `scripts/__tests__/sdlc-execute.test.mjs` | Existing SCN006 locks immediate non-stall failure, including rejection of a passed handoff written during the failed prompt call; retained-worker and disappearance paths need the corrected regression contract. |

### Triggering Conditions

- The current step is `review1` or `review2`.
- `herdr agent prompt --wait` returns non-success without `agent_prompt_stalled`.
- The exact controller-owned review worker remains registered under the expected agent name and pane.
- The review handoff is absent at the instant the prompt command returns but can appear later.

These conditions were missed because issue #292 distinguished only command success vs `agent_prompt_stalled`; its direct-failure regression did not model a non-stall command failure while the worker remained live.

---

## Fix Strategy

### Approach

Reorder `submitReviewProtocol` so it reads and validates the expected handoff immediately after the prompt command, regardless of command status. If a valid handoff exists, return it. For a non-stall failure with no handoff, return `review_failed` only when `workerStillPresent` says the exact agent-and-pane pair is absent. When that worker remains present, fall through to the existing `observeReviewHandoff` loop.

Keep the `agent_prompt_stalled` branch unchanged: only a stalled result may inspect the pasted prompt and send one Enter. A non-stall failure never sends keys. If the live worker later disappears without evidence, `observeReviewHandoff` returns `process_lost`; the controller's existing stop and pane-ownership rules remain responsible for cleanup. Do not add a second polling loop, timeout, worker recreation, or new exported helper.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-execute.mjs` | Move artifact-backed handoff validation ahead of non-stall failure classification; gate `review_failed` on absence of the exact owned worker; otherwise reuse `observeReviewHandoff`. | Makes worker/handoff evidence authoritative while preserving fail-closed pane loss. |
| `scripts/__tests__/sdlc-execute.test.mjs` | Replace the obsolete immediate-failure expectation with live-worker, already-written-handoff, retained-worker, and worker-disappearance regressions; preserve missing-base and stalled-prompt cases. | Covers AC1 and AC2 across the shared protocol's real controller entry paths. |

### Blast Radius

- **Direct impact**: `submitReviewProtocol` in `scripts/sdlc-execute.mjs` and its controller fixture tests.
- **Indirect impact**: fresh `review1`/`review2`, live remediation review continuation, and retained review resume all call the same helper. Non-review workers do not use it.
- **Risk level**: Low — the existing handoff validator, exact worker identity check, observation loop, stop path, and stalled-prompt recovery remain unchanged.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A truly failed review prompt leaves execute observing forever | Low | Observation continues only while the exact owned worker remains registered; disappearance returns `process_lost`. This matches the handoff-driven review lifecycle. |
| Non-stall failures accidentally trigger one-Enter recovery | Low | Keep `hasPastedWorkerPrompt` and `agentSendKeys` inside the existing `isPromptStalled` branch; assert no send keys in regressions. |
| A valid handoff produced during a failed wait is discarded | Low | Read and validate the handoff before command-status classification; add direct regression coverage. |
| Retained-worker resume starts a duplicate review worker | Low | Exercise the retained matching worker path and assert no `agentStart` for that review step. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Treat every prompt failure like `agent_prompt_stalled` | Inspect detection and possibly send Enter | A non-stall failure does not prove a pasted-but-unsubmitted prompt; sending keys could interfere with live work. |
| Retry the complete review prompt | Submit the controller-owned prompt again | Risks duplicate reviews and violates the one-prompt protocol from issue #292. |
| Add a timeout to review observation | Stop after an arbitrary interval | The existing contract intentionally uses valid handoff or confirmed worker disappearance, not guessed completion timing. |

---

## Validation Checklist

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #320 | 2026-08-29 | Initial defect report |
