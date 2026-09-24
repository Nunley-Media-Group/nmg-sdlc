# Tasks: Wait for durable review receipts before closing sibling panes

**Issue**: #420
**Date**: 2026-09-24
**Status**: Approved
**Author**: NMG

### T001: Reproduce delayed host receipt collection
**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- [ ] Demonstrate the existing collector rejects a transient incomplete receipt while a sibling has not settled, despite a valid host result becoming durable after observation.
- [ ] Keep persistent malformed, absent, foreign and untrusted-output cases nonpassing.

### T002: Collect siblings before pane cleanup
**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Wait for all workers before inspecting or closing any; recheck a transient invalid/missing receipt once via existing observation pause.
- [ ] Preserve exact assignment, read-only receipt validation, no new review allowance, and all failure cleanup gates.

### T003: Verify and preserve smoke evidence
**File(s)**: `specs/420-wait-for-durable-review-receipts-before-closing-sibling-panes/verification-report.md`, `README.md`, `CHANGELOG.md`, `VERSION`, `package.json`
**Type**: Modify/Create only if delivery becomes eligible
**Depends**: T002
**Acceptance**:
- [ ] Run focused/full tests and plugin surface, document pre/post reproduction and registered smoke eligibility for retained #129.
- [ ] Coordinate release mirrors and global install with #418; do not merge or pass a failed smoke gate.
