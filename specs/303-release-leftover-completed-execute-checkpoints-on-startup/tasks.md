# Tasks: Release Leftover Completed Execute Checkpoints on Startup

**Issue**: #303
**Date**: 2026-08-27
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/299-remove-completed-execute-runtime-checkpoints/

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Controller | 1 | [ ] |
| Regression coverage | 1 | [ ] |
| Verification | 1 | [ ] |
| **Total** | **3** | |

---

## Phase 1: Controller

### T001: Release Terminal Leftovers Before Identity Rejection

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] A different requested issue list triggers existing owned cleanup only when the persisted run is fully completed and terminal.
- [ ] Successful cleanup continues through normal new-run initialization.
- [ ] Cleanup failure and every nonterminal mismatch retain exact `Run checkpoint identity mismatch` stderr and start no worker.
- [ ] Existing same-list resume and same-invocation finalize cleanup remain unchanged.

---

## Phase 2: Regression Coverage

### T002: Cover Startup Cleanup and Fail-Closed Boundaries

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] A pre-existing completed checkpoint with a different list releases `run.json`, run-owned handoffs, and worker provenance before starting the new list.
- [ ] In-progress, failed, and blocked/nonterminal mismatches preserve checkpoint bytes and supporting runtime and return exact mismatch stderr.
- [ ] An owned-artifact cleanup failure prevents the new queue from starting.
- [ ] Existing successful-finalize regression continues to pass.

---

## Phase 3: Verification

### T003: Verify the Changed Contract

**File(s)**: `scripts/__tests__/`, `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] Focused execute-controller tests pass.
- [ ] Full repository Jest suite passes with `--runInBand`.
- [ ] Repository verification and smoke gates declared in `steering/manifest.json` pass.
- [ ] Verification evidence records exact commands and outcomes.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #303 | 2026-08-27 | Initial defect tasks |
