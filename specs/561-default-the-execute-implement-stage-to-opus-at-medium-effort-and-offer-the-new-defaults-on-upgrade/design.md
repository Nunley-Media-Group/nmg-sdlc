# Design: Default the execute implement stage to Opus at medium effort and offer the new defaults on upgrade

**Issue**: #561
**Date**: 2026-11-15
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/535-make-sdlc-execute-stage-models-and-efforts-configurable-per-project-via-steering-sdlc-models-json/

## Overview

A default change plus one new upgrade item. Onboarding needs no code change: `sdlc-models.mjs ensure` already writes `STAGE_MODEL_DEFAULTS`.

## Architecture

### Defaults (`src/stage-models.mjs`, `src/stage-models.d.mts`)

- `STAGE_MODEL_DEFAULTS.implement` becomes `{ model: 'opus', effort: 'medium' }`.
- New frozen export `SUPERSEDED_STAGE_MODEL_DEFAULTS = { implement: [{ model: 'haiku', effort: 'xhigh' }] }`: each stage lists the earlier plugin defaults it no longer uses. Future default changes append here.

### Refresh helper (`scripts/sdlc-models.mjs`)

- `staleStageDefaults(parsed)` returns the stage names whose entry has both `model` and `effort` equal to one of that stage's superseded defaults.
- `refreshStageModelDefaults(root)` re-reads and validates the live file (regular file only). With no stale entries it returns `already-current` and writes nothing; with stale entries it replaces just their `model` and `effort` with the current defaults, keeps key order, writes, and returns `{ ok, changed, status: 'refreshed', refreshed }`. An absent, symlinked or invalid file returns `invalid` and is never written.

### Upgrade item (`scripts/sdlc-upgrade.mjs`)

- `detectSdlcModelsDefaults(root)` emits `{ id: 'sdlc-models-defaults', kind: 'sdlc-models-defaults', action: 'refresh', entries, rel, actionable: true }` for a regular, valid file with stale entries. It is independent of the `sdlc-models` create/complete item.
- Apply order 10.81, after `sdlc-models`. Only approved items are applied, so a declined offer leaves the file unchanged.

### Docs

- README stage table, the `steering/sdlc-models.json` example and the upgrade description; onboard and upgrade workflow references (detection, procedures, v3 detectors). This repository's `steering/sdlc-models.json` takes the new defaults.

## Error and State Paths

| Condition | Result |
|-----------|--------|
| File becomes invalid between detect and apply | `failed:<diagnostic>`, no write |
| Entry edited to a custom value between detect and apply | Not refreshed; `already-current` if none remain |

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Offer any entry that differs from the current default | Rejected | Would nag projects that chose their own model on every upgrade |
| Rewrite old defaults silently | Rejected | The file is project-owned; changes need approval |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #561 | 2026-11-15 | Initial feature design |
