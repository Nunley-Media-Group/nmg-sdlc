# Tasks: Reconcile remote spec merge after local checkout failure

**Issue**: #415
**Date**: 2026-09-23
**Status**: Approved
**Author**: NMG

---

### T001: Independently classify merge CLI failure

**File(s)**: `scripts/publish-approved-spec.mjs`, `scripts/__tests__/publish-approved-spec.test.mjs`
**Type**: Modify
**Acceptance**:
- [ ] Prove exact PR number, MERGED state, expected head, head branch, and base after a nonzero merge CLI exit before reporting `merged: true` (AC1)
- [ ] Reject open, unreadable, changed, or ambiguous evidence without labeling (AC2)

### T002: Reconcile worktree checkout and repeat publication

**File(s)**: `scripts/publish-approved-spec.mjs`, `scripts/__tests__/publish-approved-spec.test.mjs`
**Type**: Modify
**Acceptance**:
- [ ] Keep the local checkout limitation distinct from remote merge outcome and perform independent safe bookkeeping (AC3)
- [ ] Discover the exact already-merged PR on re-entry without creating or merging another PR (AC4)
- [ ] Preserve existing exact-head readiness and branch-protection gates for open PRs

### T003: Update publication guidance and verify delivery

**File(s)**: `workflows/write-spec/references/publish.md`, `README.md`, `CHANGELOG.md`, `scripts/__tests__/publish-approved-spec.test.mjs`
**Type**: Modify
**Acceptance**:
- [ ] Document merged-failure and worktree-safe remediation, with no re-publication (AC1–AC4)
- [ ] Demonstrate the pre-fix failure, focused/full plugin tests, candidate install, and registered smoke; preserve failed gate evidence
