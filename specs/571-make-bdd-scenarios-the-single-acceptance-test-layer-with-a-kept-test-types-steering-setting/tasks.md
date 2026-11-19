# Tasks: Make BDD scenarios the single acceptance test layer with a kept-test-types steering setting

**Issue**: #571
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/535-make-sdlc-execute-stage-models-and-efforts-configurable-per-project-via-steering-sdlc-models-json/

## Implementation Tasks

### T001: Add the test-layers reader

**File(s)**: `src/test-layers.mjs`, `scripts/test-layers.mjs`
**Type**: Create
**Depends**: none
**Acceptance**:
- FR1/AC2: `validateTestLayers` accepts `{version:1, kept:[...]}` with known types including `bdd`. It throws `TestLayersError` naming `steering/test-layers.json` and the field for:
  - an unsupported version;
  - an unknown key;
  - an unknown type;
  - a duplicate type;
  - an empty `kept`;
  - a `kept` that lacks `bdd`.
- `loadTestLayers` resolves a missing file to `{version:1, kept:['bdd']}` and rejects invalid JSON, a symlink, or a non-file.
- `testLayersRule` names exactly the kept types.

### T002: Render the kept-types rule into stage prompts

**File(s)**: `src/sdlc-prompt-snippets.mjs`, `scripts/sdlc-render-prompt.mjs`, `hooks/register.ts`, `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR2/AC2: the rendered `sdlc-write-spec`, `worker:implement`, `worker:verify` and `sdlc-verify-code` prompts contain the `project.test-layers` rule naming exactly the kept types. With no manifest and no settings file, the rule is BDD-only.
- An invalid file fails the render with `test_layers_invalid`. The hooks module shows the diagnostic naming the file and field.
- `sdlc-execute.mjs` exits 2 with that diagnostic before any Git call.
- Plugin-only commands (`sdlc-onboard-project`, `sdlc-upgrade-project`, `sdlc-steering`) do not get the rule.

### T003: Make spec templates task only scenario implementations

**File(s)**: `workflows/write-spec/templates/tasks.md`, `workflows/write-spec/templates/feature.gherkin`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR3/AC1: the feature and defect test tasks implement `feature.gherkin` scenarios by `@SCN` tag, and no template text asks for a separate test that restates an AC.
- `feature.gherkin` documents Scenario Outline + Examples for variations under one `@SCN` tag.
- The existing `(#N)` changelog citation rule and `[Unreleased]` text in `tasks.md` are kept.

### T004: Limit implement test work to scenarios and justified kept-type tests

**File(s)**: `workflows/write-code/WORKFLOW.md`, `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- FR4/AC3: write-code says test work is the scenario implementations, and that any other test must be of a kept type, cover no scenario's behavior, and appear in the handoff's `justifiedTests` with its type and justification.
- `validateHandoff` accepts a handoff with no `justifiedTests` or a well-formed list. It rejects a malformed entry, or a `bdd` entry, with `handoff_invalid`.

### T005: Report scenario coverage and test-layer findings in verify

**File(s)**: `workflows/verify-code/checklists/report-template.md`, `workflows/verify-code/references/report-format.md`, `workflows/verify-code/checklists/testability.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- FR5/AC4: the report has a per-AC scenario coverage table and a test-layer findings list covering duplicates, non-kept types and justified tests. It has no per-layer test count.
- FR6/AC5:
  - The testability checklist applies the injectable-clock and DI checks to step definitions and production seams.
  - No score level mentions comprehensive unit tests or unit-test counts.

### T006: Document the setting

**File(s)**: `README.md`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- FR7/AC6: the README describes `steering/test-layers.json`, the five types, the BDD-only default, the validation failures, and how write-spec, implement and verify honor it.

### T007: Implement the feature.gherkin scenarios

**File(s)**: `scripts/__tests__/test-layers.test.mjs`, `scripts/__tests__/test-layers-contract.test.mjs`, `scripts/__tests__/sdlc-prompt-snippets.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `hooks/register.test.ts`
**Type**: Create
**Depends**: T001, T002, T003, T004, T005, T006
**Acceptance**:
- Each test cites its `@SCN` tag:
  - `@SCN001` (AC1): template text.
  - `@SCN002` (AC2): reader validation, rendered rule per consumer, missing-file default, invalid-file diagnostic through the hooks module and execute.
  - `@SCN003` (AC3): write-code text and `validateHandoff`.
  - `@SCN004` (AC4): report template and format text.
  - `@SCN005` (AC5): testability checklist text.
  - `@SCN006` (AC6): README text.
- `cd scripts && npm test` exits 0, and `hooks/register.test.ts` passes.

### T008: Add the CHANGELOG entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T007
**Acceptance**:
- `[Unreleased]` has a bullet under `### Added` describing BDD scenarios as the single acceptance layer and the `steering/test-layers.json` setting, ending with `(#571)`.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #571 | 2026-11-19 | Initial feature spec |
