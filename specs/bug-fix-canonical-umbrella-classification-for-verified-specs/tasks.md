# Tasks: Fix Canonical Umbrella Classification for Verified Specs

**Issue**: #159
**Date**: 2026-08-14
**Status**: Complete
**Author**: Rich Nunley

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Classifier | 2 | [x] |
| Regression coverage | 2 | [x] |
| Verification | 1 | [x] |
| **Total** | **5** | |

---

### T001: Recognize the lifecycle verification report without weakening tree validation

**File(s)**: `scripts/umbrella-spec-status.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [x] The four authoring artifacts remain required regular blobs.
- [x] A regular `verification-report.md` is an explicitly recognized optional blob and remains part of exact Git tree identity.
- [x] Missing required files, unknown entries, directories, symlinks, unsafe paths, and unsupported object types retain stable fail-closed diagnostics.
- [x] The helper remains read-only and performs no worktree, index, ref, remote, or GitHub mutation beyond its existing bounded fetch behavior.

### T002: Isolate targeted candidates and retain candidate-specific audit gaps

**File(s)**: `scripts/umbrella-spec-status.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [x] Parent mode skips a candidate proven unrelated to the requested parent before complete tree validation.
- [x] Malformed or ambiguous evidence that claims the requested parent still fails closed with scoped diagnostics.
- [x] Audit mode retains valid findings while appending deterministic candidate-specific validation gaps.
- [x] Git/ref/default-branch enumeration failures and safety-limit failures remain fatal and return `unverifiable`.
- [x] Existing result fields, deterministic ordering, canonical precedence, ambiguity, and divergence semantics remain compatible.

### T003: Add deterministic classifier regressions

**File(s)**: `scripts/__tests__/umbrella-spec-status.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [x] Parent, publication, and audit modes accept a canonical tree containing a regular `verification-report.md`.
- [x] Exact source/default equality includes verification-report content.
- [x] Missing required files, symlinks, and an unrecognized fifth entry such as `seal.json` remain rejected.
- [x] An unrelated invalid candidate cannot poison a targeted parent lookup, while a relevant invalid candidate still fails closed.
- [x] A mixed audit returns valid findings and candidate-specific gaps in deterministic order.
- [x] Existing #157 classifier, recovery, divergence, ambiguity, limit, and no-mutation tests continue to pass.

### T004: Exercise verified umbrella child handoff without resealing

**File(s)**: `scripts/__tests__/exercise-write-spec-epic.test.mjs`, `scripts/__tests__/canonical-umbrella-spec-contract.test.mjs`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- [x] The lifecycle fixture publishes a canonical umbrella, adds its verification report, and refreshes the default branch.
- [x] A later child-scoped amendment proceeds to the write-code handoff without a child-numbered seal commit or second umbrella publication pull request.
- [x] The write-code parent gate accepts the canonical parent baseline while loading the child-amended tree.
- [x] The contract proves child readiness does not require child-tree equality with the parent baseline.
- [x] Existing single-PR, publication, idempotency, symlink, and no-mutation exercises remain green.

### T005: Verify the complete defect contract

**File(s)**: `scripts/__tests__/*`, `scripts/skill-inventory.baseline.json` if line-anchor regeneration is required
**Type**: Modify if generated evidence changes; otherwise verify only
**Depends**: T003, T004
**Acceptance**:
- [x] Focused classifier and lifecycle suites pass.
- [x] The full script test suite passes from `scripts/`.
- [x] Exercise tests and active-surface/inventory checks pass.
- [x] Any baseline regeneration reflects only intentional line-anchor changes and records inventory removals truthfully.
- [x] `git diff --check` passes and all six acceptance criteria have direct automated evidence.

---

## Dependency Graph

```text
T001 -> T002 -> T003 -> T004 -> T005
```

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #159 | 2026-08-14 | Initial defect tasks |
