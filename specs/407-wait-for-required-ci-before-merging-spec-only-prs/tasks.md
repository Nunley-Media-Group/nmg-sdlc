# Tasks: Wait for required CI before merging spec-only PRs

**Issue**: #407
**Date**: 2026-09-22
**Status**: Approved
**Author**: NMG

### T001: Reproduce pending CI and retain a behavioral regression

**File(s)**: `scripts/__tests__/publish-approved-spec.test.mjs`
**Type**: Modify
**Acceptance**:
- [ ] A pending or unreported required check before success is observed without early merge.
- [ ] Failed checks and terminal non-CI blockers never merge and return actionable details.
- [ ] Head drift is rejected and the successful merge is guarded by the pinned SHA.

### T002: Gate publication merge on exact-head terminal CI

**File(s)**: `scripts/publish-approved-spec.mjs`
**Type**: Modify
**Acceptance**:
- [ ] Existing PR number is reused; missing/pending checks poll until terminal success.
- [ ] Fresh CLEAN snapshot and exact-head checks precede squash `--match-head-commit`.
- [ ] Failed checks and non-CI blockers fail closed, preserving existing post-merge handling.

### T003: Verify plugin delivery surface

**File(s)**: `scripts/__tests__/publish-approved-spec.test.mjs`, `scripts/publish-approved-spec.mjs`
**Type**: Verify
**Acceptance**:
- [ ] Focused and full script tests pass; plugin surface and applicable exercises pass.
- [ ] Candidate plugin installation and read-only retained evidence precede isolated fresh-fixture smoke.
