# Design: Stop the /sdlc-execute controller busy-waiting while a stage worker waits on a background command

**Issue**: #550
**Date**: 2026-11-13
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/546-sdlc-execute-stop-losing-time-to-idle-workers-restarts-and-truncated-gate-evidence/

## Overview

The wait on a settled worker behind its marker asks the host for the worker's next turn instead of asking whether it is working. The host's `started` condition already exists (#546): an active status, or activity recorded after a mark. One optional argument lets the same wait end when the marker or the handoff changes.

## Architecture

### Controller wait (`scripts/sdlc-execute.mjs`, `awaitTurnEnd`)

- Before reading the handoff, read the worker's activity mark with `activityMark(host.activity(agentId))`. Reading the mark first means a turn that starts after either read ends the wait at once.
- While the worker is settled and the marker exists, call `waitFor({ until: 'started', since: mark, timeoutMs: RESUME_POLL_MS, changed })`.
- `changed` returns true when the waiting marker is gone or a fresh handoff exists. A read error counts as changed, so the loop re-observes instead of waiting out the bound.
- After each wait the loop takes a new mark and re-observes the handoff and worker state, exactly as before. A removed marker falls through to the existing reminder and stop handling.
- Check-ins keep running: `waitFor` is the existing sliced wait that issues them.

### Host wait (`scripts/sdlc-execute-host.mjs`, `wait`)

- `wait({ agentId, until, timeoutMs, since, changed })` accepts an optional `changed` function, checked at every poll. The wait returns `{ timedOut: false }` when the `until` condition holds or `changed()` returns true.
- Every poll that does not end the wait sleeps for `min(POLL_MS, time left)`, as before. No constant is added.
- `until: 'working'` is unchanged: it still returns immediately for a settled worker.

## Error and State Paths

| Path | Behavior |
|------|----------|
| Worker stays idle, marker unchanged | The wait sleeps one host poll per iteration and times out after `RESUME_POLL_MS`; the loop waits again |
| Worker starts a new turn | `started` holds within one host poll; the loop waits for the turn to settle and reads the handoff |
| Marker removed while idle | `changed` ends the wait; the reminder or stop handling runs |
| Fresh handoff written without a new turn being observed | `changed` ends the wait; the handoff is returned |
| Marker or handoff unreadable | `changed` returns true; the loop re-observes |
| Supervising-session heartbeat stale | `assertAlive` throws from the host wait, as before |

## API / Interface Changes

| Interface | Change |
|-----------|--------|
| `createFileHost().wait` | New optional `changed: () => boolean` argument |

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Wait for `started` with a change predicate | Selected | Reuses the #546 condition and the existing poll interval |
| Make `until: 'working'` block for a settled worker | Rejected | #538 relies on it returning at once; out of scope |
| Sleep in the controller loop | Rejected | Adds a timing constant and delays observing the next turn |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #550 | 2026-11-13 | Initial defect design |
