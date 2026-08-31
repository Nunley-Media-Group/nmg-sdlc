# Tasks: Permit same-pane restarted controller lease recovery

**Issue**: #339
**Date**: 2026-08-31
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/328-add-explicit-recovery-for-confirmed-stale-controller-leases/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Fix same-pane occupancy in reclaim and pass current pane from execute | [ ] |
| T002 | Add same-pane success and fail-closed regressions | [ ] |
| T003 | Verify no regressions | [ ] |

---

### T001: Fix the Defect

**File(s)**: `scripts/sdlc-controller-lease.mjs`, `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `reclaimStaleControllerLease` accepts optional `controllerPaneId` and applies the occupancy table in design.md
- [ ] Same-run `ESRCH` lease with current pane equal to recorded pane and exactly one listed occupant on that pane returns `{ reclaimed: true, record }` and unlinks the lease
- [ ] Same-run `ESRCH` lease with occupancy `0` still reclaims (issue #328)
- [ ] Occupancy `1` with missing/empty/unequal current pane, occupancy `> 1`, unreadable recorded-pane identity, live PID, unknown PID, failed/unparseable list, foreign `runId`, malformed lease, and changed bytes each throw `controller_lease_held` and leave the latest lease bytes unchanged
- [ ] `runExecute` passes `controllerPaneId: env.HERDR_PANE_ID` into reclaim
- [ ] Reclaim never calls `kill` with a non-zero signal, never restores snapshot bytes, never closes a pane, and never deletes anything except the byte-equal lease unlink
- [ ] Ordinary acquire, `--retain-worker`, and execute without `--recover-stale` are unchanged

**Notes**: Follow the occupancy table in design.md. Do not edit workflow-bundled files.

### T002: Add Regression Test

**File(s)**: `scripts/__tests__/sdlc-controller-lease.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Helper: reclaim succeeds for `controllerPaneId: 'w14:p1'`, recorded pane `w14:p1`, `kill(..., 0)` → `ESRCH`, `listAgents` returning `[{ pane_id: 'w14:p1' }]`
- [ ] Helper: existing `dead-pane` plus `other-pane` list still reclaims
- [ ] Helper fail rows cover live PID, `EPERM`, listed recorded pane with current pane `main-pane`, duplicate recorded-pane agents, disagreeing `pane_id`/`paneId` when one equals the recorded pane, failed list, unparseable list, foreign `runId`, malformed JSON, and changed bytes
- [ ] Execute: `--recover-stale` with env `HERDR_PANE_ID: 'w14:p1'`, lease pane `w14:p1`, listed occupant `w14:p1`, and `ESRCH` continues startup and stdout includes `Reclaimed stale controller lease.\n`
- [ ] Execute: listed recorded pane `w14:p1` with env `HERDR_PANE_ID: 'main-pane'` returns status 1, stderr `controller_lease_held\n`, unchanged lease/run/handoff bytes, and no worker start
- [ ] Execute: existing `dead-controller` pane-absent success, live pid / failed listing / malformed / foreign run table, changed-bytes, and no-flag no-probe tests still pass
- [ ] Scenarios are tagged `@regression` in `feature.gherkin`; Jest is the executable evidence

### T003: Verify No Regressions

**File(s)**: `scripts/__tests__/sdlc-controller-lease.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Verify (no file changes)
**Depends**: T001, T002
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/sdlc-controller-lease.test.mjs __tests__/sdlc-execute.test.mjs` exits 0
- [ ] Issue #328 pane-absent reclaim assertions still pass
- [ ] No acquire, `--retain-worker`, or no-flag recover-stale behavior change

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #339 | 2026-08-31 | Initial defect tasks |
