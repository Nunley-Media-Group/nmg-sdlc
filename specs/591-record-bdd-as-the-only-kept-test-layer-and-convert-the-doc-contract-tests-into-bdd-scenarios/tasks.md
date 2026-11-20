# Tasks: Record bdd as the only kept test layer and convert the doc contract tests into BDD scenarios

**Issue**: #591
**Date**: 2026-11-20
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/571-make-bdd-scenarios-the-single-acceptance-test-layer-with-a-kept-test-types-steering-setting/
**Related Spec**: specs/572-add-an-sdlc-upgrade-project-item-that-migrates-non-kept-test-layers-into-bdd-scenarios-under-a-coverage-guarantee/

## Implementation Tasks

### T001: Record the kept set

**File(s)**: `steering/test-layers.json`
**Type**: Create
**Depends**: none
**Acceptance**:
- AC1: written by the approved `sdlc-upgrade.mjs apply --kept bdd`.

### T002: Convert the doc tests to scenario tests

**File(s)**: `scripts/__tests__/contribution-gate-contract.test.mjs`, `scripts/__tests__/contribution-guide-contract.test.mjs`, `scripts/__tests__/interactive-gates-contract.test.mjs`, `scripts/__tests__/issue-form-contract.test.mjs`, `scripts/__tests__/onboard-changelog-contract.test.mjs`, `scripts/__tests__/onboard-sdlc-models-contract.test.mjs`, `scripts/__tests__/readme-sdlc-models-contract.test.mjs`, `scripts/__tests__/simplify-contract.test.mjs`, `scripts/__tests__/spec-context-contract.test.mjs`, `scripts/__tests__/start-issue-selection-contract.test.mjs`, `scripts/__tests__/status-skill-contract.test.mjs`, `scripts/__tests__/steering-contract.test.mjs`, `scripts/__tests__/upgrade-v4-host-language-contract.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC2: each top-level `describe` title starts with its `@SCNnnn` id, and the inventory reports no `doc` file.
- AC3: the before/after coverage comparison passes.

### T003: Add the kept-layer CI check

**File(s)**: `scripts/check-test-layers.mjs`, `scripts/test-layers-allowlist.json`, `scripts/__tests__/check-test-layers.test.mjs`, `.github/workflows/nmg-sdlc-verify.yml`
**Type**: Create
**Depends**: T001
**Acceptance**:
- AC4, AC5, AC6 are covered by `@SCN015`–`@SCN017`.

### T004: Document the change

**File(s)**: `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- FR5: README names the CI check next to the kept-test-types setting; CHANGELOG `[Unreleased]` cites `(#591)`.
