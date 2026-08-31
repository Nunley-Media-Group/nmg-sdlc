# Tasks: Add explicit recovery for confirmed stale controller leases

**Issue**: #328
**Date**: 2026-08-30
**Status**: Approved
**Author**: NMG
**Related Spec**: Existing controller lease and worker ownership contract

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Add explicit dual-evidence stale lease recovery | [ ] |
| T002 | Add recovery and preservation regressions | [ ] |
| T003 | Synchronize execute interfaces and public documentation | [ ] |
| T004 | Verify the scoped recovery contract | [ ] |

---

### T001: Add explicit dual-evidence stale lease recovery

**File(s)**: `scripts/sdlc-controller-lease.mjs`, `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Parse `--recover-stale` once among existing issue tokens and retain the stable usage behavior for duplicates and unknown tokens.
- [ ] Recover only when the current checkpoint and lease identify the same run in the canonical project.
- [ ] Require definite PID absence and a successful Herdr listing proving absence of the exact recorded controller pane.
- [ ] Preserve live, unknown, malformed, unreadable, and foreign leases with `controller_lease_held` before worker or protected-state mutation.
- [ ] Recheck the lease snapshot and protect changed or newly-created leases with an atomic no-clobber reclaim/restore path.
- [ ] Keep normal controller acquisition, lifecycle cleanup, and `--retain-worker` behavior unchanged when recovery is not explicitly requested.

**Notes**: Reuse the existing lease record, process probe, Herdr adapter, run identity, and controller startup path. Recovery must not close panes or kill processes.

### T002: Add recovery and preservation regressions

**File(s)**: `scripts/__tests__/sdlc-controller-lease.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] A same-run lease with absent PID and absent exact controller pane is reclaimed and execute proceeds.
- [ ] Live and unknown PID results, live/unknown/malformed Herdr listings, malformed leases, and foreign runs fail with `controller_lease_held` while lease bytes and worker starts remain unchanged.
- [ ] A changed or newly-created lease observed during recovery is preserved and cannot be overwritten.
- [ ] Final PID and pane evidence is rechecked before reclaiming.
- [ ] Duplicate flag, checkpoint mismatch, no-flag, and `--retain-worker` behavior remains covered.
- [ ] Each acceptance criterion in `feature.gherkin` has deterministic Jest coverage.

### T003: Synchronize execute interfaces and public documentation

**File(s)**: `workflows/execute/WORKFLOW.md`, `workflows/execute/references/selection.md`, `commands/sdlc-execute.md`, `README.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] The workflow and generated command contract accepts and forwards `--recover-stale` only when explicitly supplied.
- [ ] Selection with no issue tokens removes both optional flags before choosing issues and restores them in the single run invocation.
- [ ] Public documentation states the exact same-run, absent-PID, absent-pane, fail-closed, and atomic-recovery boundaries.
- [ ] Existing default behavior and `--retain-worker` documentation remain accurate.

### T004: Verify the scoped recovery contract

**File(s)**: `scripts/__tests__/sdlc-controller-lease.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Verify (no file changes)
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/sdlc-controller-lease.test.mjs __tests__/sdlc-execute.test.mjs` exits 0.
- [ ] Recovery success, every held/unknown/malformed/foreign boundary, atomic lease protection, default execution, and retained-worker paths pass.
- [ ] Active workflow and generated command contracts remain synchronized.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #328 | 2026-08-30 | Initial feature spec |

---

## Validation Checklist

- [x] Tasks are focused on explicit recovery and do not reimplement the core ownership model.
- [x] Each task has a single responsibility and verifiable acceptance criteria.
- [x] Existing source and test paths are used.
- [x] Every acceptance criterion is mapped to deterministic coverage.
- [x] Default execution and `--retain-worker` regression coverage is explicit.
