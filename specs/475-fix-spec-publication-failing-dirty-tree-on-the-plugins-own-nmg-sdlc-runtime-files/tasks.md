# Tasks: Fix spec publication failing dirty_tree on the plugin's own .nmg-sdlc runtime files

**Issue**: #475
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/473-fix-smoke-provisioning-prompting-through-a-workspace-trust-dialog-herdr-reports-as-ready/

## Implementation Tasks

### T001: Ignore runtime state in the publisher's dirty check

**File(s)**: `scripts/publish-approved-spec.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `porcelain()` leaves out `.nmg-sdlc/` lines (AC1, AC2, FR1)

### T002: Regression coverage

**File(s)**: `scripts/__tests__/publish-approved-spec.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `prepare` succeeds with only `.nmg-sdlc/` untracked, and that test fails against the pre-fix publisher (AC1)
- `prepare` fails `dirty_tree` with porcelain `?? dirty.txt\n` when a non-runtime file sits beside runtime state (AC2)

### T003: Record the fix

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `CHANGELOG.md` records the fix under `### Fixed`
