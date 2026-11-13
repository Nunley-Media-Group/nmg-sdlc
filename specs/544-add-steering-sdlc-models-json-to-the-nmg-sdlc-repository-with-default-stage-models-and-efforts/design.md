# Design: Add steering/sdlc-models.json to the nmg-sdlc repository with default stage models and efforts

**Issue**: #544
**Date**: 2026-11-13
**Status**: Approved
**Author**: Claude Code (write-spec)
**Related Spec**: specs/535-make-sdlc-execute-stage-models-and-efforts-configurable-per-project-via-steering-sdlc-models-json/

## Overview

Run the existing upgrade apply path for the `sdlc-models` item against this repository so `completeStageModels` writes `steering/sdlc-models.json` from `STAGE_MODEL_DEFAULTS`. No runtime code changes. Add a repository contract test that pins the checked-in file to the plugin defaults and asserts the upgrade detector emits no `sdlc-models` item for the repository root.

## Architecture

- `src/stage-models.mjs` — `STAGE_MODEL_DEFAULTS` (version 1; start haiku/default, implement haiku/xhigh, verify opus/high, deliver haiku/xhigh, repair opus/default).
- `scripts/sdlc-models.mjs` — `completeStageModels(root)` creates the file from defaults when absent.
- `scripts/sdlc-upgrade.mjs` — `detectSdlcModels` returns no item for a complete valid file; `applySdlcModels` calls `completeStageModels`.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `steering/sdlc-models.json` | — | JSON file | New checked-in file equal to `STAGE_MODEL_DEFAULTS`, written by `completeStageModels` |

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Run `sdlc-upgrade.mjs apply --approve sdlc-models` | Selected | Issue requires the helper path; output is byte-identical to the helper's canonical serialization |
| Hand-write the JSON | Rejected | Issue forbids creating the file by hand |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #544 | 2026-11-13 | Initial feature design |
