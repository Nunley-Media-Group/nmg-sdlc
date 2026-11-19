# Defect Report: Keep /sdlc-execute supervising after it stops a stage worker that already settled

**Issue**: #567
**Date**: 2026-11-18
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/491-make-the-sdlc-execute-session-an-opus-supervisor-that-inspects-and-steers-every-worker-stage/

## Reproduction

1. Run `/sdlc-execute #N` in the Claude Code TUI.
2. A stage subagent writes its handoff and ends its turn, so it is `idle` or no longer listed by the engine.
3. The controller decides `redispatch` or `halt` and asks the hooks module to stop that worker.
4. The hooks module answers `stop not confirmed … status idle` (or `status unknown`). The controller throws `worker_stop_failed` and exits.
5. In the same Claude session, run `node "<plugin-root>/scripts/sdlc-execute.mjs" supervise …` again. If that `Bash` call is backgrounded, its result carries no `NMG_SDLC_EXECUTE_SESSION` line. The hooks module never starts a bridge for the new session, and the controller exits `supervising_session_lost` after about 60 s.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Stopping a worker that has already settled is a no-op that counts as stopped. A controller started by rerunning `supervise` in the same Claude session gets hooks-module heartbeats and answered requests. |
| **Actual** | The controller crashes with `worker_stop_failed`. A supervise rerun whose `Bash` call is backgrounded is never bridged and exits `supervising_session_lost`. |

## Acceptance Criteria

### AC1: Stopping a settled worker does not crash the controller

**Given** a stage subagent that has written its handoff and settled
**When** the controller stops it
**Then** the controller treats the already-stopped worker as stopped and continues routing, without `worker_stop_failed`

### AC2: A resumed controller is supervised in the same session

**Given** a controller that exited in a Claude Code session
**When** the supervisor runs `supervise` again in that session
**Then** the new controller session receives hooks-module heartbeats and its spawn requests are answered, so it does not exit `supervising_session_lost`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | The hooks module answers a `stop` request with `ok: true` when, after `TaskStop`, the worker's listed status is not one of `ACTIVE_AGENT_STATUSES` (this includes `idle`), or when the engine no longer lists the worker. It refuses only while the worker is still `pending`, `running`, or `waiting`. A stopped worker's later tool calls and messages stay denied. | Must |
| FR2 | For every `Bash` call that runs `sdlc-execute.mjs supervise`, the hooks module chooses the execute session id before the command runs. It passes the id to the command as `--session <uuid>` and starts the bridge for that session before the command's result is known. Binding no longer depends on the command's foreground stdout. | Must |
| FR3 | `sdlc-execute.mjs supervise` accepts `--session <uuid>`. It accepts only a canonical UUID whose session directory does not exist yet, and uses it in place of a generated id. Without the argument it keeps generating one, so runs that bypass the hooks module are unchanged. | Must |
| FR4 | A bridge whose session directory does not exist yet keeps ticking, writing no heartbeat or other files, until supervise creates the directory. It stops the bridge only on a terminal `result.json`, on replacement by a newer session, or when the directory is still missing after `HOST_HEARTBEAT_MS`. | Must |
| FR5 | Regression tests cover AC1 and AC2. They include an `idle` worker, a worker missing from the agent list, a still-`running` worker that is refused, and a supervise rerun after a finished session whose `Bash` result is backgrounded with empty stdout. | Must |

## Out of Scope

- Changing when the controller decides to stop a worker
- Headless `claude -p` session lifetime (#564)
- Running several `/sdlc-execute` sessions in one Claude session at the same time

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #567 | 2026-11-18 | Initial defect report |
