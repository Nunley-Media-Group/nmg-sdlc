# Requirements: Default the execute implement stage to Opus at medium effort and offer the new defaults on upgrade

**Issue**: #561
**Date**: 2026-11-15
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/535-make-sdlc-execute-stage-models-and-efforts-configurable-per-project-via-steering-sdlc-models-json/

## User Story

**As a** developer running `/sdlc-execute`
**I want** the implement stage to default to Opus at medium effort, with verify on Opus at high effort
**So that** implementation runs on a stronger model by default, and existing projects can adopt the new defaults through upgrade

## Background

`src/stage-models.mjs` `STAGE_MODEL_DEFAULTS` sets `implement` to `haiku`/`xhigh` and `verify` to `opus`/`high`. Onboarding and upgrade write these defaults into `steering/sdlc-models.json`. Upgrade only creates the file or adds missing keys; it never offers to move a project off a superseded plugin default.

## Acceptance Criteria

### AC1: New plugin defaults

**Given** the plugin's stage defaults
**When** they are read
**Then** `implement` is `opus` with effort `medium` and `verify` is `opus` with effort `high`
**And** `start`, `deliver` and `repair` are unchanged

### AC2: Onboarding and upgrade write the new defaults

**Given** a project with no `steering/sdlc-models.json`, or one missing keys
**When** `/sdlc-onboard-project` or `/sdlc-upgrade-project` creates or completes it
**Then** the written values are the new defaults

### AC3: Upgrade offers the new defaults to a project on the old ones

**Given** a valid, complete `steering/sdlc-models.json` whose `implement` or `verify` entry still holds a superseded plugin default (`implement` `haiku`/`xhigh`)
**When** `/sdlc-upgrade-project` runs
**Then** it offers an approvable item that sets those entries to the current defaults
**And** approving it changes only those entries and keeps every other value
**And** declining it leaves the file unchanged
**And** an entry the project set to a non-default value is never offered

### AC4: Docs and this repository match

**Given** the README stage-model table, the onboard and upgrade workflow text, and this repository's `steering/sdlc-models.json`
**When** the change is delivered
**Then** they state and use the new defaults

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `STAGE_MODEL_DEFAULTS.implement` is `{ model: 'opus', effort: 'medium' }`; `verify` stays `{ model: 'opus', effort: 'high' }`. | Must |
| FR2 | `src/stage-models.mjs` exports `SUPERSEDED_STAGE_MODEL_DEFAULTS`, the earlier plugin defaults per stage (`implement`: `haiku`/`xhigh`). | Must |
| FR3 | `scripts/sdlc-models.mjs` exports `staleStageDefaults(parsed)` and `refreshStageModelDefaults(root)`, which replaces only entries still equal to a superseded default and keeps every other value and key order. | Must |
| FR4 | `sdlc-upgrade.mjs` emits an actionable `sdlc-models-defaults` item (`action: refresh`, `entries`) for a valid file with such entries, applied after `sdlc-models` only when approved. | Must |
| FR5 | README, the onboard and upgrade workflow references, and this repository's `steering/sdlc-models.json` reflect the new defaults. | Must |
| FR6 | Tests cover AC1 to AC4. | Must |

## Out of Scope

- Changing the accepted model or effort values.
- Changing `start`, `deliver` or `repair` defaults.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #561 | 2026-11-15 | Initial feature spec |
