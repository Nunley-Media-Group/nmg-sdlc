# Tasks: Headless /sdlc-execute exits mid-gate when a stage worker waits on a background command

**Issue**: #564
**Date**: 2026-11-18
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/550-stop-the-sdlc-execute-controller-busy-waiting-while-a-stage-worker-waits-on-a-background-command/

## Implementation Tasks

### T001: Keep a headless session alive while the run is unfinished

**File(s)**: `hooks/register.ts`, `src/execute-host.mjs`, `scripts/sdlc-execute-supervisor.mjs`, `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1/AC1: in a headless run, a main-loop stop is blocked with the `headlessHoldNotice` text while the session's daemon is alive and no terminal result is recorded. The text names the exact `wait --session <id> --after <seq> --hold` command.
- A TUI run, a run with a recorded terminal result, and a run whose daemon is gone are not blocked.
- FR2: `wait --hold` does not return because `worker.json` exists. It returns on a pending report, the terminal result, daemon loss, or `MAX_SESSION_WAIT_MS`. A `wait` without `--hold` behaves as before.

### T002: End the supervisor and controller when the session is lost

**File(s)**: `scripts/sdlc-execute-supervisor.mjs`, `scripts/sdlc-shared-state.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR3/AC2: after the run yields, a session heartbeat that was seen and is now stale beyond `HOST_HEARTBEAT_MS` cancels the run with `supervising_session_lost`.
- That cancellation terminates the controller process group and releases `.nmg-sdlc/controller.lock`. It removes the controller pid's merge-queue entries and records the terminal result `/sdlc-execute stopped: supervising_session_lost`.
- A fresh heartbeat, or one never seen, does not cancel the run.

### T003: Rerun a gate cut off by a lost session

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR4/AC3: on resume, an artifact whose non-passing required checks are all `incomplete` and none `failed` dispatches verify at the reviewed head. No failure is recorded, `needsImplement` stays unset, and no `Revert "feat: deliver issue #N"` commit is created or pushed.
- An artifact with any `failed` required check keeps its existing implement routing.

### T004: Document the headless hold contract

**File(s)**: `workflows/execute/WORKFLOW.md`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- FR5: `Subagent turns` says to run a hooks-module hold notice's command as printed.
- `Headless runs` says the session stays alive until the controller records its result, and that a lost session ends the run with `supervising_session_lost`.

### T005: Add behavioral regression coverage

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-execute-supervisor.test.mjs`, `scripts/__tests__/execute-host.test.mjs`, `scripts/__tests__/execute-goal.test.mjs`
**Type**: Modify
**Depends**: T001, T002, T003, T004
**Acceptance**:
- AC1:
  - `awaitSession` with `hold: true` keeps waiting while `worker.json` exists, and returns the next report or terminal result.
  - Without `hold`, it still returns `NMG_SDLC_EXECUTE_WORKER`.
  - `headlessHoldNotice` text names the exact command.
  - The hooks module blocks a headless main-loop stop for a live, unfinished session, and does not block in the TUI or after the result is recorded.
- AC2:
  - A yielded daemon whose session heartbeat goes stale terminates its controller, releases the controller lease, and removes the controller's merge-queue entry.
  - It records `supervising_session_lost`, after which the lease can be acquired again.
  - A fresh heartbeat keeps the run going.
- AC3:
  - Resume with an all-`incomplete` gate artifact dispatches verify at the same head, with no revert commit and no implement dispatch.
  - A `failed` check still routes to implement.
- `cd scripts && npm test` exits 0.

### T006: Add the CHANGELOG entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T005
**Acceptance**:
- `[Unreleased]` has a bullet under `### Fixed` describing the headless keep-alive, the session-loss cleanup, and the cut-off gate rerun, ending with `(#564)`.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #564 | 2026-11-18 | Initial defect tasks |
