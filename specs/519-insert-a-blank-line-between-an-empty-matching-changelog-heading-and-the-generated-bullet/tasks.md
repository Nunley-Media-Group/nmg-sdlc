# Tasks: Generated CHANGELOG bullet lacks a blank line under an empty matching heading

**Issue**: #519
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/512-file-generated-bug-fix-changelog-lines-under-fixed/

## Implementation Tasks

### T001: Correct the Root Cause

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- When the line exactly equal to `### <category>` has no non-blank lines before the next `### ` heading or the end of the rolled section, `addGeneratedEntry` emits the heading, exactly one blank line, then the generated bullet (AC1; FR1).
- When that empty section is followed by another `### ` heading, exactly one blank line separates the generated bullet from it (AC2; FR2).
- A populated matching section still receives the bullet directly after its last non-blank line, and the no-match path still appends `### <category>`, a blank line, and the bullet (AC3, AC4; FR3).

### T002: Add Behavioral Regression Coverage

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- In the `prepare-version files the generated line under the issue category (#512)` block, or an adjacent `(#519)` block, tests driving `runDeliver({ action: 'prepare-version' })` on `fixture({ versionPrepared: false, labels: ['bug'], unreleased })` prove AC1 (`unreleased: '### Fixed\n\n'`: section ends with `### Fixed\n\n- Deliver verified changes (#42)\n`, one `### Fixed`) and AC2 (`unreleased: '### Fixed\n\n\n### Changed\n\n- Renamed the option (#8)'`: section contains `### Fixed\n\n- Deliver verified changes (#42)\n\n### Changed\n\n- Renamed the option (#8)\n`, one `### Fixed`).
- The existing AC1 and AC2 tests from #512 still pass and cover AC4 (no matching heading) and AC3 (populated section) of this issue.
- The new AC1 and AC2 tests fail without T001 and pass with it.
- `cd scripts && npm test -- sdlc-deliver` exits 0.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #519 | 2026-10-25 | Initial defect tasks |
