# Design: Default the execute implement stage to Haiku at xhigh effort and verify to Opus at medium effort

**Issue**: #568
**Date**: 2026-11-18
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/561-default-the-execute-implement-stage-to-opus-at-medium-effort-and-offer-the-new-defaults-on-upgrade/

## Overview

The change is a data change to the two tables in `src/stage-models.mjs`, plus matching repository configuration, documentation, and tests. The #561 machinery (`ensure`, `completeStageModels`, `staleStageDefaults`, `refreshStageModelDefaults`, and the `sdlc-models-defaults` upgrade item) already reads these tables and needs no logic change.

## Architecture

`src/stage-models.mjs` remains the single source of the defaults and the superseded table; `scripts/sdlc-models.mjs` re-exports them, and `scripts/sdlc-execute.mjs` (`stageModel`, `stageEffort`) and `scripts/sdlc-upgrade.mjs` consume them unchanged.

- `ensure` / `mergeMissing` / `completeStageModels` copy `STAGE_MODEL_DEFAULTS[name]` for absent entries or keys → AC1, AC2.
- `staleStageDefaults` matches an entry only when both `model` and `effort` equal a pair in `SUPERSEDED_STAGE_MODEL_DEFAULTS[name]`; `refreshStageModelDefaults` replaces only those entries with the current default, preserving other values and key order → AC3, AC4.
- The upgrade detector emits `sdlc-models-defaults` with `entries` from `staleStageDefaults`; its change text already renders `from <old> to <current>` per stage.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `STAGE_MODEL_DEFAULTS` (`src/stage-models.mjs`) | — | `implement: { model: 'haiku', effort: 'xhigh' }`, `verify: { model: 'opus', effort: 'medium' }`; `start`, `deliver`, `repair` unchanged | New plugin defaults |
| `SUPERSEDED_STAGE_MODEL_DEFAULTS` (`src/stage-models.mjs`) | — | `implement: [{ model: 'opus', effort: 'medium' }]`, `verify: [{ model: 'opus', effort: 'high' }]` | `haiku`/`xhigh` removed from `implement`; a stage's current default never appears in its own superseded list, so refresh cannot oscillate |

`src/stage-models.d.mts` types are shape-only (`StageEntry`) and need no change.

## Data / Storage Changes

`steering/sdlc-models.json` in this repository: `implement` → `{ "model": "haiku", "effort": "xhigh" }`, `verify` → `{ "model": "opus", "effort": "medium" }`; key order and other entries unchanged.

## Documentation Changes

- `README.md`: stage model table rows for `implement` (default `haiku`, effort `xhigh`) and `verify` (default `opus`, effort `medium`); Per-project stage models prose names the earlier-default examples `implement` `opus`/`medium` and `verify` `opus`/`high`; JSON example uses the new defaults.
- `workflows/onboard-project/WORKFLOW.md`: the `ensure` sentence states `implement` `haiku`/`xhigh`, `verify` `opus`/`medium`.
- `workflows/upgrade-project/references/detection.md` item 17: earlier plugin defaults are `implement` `opus`/`medium` and `verify` `opus`/`high`.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep `haiku`/`xhigh` in the superseded list alongside the new pairs | Rejected | It equals the new current default, so upgrade would offer a no-op refresh for every current file |
| Change only the tables and data; reuse #561 refresh logic | Selected | Detection and refresh are already table-driven |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #568 | 2026-11-18 | Initial feature design |
