# Tasks: Make /sdlc-execute stage models and efforts configurable per project via steering/sdlc-models.json

**Issue**: #535
**Date**: 2026-11-07
**Status**: Approved
**Author**: Rich Nunley

## Implementation Tasks

### T001: Add the stage-model configuration module

**File(s)**: `scripts/sdlc-models.mjs`
**Type**: Create
**Depends**: none
**Acceptance**:
- Exports `STAGE_MODEL_DEFAULTS`, `STAGE_MODELS_PATH`, `StageModelsError`, `isValidStageModel`, `validateStageModels`, `loadStageModels`, `stageModelsWarning`, and `completeStageModels` as specified in design.md (FR1, FR2, FR5, AC2, AC7, AC8)
- CLI `ensure --root <dir>` prints the JSON result and exits 0 for `created`, `completed`, or `already-current` and 1 for `invalid` (FR3)
- Uses only Node built-ins, `node:path`, and argv-array handling; never follows a symlinked target

### T002: Resolve execute worker models and efforts from the project file

**File(s)**: `scripts/sdlc-execute.mjs`, `src/host-events.mjs`, `src/host-events.d.mts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `stageModel` and `stageEffort` take the loaded config; repair dispatch uses the `repair` entry; effort `default` yields no `--effort` flag (AC4, AC5, FR6)
- `runExecute` validates the file after `parseArgs` and before `integrationStatus`, returning exit 2 with the diagnostic and making no `run` or Herdr call when invalid (AC8, FR7)
- `runCli` validates before `goal`, `list-specified`, `run`, and `supervise` and exits 2 with the diagnostic when invalid (AC8, FR7)
- An absent file or absent keys use defaults and prefix exactly one warning line to the controller stdout of the invocation (AC6, FR4)
- `SDLC_MODELS.stages`, `SDLC_MODELS.repair`, and `SDLC_EFFORTS.stages` are removed; `executeModelRefusal` and `hooks/register.ts` behavior are unchanged (AC9)

### T003: Add the `sdlc-models` upgrade item

**File(s)**: `scripts/sdlc-upgrade.mjs`, `workflows/upgrade-project/references/detection.md`, `workflows/upgrade-project/references/upgrade-procedures.md`, `workflows/upgrade-project/references/v3-detectors.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- Detection emits the `sdlc-models` item only for an absent file or a valid partial file; apply creates or completes it at order 10.8 using `completeStageModels` (AC3, FR3)
- Existing project values and key order are preserved; an invalid file is never rewritten; a complete file yields no item (AC3)
- The upgrade references document the item's detection, apply behavior, and order

### T004: Create the file during onboarding

**File(s)**: `workflows/onboard-project/WORKFLOW.md`, `workflows/onboard-project/references/greenfield.md`, `workflows/onboard-project/references/brownfield.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- Approved greenfield, enhancement, and brownfield plan execution runs `node <plugin-root>/scripts/sdlc-models.mjs ensure --root .` so `steering/sdlc-models.json` exists with defaults when it was absent (AC1, FR3)
- Already-initialized onboarding does not run it and still recommends `/sdlc-upgrade-project`

### T005: Document the configuration

**File(s)**: `README.md`, `workflows/execute/WORKFLOW.md`, `steering/snippets/project-tech.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T002, T003, T004
**Acceptance**:
- README `### Models` (under "How it runs in Claude Code"): the execute-stage rows of the step table read their values from `steering/sdlc-models.json`, and the verify default effort shows `high`. A new "Per-project stage models" subsection includes the complete default JSON example, explains that effort `default` omits `--effort`, lists the accepted model forms (Claude aliases, `claude-*` ids, `provider/model` ids such as nmg-router's `opencode-go/kimi-k3.1-pro`, passed verbatim and never checked for availability), states that invalid JSON, unknown keys, invalid models, or invalid efforts stop `/sdlc-execute` before any Herdr, Git, or GitHub call with a diagnostic naming the file, key, and value, describes the per-invocation warning and per-key fallback for an absent file or absent keys, and states that the file does not change slash-command or supervisor models. The section no longer names `SDLC_MODELS`/`SDLC_EFFORTS` as the stage maps (FR8)
- README "Onboarding/upgrade manage" list gains `steering/sdlc-models.json` (created with defaults when absent; upgrade adds only missing keys and never changes project values or rewrites an invalid file) (FR8, AC1, AC3)
- README `## Configure steering and verification` table gains a `steering/sdlc-models.json` row (project-owned execute stage models and efforts, not registered in `steering/manifest.json`) (FR8)
- README `## Status and troubleshooting` gains a bullet for an `steering/sdlc-models.json:` diagnostic (fix the named key and value) and for the missing-file warning (run `/sdlc-upgrade-project`) (FR8, AC6, AC8)
- The execute workflow passes the controller's `Warning: steering/sdlc-models.json …` line through with the rest of the output and treats an `steering/sdlc-models.json:` diagnostic exit as a stop that names the file to fix (AC6, AC8)
- `steering/snippets/project-tech.md` no longer states that agent frontmatter models match `SDLC_MODELS`
- `CHANGELOG.md` `[Unreleased]` gains a bullet ending with `(#535)`

### T006: Test the module and execute dispatch

**File(s)**: `scripts/__tests__/sdlc-models.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-commands.test.mjs`, `scripts/__tests__/steering-contract.test.mjs`
**Type**: Create | Modify
**Depends**: T001, T002, T005
**Acceptance**:
- AC2: `STAGE_MODEL_DEFAULTS` equals the AC2 table and the default argv for each step matches it (verify gains `--effort high`)
- AC4: with a fixture file setting verify to `sonnet`/`max`, the recorded `agentStart` argv for verify contains `--model sonnet --effort max`; a `default` effort entry has no `--effort`
- AC5: with repair `opus`/`high`, a repairable failure's re-dispatch argv contains `--model opus --effort high` and the next dispatch after a pass uses the stage entry
- AC6: without the file, argv uses defaults and the result stdout contains the missing-file warning exactly once
- AC7: `opencode-go/kimi-k3.1-pro` validates and appears verbatim after `--model` with `--effort xhigh`
- AC8: invalid JSON, unknown top-level key, invalid model (`gpt 5`, `/x`, `x/`, `-p/m`), and invalid effort each return exit 2 with a diagnostic naming `steering/sdlc-models.json`, the key, and the value, and the fixture `run`/Herdr spies record zero calls
- AC9: `executeModelRefusal` results are unchanged and neither `hooks/register.ts` nor `src/host-events.mjs` references `sdlc-models`
- `sdlc-commands.test.mjs` and `steering-contract.test.mjs` no longer assert removed stage maps; agent frontmatter is asserted against literal values; `cd scripts && npm test` exits 0

### T007: Test upgrade and onboard creation

**File(s)**: `scripts/__tests__/sdlc-upgrade.test.mjs`, `scripts/__tests__/sdlc-models.test.mjs`, `scripts/__tests__/onboard-sdlc-models-contract.test.mjs`
**Type**: Create | Modify
**Depends**: T003, T004
**Acceptance**:
- AC3: in a temp project, an absent file yields an `sdlc-models` create item and apply writes the defaults; a partial file (verify `sonnet`/`max`, no `repair`, no `deliver.effort`) gains only `repair` and `deliver.effort` with defaults while `verify` stays `sonnet`/`max`; a second detect reports no `sdlc-models` item and the file bytes are unchanged; an invalid file yields no item and is unchanged
- AC1: `ensure --root <tmp>` on a project without the file exits 0 with `status: 'created'` and writes all five entries plus `version: 1` with defaults; the onboard contract test asserts the three onboard workflow files name `sdlc-models.mjs ensure --root .`
- `node scripts/skill-inventory-audit.mjs --check` and `node scripts/verify-plugin-surface.mjs --root . --label repository` exit 0

### T008: Test the README documentation

**File(s)**: `scripts/__tests__/readme-sdlc-models-contract.test.mjs`
**Type**: Create
**Depends**: T005
**Acceptance**:
- FR8: the test reads `README.md` and asserts that the Models section contains `steering/sdlc-models.json`, the default verify effort `high`, `provider/model`, and `opencode-go/kimi-k3.1-pro`, that the managed-asset list and the steering configuration table name `steering/sdlc-models.json`, that the troubleshooting section names `/sdlc-upgrade-project` for the missing file, and that the README no longer names `SDLC_MODELS` or `SDLC_EFFORTS` as the stage maps
- `cd scripts && npm test` exits 0

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #535 | 2026-11-07 | Initial feature tasks |
