# Defect Report: Headless /sdlc-execute exits mid-gate when a stage worker waits on a background command

**Issue**: #564
**Date**: 2026-11-18
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/550-stop-the-sdlc-execute-controller-busy-waiting-while-a-stage-worker-waits-on-a-background-command/

## Reproduction

1. Run `claude -p --session-id <uuid> --plugin-dir <checkout> --model opus "/sdlc-execute #N"` for an issue whose verify gate runs a long validation.
2. The `nmg-sdlc:execute-verify` subagent starts the validation as a background command, writes its `.waiting` marker, and ends its turn.
3. A check-in report arrives and the main loop answers `continue`. `decide` prints `NMG_SDLC_EXECUTE_WORKER`, and the main turn ends.
4. `claude -p` exits with status 0, because no turn is running. The worker and its background validation die with the session. The supervisor daemon and controller keep running with parent pid 1 and hold `.nmg-sdlc/controller.lock` and the merge-queue entry. `.nmg-sdlc/verification/<N>.json` is left `Incomplete`, with every non-passing required check `incomplete`.
5. Once the lease is cleared, run `/sdlc-execute #N` again. The controller sends the issue to implement, commits and pushes `Revert "feat: deliver issue #N"`, then fails `publication_subject_unproven` and ends in `supervisor_halt`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The headless session stays alive while a stage worker waits on its background command, and the run ends with its final result line. If the session is lost anyway, the supervisor and controller end and release the lease and the queue entry. A gate cut off by the lost session runs again at the reviewed head. |
| **Actual** | `claude -p` exits mid-gate. The supervisor and controller are orphaned and keep holding the lease and the queue entry. On resume, the cut-off gate is treated as a gate failure, which leads to a version revert and `supervisor_halt`. |

## Acceptance Criteria

### AC1: A headless run survives a worker waiting on a background command

**Given** `/sdlc-execute #N` running under `claude -p`
**When** a stage worker ends its turn behind its waiting marker while its background command runs
**Then** the session stays alive until the worker hands back, and the run continues to its final result line

### AC2: A lost session does not leave an orphaned controller

**Given** a headless session that exits before its final result
**When** the supervisor loses its session
**Then** the supervisor and controller end, releasing the controller lease and the merge-queue entry, and a later `/sdlc-execute #N` resumes from branch evidence

### AC3: A gate cut off by a lost session reruns the gate

**Given** a registered gate record whose non-passing required checks are all `incomplete` and none is `failed`
**When** `/sdlc-execute #N` resumes
**Then** it dispatches the gate again at the reviewed head instead of routing to implement
**And** it neither reverts the prepared version nor requires a new implement commit for that cut-off run

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | In a headless `/sdlc-execute` run, while the run's supervisor daemon is alive and no terminal result is recorded, the hooks module blocks the main loop's stop. The block reason tells the session to run a holding `wait` command that returns only on the next report, the terminal result, supervisor loss, or the bounded wait deadline. | Must |
| FR2 | `sdlc-execute.mjs wait` accepts `--hold`. With it, the wait does not return early because a stage worker is live. It returns on a pending report, the terminal result, daemon loss, or `MAX_SESSION_WAIT_MS`. | Must |
| FR3 | After the run yields, the supervisor daemon watches the session heartbeat. A heartbeat that was seen and is now stale beyond `HOST_HEARTBEAT_MS` cancels the run through the existing cancellation path. That path terminates the controller process group, releases the controller lease, removes the controller's merge-queue entries, and records the terminal result `/sdlc-execute stopped: supervising_session_lost`. | Must |
| FR4 | On resume, a registered gate whose non-passing required checks are all `incomplete` and none `failed` dispatches verify at the reviewed head. It records no gate failure, does not set implement routing, and does not run `revertPreparedVersion`. A gate with any `failed` required check keeps its existing implement routing. | Must |
| FR5 | The execute workflow documents the headless hold notice, and its Headless runs section matches the behavior. | Must |
| FR6 | Regression tests cover AC1–AC3 and keep the TUI path and the failed-check routing unchanged. | Must |

## Out of Scope

- TUI behavior, which keeps the session alive
- Changing how a gate with a `failed` required check is routed
- Changing the stage worker's `.waiting` marker contract

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #564 | 2026-11-18 | Initial defect report |
