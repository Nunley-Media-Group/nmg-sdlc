# Tasks: Close the gaps left open after #556: lock pid reuse, reclaim-guard put-back, spec revision publishing, and untested paths

**Issue**: #560
**Date**: 2026-11-15
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/556-close-the-known-gaps-left-by-parallel-delivery-551-and-the-controller-wait-fix-550/

## Implementation Tasks

### T001: Process start tokens for lock and slot holders

**File(s)**: `src/heavy-pool.mjs`, `scripts/sdlc-shared-state.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1, FR2/AC1: a holder whose pid is live with a different start token is broken; a matching or unreadable token keeps the pid-only rule

### T002: Owner-recording reclaim guard with no-replace restore

**File(s)**: `src/heavy-pool.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR3/AC2: a moved fresh guard is restored with a hard link that never replaces a guard taken meanwhile

### T003: Publish a revised spec after an earlier merged spec PR

**File(s)**: `scripts/publish-approved-spec.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR4/AC3: a changed package opens a new spec PR; an unchanged one reports the latest merged PR

### T004: Absent remote specs directory reads as absent

**File(s)**: `scripts/issue-spec-scope.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR5/AC4: a readable ref without `specs/` gives no reason code; an unreadable ref keeps `spec_status_unreadable`

### T005: Normalize bullet markers when inserting changelog entries

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR6/AC5: a bullet present as `* text` is not added again as `- text`

### T006: Regression tests

**File(s)**: `scripts/__tests__/`
**Type**: Modify
**Depends**: T001, T002, T003, T004, T005
**Acceptance**:
- FR7: tests cover AC1 to AC5
- `cd scripts && npm test` exits 0

### T007: Add the CHANGELOG entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T006
**Acceptance**:
- The change has `[Unreleased]` bullets ending `(#560)`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #560 | 2026-11-15 | Initial feature tasks |
