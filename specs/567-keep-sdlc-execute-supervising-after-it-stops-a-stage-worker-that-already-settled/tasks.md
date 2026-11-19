# Tasks: Keep /sdlc-execute supervising after it stops a stage worker that already settled

**Issue**: #567
**Date**: 2026-11-18
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/491-make-the-sdlc-execute-session-an-opus-supervisor-that-inspects-and-steers-every-worker-stage/

## Implementation Tasks

### T001: Confirm the stop of a settled worker

**File(s)**: `hooks/register.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1/AC1: a `stop` request for a worker listed `idle`, `completed`, `failed` or `killed`, or no longer listed, is answered `ok: true`.
- A worker still `pending`, `running` or `waiting` after `TaskStop` is refused with `stop not confirmed`.
- A stopped worker's later tool calls and messages are denied.
- An unlisted worker's local record keeps its settled status.

### T002: Let the hooks module assign the supervise session id

**File(s)**: `hooks/register.ts`, `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR2/AC2: a supervise `Bash` command runs with an appended `--session <uuid>`. The bridge for that uuid starts before the command's result is known.
- A printed `NMG_SDLC_EXECUTE_SESSION` line naming a different session rebinds the bridge to the printed session.
- FR3: `supervise --session <uuid>` uses that id.
  - A non-UUID value exits non-zero with `invalid_session_id`.
  - An existing session directory exits non-zero with `session_exists`.
  - Without `--session`, supervise generates an id as before.

### T003: Keep a new bridge alive until its session directory exists

**File(s)**: `hooks/register.ts`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- FR4: while the session directory is missing and `HOST_HEARTBEAT_MS` has not passed since the bridge started, `tick` neither stops the bridge nor creates the directory.
- Once the directory appears, `host.json` is written on the next tick and requests are answered.
- If the directory is still missing after `HOST_HEARTBEAT_MS`, the bridge stops.

### T004: Add behavioral regression coverage

**File(s)**: `hooks/register.test.ts`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- AC1:
  - In `register.test.ts`, a stop for an `idle` worker and for an unlisted worker answers `ok: true` and keeps the worker blocked. A `running` worker is still refused.
  - The fake `TaskStop` leaves a non-running agent unchanged.
- AC2:
  - In `register.test.ts`, run a supervise call after an earlier session finished, with a `Bash` result that has a `backgroundTaskId` and empty stdout. The test passes when:
    - the bridge is bound to the injected session id;
    - `host.json` is written once the directory appears;
    - a spawn request is answered.
  - `sdlc-execute.test.mjs` covers `supervise --session` acceptance, `invalid_session_id` and `session_exists`.
- `cd scripts && npm test` exits 0, and the `hooks/register.test.ts` suite passes under the repository's test command.

### T005: Add the CHANGELOG entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T004
**Acceptance**:
- `[Unreleased]` has a bullet under `### Fixed` describing settled-worker stops and same-session supervise reruns, ending with `(#567)`.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #567 | 2026-11-18 | Initial defect tasks |
