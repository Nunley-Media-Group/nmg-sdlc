# Tasks: First-run delivery blocked by missing CHANGELOG.md and push-event checks

**Issue**: #484
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG

## Implementation Tasks

### T001: Onboarding creates a missing changelog

**File(s)**: `workflows/onboard-project/WORKFLOW.md`, `workflows/onboard-project/references/greenfield.md`, `workflows/onboard-project/references/brownfield.md`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC1/FR1: the greenfield initialization step and the brownfield preflight tell onboarding to create `CHANGELOG.md` containing `# Changelog` and `## [Unreleased]` when it is absent, and never modify an existing `CHANGELOG.md`
- Edits are made after invoking the `skill-creator` skill

### T002: prepare-version fails with version_artifact_missing before mutating

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC2/AC3/FR2: a missing `VERSION`, a missing `CHANGELOG.md`, or a changelog without `## [Unreleased]` produces a failed deliver handoff with `reasonCode` `version_artifact_missing` and a summary naming the missing file or heading, with no file written and no commit created
- AC6: a valid `VERSION` plus a changelog with `## [Unreleased]` still bumps and commits the version artifacts, and `major_bump_required` handling is unchanged

### T003: Execute prints the handoff summary

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC4/FR3: `prepareVersion` throws `version_preparation_failed: <reasonCode> — <summary>` when the deliver handoff has a non-empty summary, and `version_preparation_failed: <reasonCode>` otherwise

### T004: Upgrade proposes and applies changelog-create

**File(s)**: `scripts/sdlc-upgrade.mjs`, `workflows/upgrade-project/references/detection.md`, `workflows/upgrade-project/references/v3-detectors.md`, `workflows/upgrade-project/references/upgrade-procedures.md`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC5/FR4: detect emits actionable `changelog-create` when root `VERSION` is a regular file and `CHANGELOG.md` is absent, and emits nothing otherwise
- Approved apply writes `# Changelog\n\n## [Unreleased]\n`, never overwrites an existing `CHANGELOG.md`, and a re-run of detect reports no `changelog-create` item
- Reference edits are made after invoking the `skill-creator` skill

### T005: Push-event checks are not snapshot gaps

**File(s)**: `scripts/pr-delivery-state.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC7/FR5: a successful check with a known non-`pull_request` event adds no gap, and declared PR-only checks resolve only against `pull_request` checks
- AC8: a failed check of any event yields `checks_failed`, never `merge_ready`
- A check with a missing event still adds a gap

### T006: Document the changelog requirement

**File(s)**: `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T001, T002, T004
**Acceptance**:
- The README versioning section states that delivery requires `CHANGELOG.md` with `## [Unreleased]`, that onboarding and upgrade create it, and that `prepare-version` reports `version_artifact_missing` when it is absent
- `CHANGELOG.md` `[Unreleased]` has a `### Fixed` entry for #484

### T007: Regression coverage

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-upgrade.test.mjs`, `scripts/__tests__/pr-delivery-state.test.mjs`, `scripts/__tests__/onboard-changelog-contract.test.mjs`
**Type**: Create | Modify
**Depends**: T001, T002, T003, T004, T005
**Acceptance**:
- AC1: `onboard-changelog-contract.test.mjs` asserts that `workflows/onboard-project/WORKFLOW.md`, `greenfield.md`, and `brownfield.md` contain the create-if-absent `CHANGELOG.md` / `## [Unreleased]` rule
- AC2/AC3: `sdlc-deliver.test.mjs` covers a missing `CHANGELOG.md` and a changelog without `## [Unreleased]`, asserting `reasonCode: 'version_artifact_missing'`, a summary naming the missing item, an unchanged `VERSION`, and an unchanged HEAD
- AC6: the existing prepare-version and `major_bump_required` tests still pass
- AC4: `sdlc-execute.test.mjs` asserts that stderr contains `version_preparation_failed: version_artifact_missing — CHANGELOG.md is missing`
- AC5: `sdlc-upgrade.test.mjs` covers detect, apply, existing-file preservation, and the re-run producing no item
- AC7/AC8: `pr-delivery-state.test.mjs` replaces the push case in the provenance test with a missing-event-only gap test. It adds a push+pull_request same-name success snapshot reaching `merge_ready`, a declared PR-only check satisfied only by a push check that is not resolved, and a failed push check yielding `checks_failed`
- `cd scripts && npm test` exits 0

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #484 | 2026-10-25 | Initial defect report |
