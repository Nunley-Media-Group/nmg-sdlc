# Defect Report: Controller stalls waiting on a finished worker's background commands

**Issue**: #574
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/546-sdlc-execute-stop-losing-time-to-idle-workers-restarts-and-truncated-gate-evidence/

## Reproduction

1. Run `/sdlc-execute #N` so that a stage worker starts a `Bash` command that moves to the background (`run_in_background` or the Bash timeout).
2. Let that command exit, and let the worker write its handoff and end its turn (`idle` or `completed`).
3. Observe the controller's wait for that stage: the worker's activity record still lists the command under `background`, and the stage report is never produced until the worker is prompted to take another turn.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Once a settled worker's tracked background commands have exited, the controller reconciles them and routes the next step without another worker turn. |
| **Actual** | Tracked background commands are cleared only when the worker starts another turn, so a finished worker's exited commands hold the stage indefinitely. |

## Acceptance Criteria

### AC1: A finished worker's exited background commands do not block routing

**Given** a stage worker that has written its handoff and settled, and whose background commands have all exited
**When** the controller waits for that stage
**Then** it routes the next step without the worker being prompted again

### AC2: A still-running background command still blocks

**Given** a worker whose background command is still running
**When** the controller waits
**Then** it keeps waiting until that command exits

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | When a host stop event reports the session's in-flight background tasks, the hooks module removes from each tracked stage worker's activity record every `background` entry whose `taskId` is absent from that list. | Must |
| FR2 | An entry whose `taskId` is present in the reported list is kept, and a stop event that reports no in-flight list leaves every entry unchanged. | Must |
| FR3 | The controller's settle wait returns for a settled worker as soon as its activity record lists no background command and the git index is unlocked, without requiring a new worker turn. | Must |
| FR4 | Reconciliation never changes the stop event's outcome. | Must |

## Out of Scope

- Changing how background commands are recorded when they start.
- Changing the waiting-marker or reminder flow in `awaitTurnEnd`.
- The headless stop hold and cut-off gate handling owned by #564, and the settled-worker stop confirmation owned by #567.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #574 | 2026-11-19 | Initial defect report |
