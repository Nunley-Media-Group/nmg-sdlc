# Requirements: Stop the /sdlc-execute controller busy-waiting while a stage worker waits on a background command

**Issue**: #550
**Date**: 2026-11-13
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/546-sdlc-execute-stop-losing-time-to-idle-workers-restarts-and-truncated-gate-evidence/

## User Story

**As a** developer running `/sdlc-execute`
**I want** the controller to block between polls while a stage worker waits behind its `.waiting` marker
**So that** a long background command, such as the registered gate, does not cost a full CPU core per execute session

## Background

A stage worker that starts a long background command writes `.nmg-sdlc/handoffs/<N>-<step>.json.waiting` and ends its turn. Its agent record becomes `idle`.

- In `scripts/sdlc-execute.mjs`, the worker-handoff wait loops while the worker is settled and the marker exists, calling `waitFor({ until: 'working', timeoutMs: RESUME_POLL_MS })`.
- In `scripts/sdlc-execute-host.mjs`, `wait({ until: 'working' })` is satisfied by any status other than `pending`. Since #538 that deliberately includes a settled worker, so the call returns at once with no sleep.
- The 60-second `RESUME_POLL_MS` therefore never applies. The loop re-reads the handoff file and the agent record continuously, at roughly 80–100% of one core for the whole background command (116 CPU-minutes over a 2h52m run was observed).

## Acceptance Criteria

### AC1: A settled worker behind a waiting marker does not spin the controller

**Given** a dispatched stage worker whose agent record is `idle` with no fresh handoff and a waiting marker present, and whose record does not change
**When** the controller waits for that worker to resume
**Then** every host poll in that wait is followed by a sleep of at least the host poll interval
**And** the number of agent-record polls before the 60-second resume bound elapses is bounded by that bound divided by the host poll interval, plus a small constant

### AC2: The worker's next turn is still observed promptly

**Given** the same waiting state
**When** the worker starts a new turn (its activity time advances or its status becomes active) and later writes a fresh handoff
**Then** the controller observes the resumed turn within one host poll slice and returns that handoff exactly as before

### AC3: Check-ins continue during the wait

**Given** a worker waiting behind its marker for longer than the check-in interval
**When** the interval elapses
**Then** the controller issues the check-in report with the waiting marker's command and age, as before

### AC4: Existing settle and reminder behavior is preserved

**Given** a settled worker whose marker is removed, or a settled worker with no marker, or a call to `wait({ until: 'working' })` on an already-settled worker
**When** the controller evaluates it
**Then** a removed marker still leads to reminder or stop handling as before
**And** `wait({ until: 'working' })` still returns immediately for a settled worker

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | While a settled worker has a waiting marker, the controller's wait returns only when the worker starts a new turn after the last observed activity, the marker or handoff changes, the 60-second resume bound elapses, or the heartbeat goes stale. It never returns immediately for an unchanged settled worker. | Must |
| FR2 | The fix reuses the existing host poll interval and `RESUME_POLL_MS`; it adds no new timing constants. | Must |
| FR3 | A regression test drives a settled worker with a marker through the controller wait using an injected clock and sleep, and fails if polls are unbounded or occur without a sleep. | Must |

## Out of Scope

- Changing what `wait({ until: 'working' })` returns for an already-settled worker
- Reducing the 250 ms host poll or the 500 ms decision poll used elsewhere in the supervisor
- The idle-without-handoff, restart-routing, and gate-evidence truncation behaviors covered by #546

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #550 | 2026-11-13 | Initial defect spec |
