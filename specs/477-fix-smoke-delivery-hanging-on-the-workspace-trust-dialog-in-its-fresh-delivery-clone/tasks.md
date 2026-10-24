# Tasks: Fix smoke delivery hanging on the workspace-trust dialog in its fresh delivery clone

**Issue**: #477
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/473-fix-smoke-provisioning-prompting-through-a-workspace-trust-dialog-herdr-reports-as-ready/

## Implementation Tasks

### T001: Trust the delivery clone before the nested controller

**File(s)**: `steering/extensions/nmg-sdlc-smoke.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `trustSmokeClone` is exported and called between the delivery clean check and `sdlc-execute.mjs run` (AC1, FR1)
- It keys `down enter` once, only for the owned clone (AC1, AC3), sends no keys for a ready clone (AC2), fails on any other dialog (AC3), and always closes its pane (FR2)

### T002: Regression coverage

**File(s)**: `scripts/__tests__/nmg-sdlc-smoke.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `trustSmokeClone` tests cover keying once then passing, an already-trusted clone, a foreign pane cwd, and another dialog (AC1–AC3)
- The provider harnesses use a ready Herdr fake (`trustedHerdr`), so no test reaches a real Herdr, and the provisioning assertions account for the trust pane

### T003: Record the fix

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `CHANGELOG.md` records the fix under `### Fixed`
