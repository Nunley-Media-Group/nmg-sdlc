# Root Cause Analysis: Permit same-pane restarted controller lease recovery

**Issue**: #339
**Date**: 2026-08-31
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/328-add-explicit-recovery-for-confirmed-stale-controller-leases/
---

## Root Cause

`reclaimStaleControllerLease` in `scripts/sdlc-controller-lease.mjs` proves the owner gone only when a successful agent list contains no agent whose `pane_id` or `paneId` equals `record.controllerPaneId`. After an OMP restart in that same main pane, the current invoker is listed on the recorded pane id, so the presence check never proves the owner gone and recovery throws `controller_lease_held`.

`runExecute` in `scripts/sdlc-execute.mjs` calls reclaim with `projectRoot`, `runId`, `processApi`, and `listAgents` only. It does not pass `env.HERDR_PANE_ID`, so reclaim cannot distinguish the current explicitly recovering controller pane from a foreign live owner.

Existing success coverage seeds `controllerPaneId: 'dead-pane'` or `'dead-controller'` and a list that omits that pane, with execute env `HERDR_PANE_ID: 'main-pane'`. That is the issue #328 pane-absent path, not same-pane restart.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-controller-lease.mjs` | `reclaimStaleControllerLease` occupancy `agents.some(...)` | Treats any listed recorded pane as a live foreign owner |
| `scripts/sdlc-execute.mjs` | `runExecute` `--recover-stale` reclaim call | Omits current `HERDR_PANE_ID` |
| `scripts/__tests__/sdlc-controller-lease.test.mjs` | reclaim success and `live pane` fail row | Covers pane absence, not same-pane recoverer |
| `scripts/__tests__/sdlc-execute.test.mjs` | `reclaims a confirmed stale same-run lease before normal startup` | Uses `dead-controller` absent from the list |

### Triggering Conditions

- Matching same-run lease with canonical project root
- Recorded PID conclusively `ESRCH` on `kill(pid, 0)`
- Recorded `controllerPaneId` still listed because the restarted controller occupies that pane
- Explicit `--recover-stale`
- These were not caught because tests stubbed the recorded pane as absent

---

## Fix Strategy

### Approach

Keep issue #328 observation rules for PID, parse, snapshot, and unlink. Replace only the pane-occupancy decision so a listed recorded pane is a current recoverer when `controllerPaneId` matches, and a foreign live owner otherwise. Pass `env.HERDR_PANE_ID` into reclaim. Do not change lease schema, acquire, release, `--retain-worker`, or silent recovery without `--recover-stale`.

No equivalent occupancy helper exists; keep the decision inside `reclaimStaleControllerLease`.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-controller-lease.mjs` | Extend `reclaimStaleControllerLease({ projectRoot, runId, processApi, listAgents, controllerPaneId })` with the occupancy rules below | Distinguishes current recoverer from foreign live owner without revoking pane-absent reclaim |
| `scripts/sdlc-execute.mjs` | Pass `controllerPaneId: env.HERDR_PANE_ID` into the existing `--recover-stale` reclaim call | Supplies the current pane identity reclaim now needs |
| `scripts/__tests__/sdlc-controller-lease.test.mjs` | Add same-pane success and foreign/ambiguous/unreadable fail rows; keep existing pane-absent success and fail table | FR5 regressions |
| `scripts/__tests__/sdlc-execute.test.mjs` | Add same-pane listed recoverer success and listed foreign-pane fail; keep existing `dead-controller` success | Prove the execute wiring |

### Occupancy rules

After the existing snapshot read, JSON parse, `validLease` + `runId` match, and `processApi.kill(record.pid, 0)` → `ESRCH` proof, parse agents with the existing `parseAgentList`. `null` parse, throw, or non-success list still throws `controller_lease_held`.

For each agent:

- If both `pane_id` and `paneId` are non-null and `String(pane_id) !== String(paneId)`, the agent is unreadable.
- Otherwise the agent pane id is `pane_id ?? paneId`.
- An agent occupies the recorded controller pane when that pane id is non-null, `String(paneId).length > 0`, and `String(paneId) === String(record.controllerPaneId)`.
- An unreadable agent whose `String(pane_id)` or `String(paneId)` equals `String(record.controllerPaneId)` is unreadable recorded-pane identity → throw `controller_lease_held`.
- Agents on other panes, including delivery workers, are not conflicting controller identity.

Let `occupants` be the agents that occupy the recorded controller pane.

| Occupants | Current `controllerPaneId` argument | Result |
|-----------|-------------------------------------|--------|
| `0` | any, including missing | Reclaim (issue #328 pane-absent path) |
| `1` | non-empty string and `String(controllerPaneId) === String(record.controllerPaneId)` | Reclaim (this issue) |
| `1` | missing, empty, or not equal to recorded pane | `controller_lease_held` (foreign pane / failed proof) |
| `> 1` | any | `controller_lease_held` (ambiguous / duplicate identity) |

Do not treat the whole agent list as conflicting merely because other panes exist. Do not use `workerStillPresent`. Do not call `kill` with a non-zero signal. Do not write, restore, close panes, or delete anything except the existing byte-equal `unlinkSync` of `.omp/sdlc/controller.lock`.

Atomic unlink, stdout line `Reclaimed stale controller lease.`, and fail stderr `controller_lease_held\n` stay exactly as issue #328.

`runExecute` reclaim call becomes:

```javascript
reclaimStaleControllerLease({
  projectRoot: cwd,
  runId: controllerRunId,
  processApi,
  listAgents: () => herdrApi.listAgents(),
  controllerPaneId: env.HERDR_PANE_ID,
});
```

### Blast Radius

- **Direct impact**: `reclaimStaleControllerLease` pane decision; `runExecute` reclaim arguments
- **Indirect impact**: existing `--recover-stale` tests; issue #328 pane-absent success must still pass
- **Risk level**: Low — acquire, release, retain-worker, and no-flag execute stay unchanged

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Revoking issue #328 pane-absent reclaim | Med | Occupancy `0` still reclaims; keep the existing `dead-pane` / `dead-controller` tests green |
| Treating listed workers on other panes as conflicting controllers | Med | Only recorded-pane occupants count |
| Stealing a live foreign owner on the recorded pane from another pane | Low | Occupancy `>= 1` with current pane unequal stays held |
| Duplicate agents on the recorded pane | Low | Occupancy `> 1` stays held |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Require current pane equality for every reclaim, including pane-absent | Narrow recovery to same-pane only | Revokes issue #328 AC1 |
| Ignore listed occupancy whenever PID is `ESRCH` | Reclaim even with a live listed owner | Weakens live-owner protection |
| Occupancy-aware reclaim with current pane passed in | Same-pane listed recoverer plus preserved pane-absent reclaim | Selected |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #339 | 2026-08-31 | Initial defect design |
