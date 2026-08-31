# Design: Add explicit recovery for confirmed stale controller leases

**Issue**: #328
**Date**: 2026-08-30
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/291-enforce-one-controller-writer-and-close-stale-workers/
---

## Overview

Add an explicit, fail-closed reclaim path for `.omp/sdlc/controller.lock` when `/sdlc-execute` is invoked with `--recover-stale`. Reclaim is allowed only for the current checkpoint `runId`, and only after two independent observations prove the recorded owner is gone: `process.kill(pid, 0)` returns `ESRCH`, and a successful Herdr `agent list` contains no agent whose pane id equals `controllerPaneId`. Live, unknown, malformed, and foreign leases stay `controller_lease_held` with unchanged bytes.

Reuse `scripts/sdlc-controller-lease.mjs` and the existing `wx` acquire in `runExecute`. Do not change lease schema (`schemaVersion: 1`, `projectRoot`, `runId`, `controllerPaneId`, `pid`, `startedAt`). Do not change worker ownership or `--retain-worker`.

## Architecture

```
parseArgs(--recover-stale?)
  -> existing Herdr / gh / issue / dependency preflight
  -> controllerRunId = valid checkpoint runId or new UUID
  -> if recoverStale: reclaimStaleControllerLease(runId, pid probe, agent list)
       ENOENT -> continue
       confirmed stale -> unlink matching bytes; stdout line; continue
       otherwise -> status 1, stderr controller_lease_held
  -> acquireControllerLease (existing wx)
  -> existing owned-worker execute loop
```

## API / Interface Changes

| Method | Type | Auth | Purpose |
|--------|------|------|---------|
| `parseArgs(input)` | Modify | N/A | Accept `--recover-stale` once; optional `recoverStale: true` |
| `reclaimStaleControllerLease({ projectRoot, runId, processApi, listAgents })` | New | N/A | Confirm stale same-run lease and unlink only unchanged bytes |
| `/sdlc-execute [--retain-worker] [--recover-stale] [#N ...]` | Modify | Herdr session | User-visible recovery flag |

Usage string: `Usage: /sdlc-execute [--retain-worker] [--recover-stale] [#N ...]`

Successful reclaim stdout line (exact): `Reclaimed stale controller lease.`

Failure reason code (unchanged): `controller_lease_held`

## Observation rules

PID:

- Call `processApi.kill(pid, 0)` only.
- `ESRCH` → absent.
- Return without throw → live → held.
- Any other throw → unknown → held.

Pane:

- Call `listAgents()`. Throw or non-success status → unknown → held.
- Parse agents as a real array: the value itself if already an array, else `parseCommandOutput` top-level array, `result.agents`, or `agents`. If none of those is an array → unknown → held. Do not treat missing parse as `[]`.
- Pane present if any agent has `String(pane_id ?? paneId) === String(lease.controllerPaneId)`.
- Successful list without that pane → absent.
- Do not use `workerStillPresent` (false on catch).

Atomic unlink:

- Snapshot UTF-8 bytes after the valid read used for observation.
- After both absences, re-read bytes; inequality → held, no unlink.
- Equality → `unlinkSync`. Unlink failure → held.
- Never write the snapshot back. Never `openSync`/`writeFileSync` during reclaim.

`runExecute` wiring:

- Call reclaim only when `parsedArgs.recoverStale` is true, immediately before the existing `acquireControllerLease` at the current site in `runExecute` (after preflight and `controllerRunId` assignment).
- Pass `cwd`, `controllerRunId`, `processApi`, and a wrapper over `herdrApi.listAgents`.
- `{ reclaimed: true }` appends the exact stdout line, then acquire.
- `{ reclaimed: false }` (no lease) skips the stdout line and acquire as today.
- Throw → `{ status: 1, stdout: '', stderr: 'controller_lease_held\n' }` before mutation.

No lease schema, storage, or UI component changes.

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Lease module | Jest | Absent PID+pane reclaim; live PID; live pane; ESRCH-only PID; listing failure; unparseable list; foreign runId; malformed JSON; byte change before unlink; no restore after change |
| Execute controller | Jest | `--recover-stale` parse; duplicate flag usage; reclaim then continue; held paths leave run/handoff bytes and start no workers; without flag a dead-looking lease still held; `--retain-worker` still retains independently |
| Workflow text | Existing prompt/workflow contracts | Flag accepted and forwarded |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #328 | 2026-08-30 | Initial feature spec |
