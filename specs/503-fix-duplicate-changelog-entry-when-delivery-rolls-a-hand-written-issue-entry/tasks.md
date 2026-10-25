# Tasks: Delivery duplicates the issue's CHANGELOG entry

**Issue**: #503
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/484-fix-first-run-delivery-missing-changelog-md-and-push-event-checks-block-sdlc-execute/

## Implementation Tasks

### T001: Skip the generated entry when the rolled content references the issue

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC1/FR1: when the rolled `[Unreleased]` body has a `- ` bullet line containing the exact text `(#N)`, the new version section contains that body unchanged and no generated `### Changed` or `### Changed (BREAKING)` block, and `## [Unreleased]` is empty above the new heading
- AC2/AC3/FR2: when no rolled bullet contains `(#N)`, the generated `### Changed` (or `### Changed (BREAKING)` for an approved major) line `- <issue title> (#N)` is added as before
- AC5: `(#4)` and `(#420)` do not count as references to issue 42

### T002: Recognize a hand-written issue entry as synchronized

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC4/FR3: `synchronizedDeliveryVersion` returns true when the current version's release section contains the generated line or a `- ` bullet line containing `(#N)`, so `hasSynchronizedDeliveryState` reports a prepared branch whose only issue reference is the hand-written bullet as synchronized
- A release section with neither form is still not synchronized

### T003: Add behavioral regression coverage

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- AC1: with `[Unreleased]` holding `### Fixed` and `- Corrected delivery (#42).`, `prepare-version --issue 42` writes a `## [3.5.0]` section containing that bullet once and no `### Changed` block
- AC2: with an empty `[Unreleased]`, and separately with only a `(#7)` bullet, `prepare-version --issue 42` adds `### Changed` with `- Deliver verified changes (#42)`
- AC3: with a `BREAKING:` issue title and `**Version bump**: major` in the spec, `prepare-version --issue 42` bumps to `4.0.0` and adds the line under `### Changed (BREAKING)` (the fixture gains an issue-title override for this test)
- AC4: after AC1's preparation, a second `prepare-version --issue 42` leaves `VERSION`, `package.json`, `CHANGELOG.md`, and HEAD unchanged, and delivery on that branch does not fail with `version_not_prepared`
- AC5: with `(#4)` and `(#420)` bullets only, `prepare-version --issue 42` adds the generated `(#42)` line
- The AC1, AC4, and AC5 tests fail against the unfixed source and all pass with T001–T002; `cd scripts && npm test` exits 0

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #503 | 2026-10-25 | Initial defect tasks |
