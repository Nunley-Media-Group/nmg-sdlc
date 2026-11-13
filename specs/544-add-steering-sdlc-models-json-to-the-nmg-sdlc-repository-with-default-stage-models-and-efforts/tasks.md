# Tasks: Add steering/sdlc-models.json to the nmg-sdlc repository with default stage models and efforts

**Issue**: #544
**Date**: 2026-11-13
**Status**: Approved
**Author**: Claude Code (write-spec)
**Related Spec**: specs/535-make-sdlc-execute-stage-models-and-efforts-configurable-per-project-via-steering-sdlc-models-json/

## Implementation Tasks

### T001: Create steering/sdlc-models.json through the upgrade helper

**File(s)**: `steering/sdlc-models.json`
**Type**: Create
**Depends**: none
**Acceptance**:
- AC1, FR1: `steering/sdlc-models.json` is produced by `node scripts/sdlc-upgrade.mjs apply --root . --approve sdlc-models` (via `completeStageModels`), not written by hand
- The file parses to `version: 1` and `start`, `implement`, `verify`, `deliver`, `repair` entries deep-equal to `STAGE_MODEL_DEFAULTS`

### T002: Add the CHANGELOG entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR2: `## [Unreleased]` contains a bullet describing the added `steering/sdlc-models.json` that ends with `(#544)` (a single trailing period allowed)

### T003: Add repository contract coverage for the checked-in stage models file

**File(s)**: `scripts/__tests__/sdlc-models.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC1: a test reads `steering/sdlc-models.json` at the repository root and asserts it deep-equals `STAGE_MODEL_DEFAULTS`
- AC2: a test asserts `detectUpgrade(repoRoot, { run: noNetworkRun }).items` contains no item with id `sdlc-models`
- AC3: `cd scripts && npm test` exits 0

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #544 | 2026-11-13 | Initial feature tasks |
