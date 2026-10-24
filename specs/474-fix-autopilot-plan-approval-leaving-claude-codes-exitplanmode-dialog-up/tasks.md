# Tasks: Fix autopilot plan approval leaving Claude Code's ExitPlanMode dialog up

**Issue**: #474
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/473-fix-smoke-provisioning-prompting-through-a-workspace-trust-dialog-herdr-reports-as-ready/

## Implementation Tasks

### T001: Return the tool input with every plan approval

**File(s)**: `hooks/register.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- Both `ExitPlanMode` allows return `updatedInput` equal to the tool input (AC1, AC2, FR1)

### T002: Regression coverage

**File(s)**: `hooks/register.test.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- The autopilot and write-spec Finished tests assert `updatedInput`, and both fail against the pre-fix module

### T003: Record the fix

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `CHANGELOG.md` records the fix under `### Fixed`
