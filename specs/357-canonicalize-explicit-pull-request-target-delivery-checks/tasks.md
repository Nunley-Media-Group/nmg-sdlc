# Tasks: Canonicalize explicit pull_request_target delivery checks

**Issue**: #357
**Date**: 2026-09-03
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/284-resolve-missing-required-check-event-provenance/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Canonicalize verified explicit target events | [ ] |
| T002 | Add provenance regressions | [ ] |
| T003 | Verify delivery and compatibility | [ ] |

---

### T001: Canonicalize Verified Explicit Target Events

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Explicit `pull_request_target` canonicalizes only after linked Actions run head equality.
- [ ] Other explicit events remain unchanged.
- [ ] Missing, malformed, unreadable, and head-mismatched evidence remains fail-closed.
- [ ] Required and unfiltered checks remain in the snapshot.

### T002: Add Provenance Regressions

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] A regression reproduces and fixes the explicit exact-head `pull_request_target` case.
- [ ] Mismatched, unreadable, and non-PR explicit-event boundaries remain rejected.
- [ ] Existing missing-event and cache behavior remains covered.
- [ ] Reverting T001 makes the bug regression fail.

### T003: Verify Delivery and Compatibility

**File(s)**: `README.md`, `CHANGELOG.md`, `VERSION`, `package.json`
**Type**: Modify and Verify
**Depends**: T001, T002
**Acceptance**:
- [ ] Focused delivery tests pass.
- [ ] Full scripts tests and compatibility checks pass.
- [ ] Steering verification covers every acceptance criterion.
- [ ] Patch release metadata and public behavior documentation are consistent.

---

## Validation Checklist

- [x] Tasks are focused on the defect
- [x] Regression coverage is explicit
- [x] Each task has verifiable acceptance criteria
- [x] Paths match the repository structure
