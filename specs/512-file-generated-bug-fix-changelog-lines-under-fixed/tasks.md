# Tasks: Generated bug-fix CHANGELOG lines are filed under ### Changed

**Issue**: #512
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/503-fix-duplicate-changelog-entry-when-delivery-rolls-a-hand-written-issue-entry/

## Implementation Tasks

### T001: Correct the Root Cause

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `synchronizeVersion` selects `Changed (BREAKING)` for an approved breaking change, otherwise `Fixed` for a `bug`-labelled issue, otherwise `Changed`, and passes that category to `updateChangelog` (AC1, AC3, AC4; FR1).
- `updateChangelog` appends the generated line as the last bullet of a rolled section whose heading line exactly equals `### <category>`, and otherwise adds a new `### <category>` heading with the line after the rolled content (AC2, AC3; FR2).
- `synchronizedDeliveryVersion` still recognizes the generated line regardless of its heading (AC5; FR3).

### T002: Add Behavioral Regression Coverage

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- The `fixture` helper accepts options for issue labels, issue title, initial `[Unreleased]` content, and extra approved `requirements.md` text; defaults leave existing tests unchanged.
- Tests driving `runDeliver({ action: 'prepare-version' })` on `fixture({ versionPrepared: false })` prove AC1 (bug → `### Fixed`, no `### Changed`), AC2 (single `### Fixed`, generated line last, other sections preserved), AC3 (enhancement appended to an existing `### Changed`, no `### Fixed`), AC4 (`BREAKING:` title plus `**Version bump**: major` → next major under `### Changed (BREAKING)`), and AC5 (second run on a bug issue reports the same version, leaves `VERSION`, `package.json`, and `CHANGELOG.md` unchanged, and keeps the same HEAD).
- AC1 and AC2 fail without T001 and pass with it.
- `cd scripts && npm test -- sdlc-deliver` exits 0.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #512 | 2026-10-25 | Initial defect tasks |
