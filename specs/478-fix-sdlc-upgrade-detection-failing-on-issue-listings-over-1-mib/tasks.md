# Tasks: Fix sdlc-upgrade detection failing on issue listings over 1 MiB

**Issue**: #478
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG

## Implementation Tasks

### T001: Raise the default command buffer

**File(s)**: `scripts/sdlc-upgrade.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `defaultRun` passes `maxBuffer: MAX_COMMAND_OUTPUT_BYTES` (AC1, FR1)

### T002: Regression coverage

**File(s)**: `scripts/__tests__/sdlc-upgrade.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- The CLI detects against a fake `gh` whose listing is about 1.5 MiB, and the test fails against the pre-fix runner (AC1)

### T003: Record the fix

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `CHANGELOG.md` records the fix under `### Fixed`
