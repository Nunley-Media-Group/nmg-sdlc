# Tasks: Make completed delivery re-entry idempotent after branch restoration

**Issue**: #362
**Date**: 2026-09-04
**Status**: Approved
**Author**: NMG

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Add exact terminal delivery re-entry | [x] |
| T002 | Add terminal re-entry unit regressions | [x] |
| T003 | Verify delivery behavior and smoke reproduction | [x] |

### T001: Add Exact Terminal Delivery Re-entry

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [x] Persisted status must be exactly `complete` before the early path applies.
- [x] The exact persisted PR number and expected head are validated remotely.
- [x] PR state must be `MERGED` and issue state must be `CLOSED`.
- [x] Valid terminal re-entry writes a passed handoff without local spec/readiness/branch requirements.
- [x] No git or GitHub mutation runs on terminal re-entry.
- [x] Mismatches retain existing fail-closed classifications.

### T002: Add Terminal Re-entry Unit Regressions

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [x] Unit coverage reproduces re-entry from a restored default branch with no verification report.
- [x] The valid case exits zero and asserts no commit, push, edit, merge, checkout, or issue mutation.
- [x] Wrong head, wrong PR, non-merged PR, and open issue cases fail closed.
- [x] Normal first-delivery and open-PR resume tests remain green.

### T003: Verify Delivery Behavior and Smoke Reproduction

**File(s)**: `scripts/sdlc-deliver.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Verify
**Depends**: T001, T002
**Acceptance**:
- [x] Focused delivery tests exit zero.
- [x] Full repository tests exit zero.
- [x] A fresh owned smoke issue completes with execute exit zero and exact merged/closed proof.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #362 | 2026-09-04 | Initial task plan |
