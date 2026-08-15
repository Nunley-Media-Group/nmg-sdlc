# Tasks: Fix Canonical Umbrella Rejection of Issue Scope Manifests

**Issue**: #173
**Date**: 2026-08-14
**Status**: Complete
**Author**: Rich Nunley

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Recognize the scope manifest | [x] |
| T002 | Add classifier regressions | [x] |
| T003 | Verify source and real consumer | [x] |

---

### T001: Recognize the Scope Manifest

**File(s)**: `scripts/umbrella-spec-status.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [x] `issue-scope.json` is an explicitly recognized optional regular blob alongside `verification-report.md`.
- [x] The four authoring artifacts remain required.
- [x] Complete Git-tree identity continues to include every recognized artifact byte.
- [x] No JSON parsing or scope-schema validation is added to the canonical helper.
- [x] No unrelated classifier behavior changes.

**Notes**: Add one exact filename to the existing optional recognized-file set. Keep `scripts/issue-spec-scope.mjs` as the sole semantic manifest authority.

### T002: Add Classifier Regressions

**File(s)**: `scripts/__tests__/umbrella-spec-status.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [x] The fixture can commit optional `issue-scope.json` content with or without `verification-report.md`.
- [x] Parent, publication, and audit modes accept a canonical tree containing both lifecycle sidecars.
- [x] A change only to manifest bytes yields distinct tree IDs and `divergent` publication status.
- [x] Canonical validation treats manifest content as opaque while existing scope-resolver tests retain semantic validation authority.
- [x] A manifest symlink, a missing required file, and an unknown entry retain stable fail-closed diagnostics.
- [x] Existing canonicality, recovery, ambiguity, traversal, deterministic, and read-only regression tests remain green.

### T003: Verify Source and Real Consumer

**File(s)**: `scripts/__tests__/umbrella-spec-status.test.mjs`, PathCast repository read-only evidence
**Type**: Verify (no consumer file changes)
**Depends**: T001, T002
**Acceptance**:
- [x] The focused umbrella classifier suite passes from `scripts/`.
- [x] The full script test suite passes from `scripts/` with no unexpected skips.
- [x] `git diff --check` passes and the changed-file scope matches the approved design.
- [x] The fixed source helper reports `canonical` or `canonical_marker_lost` for PathCast parent #108.
- [x] Before/after evidence proves the live consumer run changes no worktree, index, branch, local ref, remote ref, or GitHub state.

---

## Critical Path

```text
T001 -> T002 -> T003
```

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #173 | 2026-08-14 | Initial defect tasks |

---

## Validation Checklist

- [x] Tasks are focused on the fix -- no feature work
- [x] Regression test is included in T002
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure per `steering/structure.md`
