# Tasks: Detect recoverable Files labels during publication upgrade

**Issue**: #386
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/383-reject-missing-near-miss-or-duplicate-delivery-file-declarations/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Add task-aware safe near-miss detection | [ ] |
| T002 | Prove safe boundaries and PathCast-shaped behavior | [ ] |
| T003 | Record the pending defect fix | [ ] |

---

### T001: Add task-aware safe near-miss detection

**File(s)**: `scripts/sdlc-upgrade.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Exactly one visible `**Files**:` declaration in a task can produce an exact canonical-label rewrite
- [ ] Existing canonical declaration recovery remains intact
- [ ] Missing, duplicate, mixed, ambiguous, malformed, hidden, and unsupported declarations cannot produce authority-establishing rewrites
- [ ] Existing package and plan digest stale checks remain unchanged
- [ ] Delivery parsing remains untouched and fail-closed

### T002: Prove safe boundaries and PathCast-shaped behavior

**File(s)**: `scripts/__tests__/sdlc-upgrade.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] A PathCast-shaped T001–T004 pre-state is rejected by the delivery parser
- [ ] Detection emits one digest-bound action with exactly four canonical label rewrites
- [ ] Approved apply changes only those four labels and repeat detection emits no publication action
- [ ] The post-state parser returns the complete intended path set
- [ ] Missing, duplicate, mixed canonical/near-miss, ambiguous, malformed, hidden, and unsupported declarations remain non-recoverable
- [ ] Focused and full required verification passes

### T003: Record the pending defect fix

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] The Unreleased Fixed section names the recoverable near-miss behavior and issue #386

---

## Validation Checklist

- [x] Tasks are focused on issue #386
- [x] Each task has exactly one canonical `**File(s)**:` declaration
- [x] Source and test paths match repository structure
- [x] Issue #383's delivery parser remains unchanged
- [x] Dependency collection and PathCast mutation are excluded

## Change History

| Issue | Date | Summary |
|---|---|---|
| #386 | 2026-09-13 | Initial approved implementation tasks |
