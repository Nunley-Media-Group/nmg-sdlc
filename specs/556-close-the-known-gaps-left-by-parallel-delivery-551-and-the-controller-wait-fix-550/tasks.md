# Tasks: Close the known gaps left by parallel delivery (#551) and the controller wait fix (#550)

**Issue**: #556
**Date**: 2026-11-15
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/551-add-parallel-delivery-with-worktree-isolation-a-merge-queue-change-scoped-validation-tiers-and-one-pass-verification/

## Implementation Tasks

### T001: Read an approved spec from the remote default branch

**File(s)**: `scripts/issue-spec-scope.mjs`, `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1/AC1: `specStatusOnRef` finds an approved spec on a ref; the execute start check uses it on the fetched remote default branch before failing `approved_spec_missing`

### T002: Skip setup and teardown for spec worktrees

**File(s)**: `scripts/sdlc-worktree.mjs`, `references/steering-schema.md`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR2/AC2: a `spec/` worktree runs neither command and records setup as not run; code worktrees are unchanged

### T003: Break a shared-state lock only when its holder is gone

**File(s)**: `scripts/sdlc-shared-state.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR3/AC3: the lock records its holder; a live same-host holder is never broken, a dead one at once, an unknown one after 30 s

### T004: Keep the branch's changelog entries in a version-only queue conflict

**File(s)**: `scripts/sdlc-deliver.mjs`, `scripts/sdlc-execute.mjs`, `workflows/execute/WORKFLOW.md`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR4/AC4: the resolved `CHANGELOG.md` keeps the default branch's content plus the branch's missing `[Unreleased]` bullets, and the integration line names them

### T005: End the marker wait when the worker stops

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR5/AC5: a `failed` or `killed` status ends the wait at the next host poll and the stage ends `process_lost`

### T006: Regression tests

**File(s)**: `scripts/__tests__/`
**Type**: Modify
**Depends**: T001, T002, T003, T004, T005
**Acceptance**:
- FR6: tests cover AC1, AC2, AC3, AC4, AC5 and AC6 (check-ins on a settled worker behind its marker)
- `cd scripts && npm test` exits 0

### T007: Add the CHANGELOG entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T005
**Acceptance**:
- The change has `[Unreleased]` bullets ending `(#556)`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #556 | 2026-11-15 | Initial feature tasks |
