# Requirements: Add steering/sdlc-models.json to the nmg-sdlc repository with default stage models and efforts

**Issue**: #544
**Date**: 2026-11-13
**Status**: Approved
**Author**: Claude Code (write-spec)
**Related Spec**: specs/535-make-sdlc-execute-stage-models-and-efforts-configurable-per-project-via-steering-sdlc-models-json/

## User Story

**As a** maintainer running `/sdlc-execute` on the nmg-sdlc repository
**I want** the repository to carry its own `steering/sdlc-models.json` with the plugin default stage models and efforts
**So that** execute uses explicit, reviewable stage settings here and the upgrade audit reports the repository as current

## Background

`/sdlc-execute` reads per-stage models and efforts from `steering/sdlc-models.json` and falls back to `STAGE_MODEL_DEFAULTS` (`src/stage-models.mjs`) when the file is absent. Without the file, `node scripts/sdlc-upgrade.mjs detect --root .` emits an actionable `sdlc-models` item with `action: create`. The upgrade helper's `sdlc-models` apply path (`completeStageModels` in `scripts/sdlc-models.mjs`) creates the file with the plugin defaults.

## Acceptance Criteria

### AC1: Stage models file is created with plugin defaults

**Given** the repository has no `steering/sdlc-models.json`
**When** the approved upgrade `node scripts/sdlc-upgrade.mjs apply --root . --approve sdlc-models` runs
**Then** `steering/sdlc-models.json` exists with `version: 1` and the plugin defaults for `start`, `implement`, `verify`, `deliver`, and `repair`

### AC2: Upgrade audit reports the file as current

**Given** `steering/sdlc-models.json` exists
**When** `node scripts/sdlc-upgrade.mjs detect --root .` reruns
**Then** it emits no `sdlc-models` item

### AC3: Tests still pass

**Given** `steering/sdlc-models.json` exists
**When** `cd scripts && npm test` runs
**Then** it passes

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Create `steering/sdlc-models.json` only through the upgrade helper (`completeStageModels`) with plugin default values | Must |
| FR2 | Add a `CHANGELOG.md` `[Unreleased]` bullet ending `(#544)` | Must |

## Out of Scope

- Changing default model or effort values in `STAGE_MODEL_DEFAULTS`
- Official blocked-by edge reconciliation and `publication-files` findings from the same upgrade audit

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #544 | 2026-11-13 | Initial feature spec |
