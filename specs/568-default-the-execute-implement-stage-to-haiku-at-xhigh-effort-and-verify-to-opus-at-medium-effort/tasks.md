# Tasks: Default the execute implement stage to Haiku at xhigh effort and verify to Opus at medium effort

**Issue**: #568
**Date**: 2026-11-18
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/561-default-the-execute-implement-stage-to-opus-at-medium-effort-and-offer-the-new-defaults-on-upgrade/

## Implementation Tasks

### T001: Change the defaults and the superseded table

**File(s)**: `src/stage-models.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1/AC1: `STAGE_MODEL_DEFAULTS.implement` is `haiku`/`xhigh` and `STAGE_MODEL_DEFAULTS.verify` is `opus`/`medium`; `start`, `deliver`, `repair` are unchanged
- FR2: `SUPERSEDED_STAGE_MODEL_DEFAULTS` is `implement: [opus/medium]` and `verify: [opus/high]`; no stage's current default appears in its own superseded list

### T002: Update the repository stage models file

**File(s)**: `steering/sdlc-models.json`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR4/AC5: `implement` is `haiku`/`xhigh` and `verify` is `opus`/`medium`; other entries and key order unchanged; the file passes `validateStageModels`

### T003: Update documentation and workflow references

**File(s)**: `README.md`, `workflows/onboard-project/WORKFLOW.md`, `workflows/upgrade-project/references/detection.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR5/AC5: README stage model table, Per-project stage models prose and JSON example, onboarding `ensure` sentence, and detection item 17 state `implement` `haiku`/`xhigh` and `verify` `opus`/`medium` as defaults
- Earlier-default examples name `implement` `opus`/`medium` and `verify` `opus`/`high`

### T004: Update regression tests

**File(s)**: `scripts/__tests__/sdlc-models.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/readme-sdlc-models-contract.test.mjs`, `scripts/__tests__/nmg-sdlc-smoke.test.mjs`
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- AC1: `ensure` on a project without the file writes `implement` `haiku`/`xhigh` and `verify` `opus`/`medium` with other stages unchanged; `stageModel`/`stageEffort` with plugin defaults resolve the same values
- AC2: completing a valid file missing `implement` or `verify` adds the new defaults and leaves existing values unchanged
- AC3: a file with `implement` `opus`/`medium` and/or `verify` `opus`/`high` yields an `sdlc-models-defaults` item whose `entries` names exactly those stages; approved refresh writes the new defaults and preserves other values and key order
- AC4: a file holding the current defaults, `implement` `haiku`/`xhigh`, or a project-chosen value (e.g. `verify` `opus`/`low`) yields no `sdlc-models-defaults` item and refresh reports `already-current` without writing
- FR6: `SUPERSEDED_STAGE_MODEL_DEFAULTS` is asserted exactly; the README contract test asserts the new table rows and JSON example
- `cd scripts && npm test` exits 0

### T005: Add the CHANGELOG entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T004
**Acceptance**:
- `[Unreleased]` has a bullet describing the new `implement` and `verify` defaults and the upgrade refresh of the earlier ones, ending with `(#568)`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #568 | 2026-11-18 | Initial feature tasks |
