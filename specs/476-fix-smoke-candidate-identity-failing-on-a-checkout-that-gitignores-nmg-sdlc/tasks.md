# Tasks: Fix smoke candidate identity failing on a checkout that gitignores .nmg-sdlc

**Issue**: #476
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/473-fix-smoke-provisioning-prompting-through-a-workspace-trust-dialog-herdr-reports-as-ready/

## Implementation Tasks

### T001: Exclude .nmg-sdlc only where it is not ignored

**File(s)**: `steering/extensions/nmg-sdlc-smoke.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `candidateTree` checks `git check-ignore -q .nmg-sdlc` and adds the exclusion only on exit 1 (AC1, AC2, FR1)
- `candidateTree` is exported

### T002: Regression coverage against real git

**File(s)**: `scripts/__tests__/nmg-sdlc-smoke.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- In real temporary repositories that do and do not ignore `.nmg-sdlc/`, the candidate tree holds the changed working-tree file and no `.nmg-sdlc` entry. The ignored case fails against the pre-fix pathspec (AC1, AC2)
- The fixture git mocks answer `check-ignore`

### T003: Record the fix

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `CHANGELOG.md` records the fix under `### Fixed`
