# Requirements: Default the execute implement stage to Haiku at xhigh effort and verify to Opus at medium effort

**Issue**: #568
**Date**: 2026-11-18
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/561-default-the-execute-implement-stage-to-opus-at-medium-effort-and-offer-the-new-defaults-on-upgrade/

## User Story

**As a** developer running `/sdlc-execute`
**I want** the plugin's default stage models to be `implement` `haiku`/`xhigh` and `verify` `opus`/`medium`
**So that** new and upgraded projects run the implement and verify stages on lower-cost model and effort settings by default

## Background

#561 changed the plugin default for the execute `implement` stage from `haiku`/`xhigh` to `opus`/`medium` and added an upgrade refresh (`sdlc-models-defaults`) that moves entries still holding an earlier plugin default to the current one. The defaults now return to `haiku`/`xhigh` for `implement`, and `verify` moves from `opus`/`high` to `opus`/`medium`. `start`, `deliver`, and `repair` keep their current defaults.

`src/stage-models.mjs` holds `STAGE_MODEL_DEFAULTS` and `SUPERSEDED_STAGE_MODEL_DEFAULTS`; `scripts/sdlc-models.mjs` (`ensure`, `completeStageModels`, `staleStageDefaults`, `refreshStageModelDefaults`) and `scripts/sdlc-upgrade.mjs` read them. `SUPERSEDED_STAGE_MODEL_DEFAULTS` currently lists `implement` `haiku`/`xhigh`; once that pair is the current default again it must leave the list, or upgrade would report the current default as stale.

## Acceptance Criteria

### AC1: New defaults apply when the file is absent

**Given** a project without `steering/sdlc-models.json`
**When** `sdlc-models.mjs ensure` creates it, or execute resolves stage models with the plugin defaults
**Then** `implement` is `haiku`/`xhigh`, `verify` is `opus`/`medium`, and `start`, `deliver`, and `repair` are unchanged (`haiku`/`default`, `haiku`/`xhigh`, `opus`/`default`)

### AC2: Missing keys are completed with the new defaults

**Given** a valid `steering/sdlc-models.json` that lacks the `implement` or `verify` entry
**When** upgrade completes the file
**Then** the added entries are `implement` `haiku`/`xhigh` and `verify` `opus`/`medium`, and every existing value is unchanged

### AC3: Upgrade offers to move entries holding an earlier default

**Given** a valid `steering/sdlc-models.json` whose `implement` is `opus`/`medium` or whose `verify` is `opus`/`high`
**When** `/sdlc-upgrade-project` runs detection
**Then** it emits the `sdlc-models-defaults` refresh finding naming those stages, and on approval the refresh writes `implement` `haiku`/`xhigh` and `verify` `opus`/`medium` while keeping every other value and the key order

### AC4: The current defaults and project-chosen values are never offered

**Given** a valid `steering/sdlc-models.json` whose `implement` is `haiku`/`xhigh` and `verify` is `opus`/`medium`, or whose entries hold any value that is not an earlier plugin default
**When** `/sdlc-upgrade-project` runs detection or the refresh runs
**Then** no `sdlc-models-defaults` finding is emitted for those entries and the refresh reports `already-current` without writing

### AC5: Repository configuration and documentation state the new defaults

**Given** the nmg-sdlc repository
**When** its `steering/sdlc-models.json`, `README.md`, `workflows/onboard-project/WORKFLOW.md`, and `workflows/upgrade-project/references/detection.md` are read
**Then** they state `implement` `haiku`/`xhigh` and `verify` `opus`/`medium` as the defaults, and the earlier-default examples name `implement` `opus`/`medium` and `verify` `opus`/`high`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `STAGE_MODEL_DEFAULTS` sets `implement` to `haiku`/`xhigh` and `verify` to `opus`/`medium`; `start`, `deliver`, and `repair` are unchanged | Must |
| FR2 | `SUPERSEDED_STAGE_MODEL_DEFAULTS` lists `implement` `opus`/`medium` and `verify` `opus`/`high`, and no longer lists `implement` `haiku`/`xhigh` | Must |
| FR3 | Upgrade detection and the approved refresh move only entries whose `model` and `effort` both equal a listed earlier default to the current default | Must |
| FR4 | The repository's `steering/sdlc-models.json` uses the new `implement` and `verify` defaults | Must |
| FR5 | README, onboarding workflow, and upgrade detection reference state the new defaults and earlier-default examples | Must |
| FR6 | Tests assert the new defaults, the superseded list, and the refresh behavior for both stages | Must |

## Out of Scope

- Changing the `start`, `deliver`, or `repair` defaults
- Changing the models of the standalone `/sdlc-*` commands outside execute stages
- Changing the `steering/sdlc-models.json` schema, validation, or accepted model/effort values

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #568 | 2026-11-18 | Initial feature spec |
