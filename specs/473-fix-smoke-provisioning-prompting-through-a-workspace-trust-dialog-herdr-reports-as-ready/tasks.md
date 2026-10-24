# Tasks: Fix smoke provisioning prompting through a workspace-trust dialog Herdr reports as ready

**Issue**: #473
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/470-fix-sdlc-execute-closing-worker-panes-while-their-background-work-runs/

## Implementation Tasks

### T001: Check for the trust dialog before trusting readiness

**File(s)**: `steering/extensions/nmg-sdlc-smoke.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- The readiness loop accepts a visible workspace-trust dialog before it reads `interactive_ready` (AC1, AC3, FR1)
- `claudeDialog` collapses whitespace before matching (AC2, FR2)

### T002: Regression coverage

**File(s)**: `scripts/__tests__/nmg-sdlc-smoke.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `NARROW_TRUST_SCREEN` is the live narrow-pane capture, and it is classified as `workspace_trust` (AC2)
- A ready agent showing that screen gets `down enter` once before `/sdlc-draft-issue` (AC1)
- A ready agent with no dialog gets no keys (AC3)
- The AC1 and AC2 tests fail against the pre-fix provider

### T003: Record the fix

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `CHANGELOG.md` records the fix under `### Fixed`
