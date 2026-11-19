# Design: Make BDD scenarios the single acceptance test layer with a kept-test-types steering setting

**Issue**: #571
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/535-make-sdlc-execute-stage-models-and-efforts-configurable-per-project-via-steering-sdlc-models-json/

## Overview

A new pure module validates `steering/test-layers.json` and turns it into one rule text. The prompt registry adds that text as a computed, per-project fragment for four consumers. The templates, the write-code workflow and the verify checklists then refer to that rule instead of asking for a second test layer.

## Components

### `src/test-layers.mjs` (new, no Node imports)

Modeled on `src/stage-models.mjs`:
- `TEST_LAYERS_PATH = 'steering/test-layers.json'`
- `TEST_LAYER_TYPES = Object.freeze(['bdd', 'unit', 'integration', 'property', 'doc'])`
- `TEST_LAYER_DEFAULTS = Object.freeze({ version: 1, kept: ['bdd'] })`
- `class TestLayersError`, with the message format `${TEST_LAYERS_PATH}: ${key} = ${JSON value}: ${reason}` and `.key` / `.value` set
- `validateTestLayers(value)`:
  - It requires an object with exactly the keys `version` and `kept`, and `version === 1`.
  - `kept` must be a non-empty array of unique strings drawn from `TEST_LAYER_TYPES` that includes `bdd`.
  - It throws `TestLayersError` naming the offending field (`version`, `kept`, `kept[i]`, or the unknown key).
  - It returns the normalized config, with `kept` ordered as in the vocabulary.
- `testLayersRule(config)`: the rendered rule. It contains:
  - the kept types, by name and description;
  - the statement that `bdd` (scenario implementations: step definitions, or the test named by the scenario's `# File:` header that cites its `@SCN` tag) is the acceptance layer;
  - a ban on tests that restate a scenario's AC;
  - the rule that any other test must be of a kept type, cover no scenario's behavior, and be justified.

### `scripts/test-layers.mjs` (new)

`loadTestLayers(root)` mirrors `loadStageModels` in `scripts/sdlc-models.mjs`:
- It uses `lstat` and rejects a symlink or a non-file.
- A missing file (ENOENT) returns `{ config: TEST_LAYER_DEFAULTS, missing: true }`.
- Invalid JSON throws `TestLayersError('(file)', …)`.
- A parsed file goes through `validateTestLayers`.

### Prompt rendering

- In `defaultPromptRegistry` (`src/sdlc-prompt-snippets.mjs`), when `projectRoot` is set and `pluginOnly` is false, add a fragment computed per render:
  - id `project.test-layers`, `source: "builtin:project.test-layers"`, slot `extra`;
  - consumers `sdlc-write-spec`, `worker:implement`, `worker:verify` and `sdlc-verify-code`;
  - body `testLayersRule(loadTestLayers(projectRoot).config)`.
  - It is added whether or not `steering/manifest.json` exists, because a missing settings file still means BDD-only.
- A `TestLayersError` fails the render with `reasonCode: "test_layers_invalid"` and `message` set to the error message.
  - `scripts/sdlc-render-prompt.mjs` already emits `{ok:false, reasonCode, message}`.
  - `hooks/register.ts` shows `<reasonCode>: <message>` when a message is present, so the file and field reach the user.
- `sdlc-execute.mjs` checks `loadTestLayers` before any Git call, next to its existing `loadStageModels` check (in `runExecute` and the `goal`/`list-specified`/`run`/`supervise` CLI path). It exits 2 with the error message, so workers never start against an invalid file.

### Templates and workflows

- `workflows/write-spec/templates/tasks.md`:
  - The feature task `T002` becomes "Implement the `feature.gherkin` scenarios". Its `**File(s)**` names the step-definition file or the scenario test file. Its Acceptance lists each `@SCN` tag and its AC, plus the production seams the steps need.
  - The defect "Add Behavioral Regression Coverage" task implements the defect scenario the same way.
  - The header rule forbids tasks for separate tests that restate an AC.
- `workflows/write-spec/templates/feature.gherkin` gains authoring rules:
  - variations of one AC use a `Scenario Outline` with `Examples`, carrying that AC's single `@SCN` tag;
  - the `# File:` header names the scenario's implementing test.
- `workflows/write-code/WORKFLOW.md`:
  - "Execute Tasks in Order" gains a test-layer rule that defers to the rendered kept-types rule.
  - "Write Handoff" documents the optional `justifiedTests: [{ path, type, justification }]` array and lists it in the summary output.
- `validateHandoff` (`scripts/sdlc-execute.mjs`) accepts an absent `justifiedTests`, or an array of objects with non-empty string `path`, `type` from `TEST_LAYER_TYPES` other than `bdd`, and non-empty `justification`. Anything else is rejected with `handoff_invalid`.

### Verify

- `workflows/verify-code/checklists/report-template.md`: the "Coverage Summary" per-layer counts are replaced by a per-AC table with the columns AC, `@SCN` scenario, implementation path, and status (implemented / missing / failing). A "Test-layer findings" list flags duplicate tests and tests of non-kept types among the files the branch added or changed, and echoes the implement handoff's `justifiedTests`.
- `workflows/verify-code/references/report-format.md`: the Test Coverage block is updated to match.
- `workflows/verify-code/checklists/testability.md`:
  - "Unit Test Readiness" becomes "Seam Readiness". Its injectable-clock and DI checks apply to step definitions and production seams.
  - The anti-pattern lines refer to scenario steps.
  - Scoring levels 4 and 5 drop "comprehensive unit tests" and "high coverage" in favor of scenario coverage and injectable seams.

### README

The "Configure steering and verification" surface table gains a `steering/test-layers.json` row. A new "### Kept test layers" section documents the format, the vocabulary, the BDD-only default, the validation failures, and how write-spec, implement and verify honor the setting. The file is not registered in `steering/manifest.json`.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Register the file as a project snippet | Rejected | Snippets are static markdown inlined raw; the rule must be computed and validated |
| Fall back to BDD-only on an invalid file | Rejected | AC2 requires a visible rejection |
| Computed `project.test-layers` fragment from a pure reader | Selected | It reuses the registry's consumer routing and the stage-models validation pattern |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #571 | 2026-11-19 | Initial feature spec |
