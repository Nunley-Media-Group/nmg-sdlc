# Root Cause Analysis: Controller stalls waiting on a finished worker's background commands

**Issue**: #574
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/546-sdlc-execute-stop-losing-time-to-idle-workers-restarts-and-truncated-gate-evidence/

## Root Cause

The hooks module's `tool.call` hook adds each backgrounded worker `Bash` call to the worker's activity record through `recordBackgroundStart` (`src/execute-host.mjs`). The only path that removes those entries is `recordStepStart`, called from the `turn.step` hook. It clears `background` only when a settled worker begins another model step.

`settleCommits` in `scripts/sdlc-execute.mjs` holds the stage report while `record.background` is non-empty. For a settled worker it waits with `pause({ until: 'started', ... })`, that is, for a new turn. A worker that has written its handoff and settled takes no further turn. Its entries therefore persist after the commands exit, and the wait never ends until something prompts the worker again.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `src/execute-host.mjs` | `recordBackgroundStart`, `clearBackground`, `recordStepStart` | Background entries are cleared only on a new step |
| `hooks/register.ts` | `turn.step` and `tool.call` worker hooks; `workers`, `queueAgent`, `updateAgent` | Only a new worker step triggers clearing |
| `scripts/sdlc-execute.mjs` | `settleCommits` | Holds the stage report while `background` is non-empty |

## Fix Strategy

1. Add the Node-free helper `reconcileBackground(record, inFlight, at)` to `src/execute-host.mjs`:
   - When `inFlight` is an array, keep only the `record.background` entries whose `taskId` equals the `id` of an `inFlight` entry.
   - Set `updatedAt` to `at` only when an entry was dropped.
   - When `inFlight` is not an array, or nothing was dropped, return the record unchanged.
2. In `hooks/register.ts`, register `classic.SubagentStop` and `classic.Stop` handlers that read `e.background_tasks`:
   - `classic.SubagentStop` reconciles the worker whose id equals `e.agent_id`, when it is a tracked stage worker.
   - `classic.Stop` (the supervising main loop, whose turns end at every check-in report) reconciles every tracked stage worker.
   - Each update goes through the existing `queueAgent`/`updateAgent` path.
   - Each handler returns `next(e)` unchanged, so the stop outcome is never altered. A reconciliation failure is swallowed, as the other activity updates' failures are.
3. `settleCommits` needs no logic change. Each `CHECK_IN_SLICE_MS` pause re-reads the activity record, so it returns once the reconciled record lists no background command and the git index is unlocked. Update its comment to say that a settled worker's entries also clear when the host reports them no longer in flight.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `src/execute-host.mjs` | Add and export `reconcileBackground` | FR1, FR2 |
| `hooks/register.ts` | Import `reconcileBackground`; add `classic.SubagentStop` and `classic.Stop` reconciliation handlers that pass through `next(e)` | FR1, FR4, AC1 |
| `scripts/sdlc-execute.mjs` | Comment on `settleCommits` describing the new clearing path | FR3 |
| `scripts/__tests__/execute-host.test.mjs` | Unit tests for `reconcileBackground`; source-contract test for the two handlers | FR1, FR2, FR4 |
| `scripts/__tests__/sdlc-execute.test.mjs` | Controller tests for the settled-worker settle wait | AC1, AC2, FR3 |

## Blast Radius

- Only stage-worker activity records change, and only their `background` list and `updatedAt`.
- The `checkIn` stall heuristic and `activityRecord` read `background`. Both see an exited command removed sooner, which is the intended state.
- Stop events for sessions with no tracked workers do nothing.
- The existing step-start clearing remains.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Treat a settled worker's fresh handoff as final and ignore `background` | Rejected | It would release a stage while a command that may still commit is running, which violates AC2 |
| Have the controller send the settled worker an extra prompt | Rejected | It is the manual workaround the issue reports and spends a model turn |
| Reconcile against the host's reported in-flight background tasks at stop events | Selected | It uses the host's own task list, drops only exited commands, and needs no worker turn |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #574 | 2026-11-19 | Initial defect design |
