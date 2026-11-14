# Tasks: Stop the /sdlc-execute controller busy-waiting while a stage worker waits on a background command

**Issue**: #550
**Date**: 2026-11-13
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/546-sdlc-execute-stop-losing-time-to-idle-workers-restarts-and-truncated-gate-evidence/

## Implementation Tasks

### T001: Let the host wait end on a caller-supplied change

**File(s)**: `scripts/sdlc-execute-host.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1/FR2: `wait` accepts an optional `changed` function checked at every poll, and still sleeps `min(POLL_MS, time left)` on every poll that does not end the wait
- AC4: `wait({ until: 'working' })` still returns immediately for a settled worker

### T002: Wait for the worker's next turn behind a waiting marker

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR1/AC1: `awaitTurnEnd` waits with `until: 'started'`, the activity mark, `RESUME_POLL_MS`, and a `changed` predicate for the marker and handoff
- AC2/AC3/AC4: a new turn, a fresh handoff, a removed marker, check-ins, and the reminder and stop handling behave as before

### T003: Regression tests for the bounded wait

**File(s)**: `scripts/__tests__/execute-host.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- FR3/AC1: with an injected clock and sleep, a settled worker behind its marker is polled a bounded number of times before the resume bound, and every poll is followed by a sleep
- AC2: a new turn and a fresh handoff are observed within one host poll
- AC4: `until: 'working'` on a settled worker returns with zero sleeps; a removed marker ends the wait
- `cd scripts && npm test` exits 0

### T004: Add the CHANGELOG entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- The change has a `### Fixed` bullet ending `(#550)`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #550 | 2026-11-13 | Initial defect tasks |
