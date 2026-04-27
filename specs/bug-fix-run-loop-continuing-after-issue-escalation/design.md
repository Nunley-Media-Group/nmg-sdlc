# Root Cause Analysis: Fix run-loop continuing after issue escalation

**Issue**: #131
**Date**: 2026-04-27
**Status**: Draft
**Author**: Codex

---

## Root Cause

The continuous runner treats a step result of `escalated` as a per-cycle break instead of a terminal runner result. In `main()`, the inner `for` loop logs `Escalation triggered. Stopping cycle.` and breaks, but the outer `while (!shuttingDown)` loop remains active. After the inner loop exits, the post-cycle branch clears bounce context, reads state, and can continue into the next `startIssue` selection.

The escalation helper also reinforces the fallthrough by resetting `currentStep` and `lastCompletedStep` for non-single-issue runs. That makes the post-cycle branch see a clean cycle boundary (`state.currentStep === 0`) and continue. This contradicts the run-loop failure contract that pipeline failures halt and do not proceed to the next issue, and it leaves operators recovering from the original failed issue while the same invocation may already have started another one.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-runner.mjs` | `escalate()` around lines 1747-1798 | Records escalation, saves partial work, logs the failed issue/branch, and currently resets state for another cycle in continuous mode. |
| `scripts/sdlc-runner.mjs` | `main()` around lines 2764-2863 | Owns the continuous outer loop and currently breaks only the inner step loop when a step returns `escalated`. |
| `scripts/sdlc-runner.mjs` | `runStep()` around lines 2473-2561 | Returns `escalated` from failed preconditions or blocked issue selection; successful `startIssue` pre-selection must remain unchanged. |
| `scripts/__tests__/sdlc-runner.test.mjs` | runner control-flow tests | Existing tests cover escalation tracking and empty queue handling, but not continuous-loop hard stop after a mid-cycle escalation. |

### Triggering Conditions

- The runner is in continuous mode (`$nmg-sdlc:run-loop` without a single issue number).
- A mid-cycle step returns `escalated`, such as an implement step that hits an unrecoverable pattern.
- At least one other open `automatable` issue remains after the escalated issue.
- The outer loop is still active and state has been reset enough to make the next cycle look eligible.

---

## Fix Strategy

### Approach

Make issue-level escalation terminal for the current runner invocation. When the main loop receives `result === 'escalated'`, it should set `shuttingDown = true`, remove unattended mode when the runner owns it, and break out so the outer loop exits instead of selecting another issue. The escalation diagnostic should continue to identify the failed issue and branch.

Keep the fix narrow: do not remove continuous mode, do not change successful merge continuation, and do not redesign issue selection. The change only distinguishes failed issue-level termination from clean cycle completion.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-runner.mjs` | Change `main()` handling of `result === 'escalated'` from inner-loop-only break to terminal shutdown for the current invocation. | Prevents the outer loop from reaching another `startIssue` after an issue escalation. |
| `scripts/sdlc-runner.mjs` | Preserve failed issue/branch recovery context instead of resetting state as if a clean cycle completed. | Keeps the escalated issue as the manual recovery target. |
| `scripts/__tests__/sdlc-runner.test.mjs` | Add a regression test that simulates continuous-mode escalation and asserts no subsequent `startIssue` selection occurs. | Locks AC1 and AC4. |
| `scripts/__tests__/sdlc-runner.test.mjs` | Add or update a positive-control test that successful merge completion still allows the next cycle. | Locks AC3 so the escalation fix does not disable continuous mode. |

### Blast Radius

- **Direct impact**: `scripts/sdlc-runner.mjs`, `scripts/__tests__/sdlc-runner.test.mjs`.
- **Indirect impact**: `$nmg-sdlc:run-loop` unattended sessions, `.codex/unattended-mode` cleanup, `.codex/sdlc-state.json` recovery state, and issue-selection behavior after clean merges.
- **Risk level**: Medium before regression coverage; Low after explicit negative and positive control tests.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Successful continuous mode stops after a clean merge. | Medium | Add a positive-control test that a successful merge path can continue to the next eligible issue. |
| Recovery state is over-cleaned and no longer identifies the failed issue or branch. | Medium | Preserve or explicitly log current issue and branch when escalation terminates the invocation. |
| Unattended mode is left behind after terminal escalation. | Low | Keep explicit cleanup in the terminal escalation path while preserving issue/branch diagnostics. |
| All-issues-blocked or no-issue terminal paths regress. | Low | Keep existing `done` and `haltFailureLoop` paths unchanged; run the existing runner tests. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Skip only the escalated issue and continue to the next eligible issue. | Preserve current `escalatedIssues` exclusion behavior and rely on the next cycle to avoid the same issue. | Rejected because the observed operator expectation is manual recovery on the failed issue, and continuing risks burying partial work under later issue activity. |
| Treat only some escalation reasons as terminal. | Inspect the escalation reason and continue for lower-risk categories. | Rejected because every issue-level escalation has already saved partial work and requested manual intervention; selective continuation would make recovery semantics harder to reason about. |
| Remove continuous mode. | Stop after every issue regardless of success or failure. | Rejected because successful continuous looping is explicitly in scope to preserve. |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal -- no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #131 | 2026-04-27 | Initial defect design |
