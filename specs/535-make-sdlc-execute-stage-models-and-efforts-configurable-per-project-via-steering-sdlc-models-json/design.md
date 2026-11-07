# Design: Make /sdlc-execute stage models and efforts configurable per project via steering/sdlc-models.json

**Issue**: #535
**Date**: 2026-11-07
**Status**: Approved
**Author**: Rich Nunley

## Overview

A new zero-dependency Node module, `scripts/sdlc-models.mjs`, owns the plugin default table, the `steering/sdlc-models.json` schema, validation, loading, and the create-or-complete write used by onboard and upgrade. `scripts/sdlc-execute.mjs` loads the project configuration before any Herdr, Git, or GitHub call and resolves every worker's `--model`/`--effort` from it. `scripts/sdlc-upgrade.mjs` gains an `sdlc-models` detect/apply item, and onboard runs the module's `ensure` CLI. The execute stage maps leave `src/host-events.mjs`, which keeps only command models and efforts.

## Architecture

```text
steering/sdlc-models.json ──► scripts/sdlc-models.mjs ──► scripts/sdlc-execute.mjs (runCli gate, runExecute, stageModel/stageEffort)
                                     │
                                     ├──► scripts/sdlc-upgrade.mjs (detect/apply `sdlc-models`)
                                     └──► CLI `ensure --root .` (onboard-project approved plan)
```

- `runCli` in `scripts/sdlc-execute.mjs` calls `loadStageModels(process.cwd())` before handling `goal`, `list-specified`, `run`, and `supervise`; an invalid file prints the diagnostic to stderr and sets exit code 2 before `branchGoalIssues`, `listSpecifiedIssues`, or `sessionCommand` run.
- `runExecute` loads the configuration immediately after `parseArgs` and before `api.integrationStatus()`. Invalid configuration returns `{ status: 2, stdout: '', stderr: '<diagnostic>\n' }`; `run` and `herdr` are never called. The loaded config is threaded into every `stageModel` / `stageEffort` call at `api.agentStart`.
- The warning text for an absent file or absent keys is prefixed exactly once to the `stdout` of every result `runExecute` returns after loading, so the supervisor's pass-through of controller output shows it once per invocation.
- `executeModelRefusal` in `src/host-events.mjs` and the hooks module are unchanged and never read `steering/sdlc-models.json`.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `STAGE_MODEL_DEFAULTS` (`scripts/sdlc-models.mjs`) | — | frozen `{ version: 1, start, implement, verify, deliver, repair }` | AC2 values: start haiku/default, implement haiku/xhigh, verify opus/high, deliver haiku/xhigh, repair opus/default |
| `STAGE_MODELS_PATH` | — | `'steering/sdlc-models.json'` | Project-relative path used in diagnostics and warnings |
| `validateStageModels(value)` | parsed JSON | `{ missing: string[] }` or throws `StageModelsError` with `.key` and `.value` | Rejects a non-object root, unknown top-level key, `version` ≠ 1, non-object entry, unknown entry key, non-string or invalid `model`, invalid `effort`; returns dotted missing keys (`version`, `verify`, `verify.effort`, …) |
| `isValidStageModel(model)` | string | boolean | Accepts alias `haiku`, `sonnet`, `opus`, `fable`, `opusplan`, `best`; `sonnet[1m]`, `opus[1m]`, `fable[1m]`; `^claude-[a-z0-9][a-z0-9.-]*(\[1m\])?$`; or `^[^/\s-][^/\s]*\/\S+$`. Never consults a provider list |
| `loadStageModels(root)` | project root | `{ config, missing: boolean, missingKeys: string[], warning: string \| null }` or throws `StageModelsError` | Absent file → defaults, `missing: true`. Invalid JSON → error with key `(file)` and the parse message. Partial valid file → defaults merged per missing key. A symlinked or non-regular file is an error |
| `stageModelsWarning(result)` | load result | string or null | Absent: `Warning: steering/sdlc-models.json is missing; using plugin default stage models and efforts. Run /sdlc-upgrade-project to create it.` Partial: `Warning: steering/sdlc-models.json is missing <keys>; using plugin defaults for them. Run /sdlc-upgrade-project to complete it.` |
| `StageModelsError.message` | — | string | `steering/sdlc-models.json: <key> = <JSON.stringify(value)>: <reason>`; for parse failures `steering/sdlc-models.json: invalid JSON: <parse message>` |
| `completeStageModels(root)` / CLI `node scripts/sdlc-models.mjs ensure --root <dir>` | project root | JSON `{ ok, changed, status, added }`; exit 0 on `created`, `completed`, `already-current`; exit 1 with `status: 'invalid'` and the diagnostic otherwise | Absent → writes defaults (2-space indent, LF, trailing newline, `wx` flag). Valid partial → keeps existing keys in their order, appends missing top-level keys and missing `model`/`effort` fields with defaults. Complete → no write. Invalid → no write |
| `stageModel(step, failure, config = STAGE_MODEL_DEFAULTS)` (`scripts/sdlc-execute.mjs`) | step, failure, config | model string | `config.repair.model` for a repair dispatch (existing `repairDispatch` rule), else `config[step].model`; unknown step throws `unknown stage: <step>` |
| `stageEffort(step, failure, config = STAGE_MODEL_DEFAULTS)` | step, failure, config | effort string or `undefined` | Selected entry's effort; `default` → `undefined` so `workerAgentArgs` omits `--effort` |
| `workerAgentArgs` | unchanged | unchanged | Passes the configured strings verbatim as separate argv elements |
| `SDLC_MODELS` / `SDLC_EFFORTS` (`src/host-events.mjs`, `src/host-events.d.mts`) | — | `SDLC_MODELS = { commands }`, `SDLC_EFFORTS = { commands }` | `stages` and `repair` are removed; command models/efforts unchanged |

## Data / Storage Changes

`steering/sdlc-models.json` is a project-owned, committed file. Top-level keys: `version` (number, 1) and the five entries `start`, `implement`, `verify`, `deliver`, `repair`, each `{ "model": string, "effort": string }`. No other keys are allowed. It is not registered in `steering/manifest.json` and is not loaded by the steering runtime.

Upgrade item (`scripts/sdlc-upgrade.mjs`):

- Detection emits `{ id: 'sdlc-models', kind: 'sdlc-models', rel: 'steering/sdlc-models.json', actionable: true, action: 'create' | 'complete', missingKeys }` when the file is absent or valid but missing keys; nothing when complete; nothing (the file is preserved) when invalid.
- Apply runs `completeStageModels` with a live re-check, returning `applied` with `created` or `updated: ['steering/sdlc-models.json']`, or `already-current`.
- Apply order 10.8 (after `changelog-create`, before `issue-dependencies`).

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Flat top-level stage keys plus `version` | Selected | Matches "unknown stage key" diagnostics directly and keeps the file short |
| Nested `stages` object | Rejected | Adds a level with no extra information |
| Keep `SDLC_MODELS.stages` and add a second defaults table | Rejected | Two tables would diverge (verify effort) and the agent frontmatter test would assert against the wrong one |
| Fail closed on a partial file at execute time | Rejected | Projects that have not upgraded would be blocked; per-key fallback with a warning matches the absent-file behavior |
| Register the file in `steering/manifest.json` | Rejected | It is execute configuration, not a prompt snippet or validation provider |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #535 | 2026-11-07 | Initial feature design |
