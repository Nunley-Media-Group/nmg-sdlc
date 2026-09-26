# Tasks: Continue an explicit execute queue after the previous issue is delivered

**Issue**: #441
**Date**: 2026-09-26
**Status**: Approved
**Author**: NMG

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Leave a delivered issue branch before the next queued issue | [ ] |

---

### T001: Leave a delivered issue branch before the next queued issue

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `run #42 #43` from the default branch delivers #42, switches back to the default branch, and processes #43 without `active_issue_conflict`
- [ ] A foreign issue branch that is not MERGED and CLOSED at its head, or a dirty worktree, still stops with `active_issue_conflict` and is preserved
- [ ] An unreadable default branch fails closed

---

## Validation Checklist

- [x] Tasks are focused on the fix — no feature work
- [x] Regression coverage is included in every task
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure
