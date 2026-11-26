# Tasks: Add a technology-agnostic e2e test type that projects identify by declared path globs

**Issue**: #635
**Date**: 2026-11-25
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/571-make-bdd-scenarios-the-single-acceptance-test-layer-with-a-kept-test-types-steering-setting/

## Implementation Tasks

### T001: Add the e2e type, paths validation, glob lookup and rule text

**File(s)**: `src/test-layers.mjs`, `scripts/test-layers.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1: `TEST_LAYER_TYPES` is `['bdd', 'e2e', 'unit', 'integration', 'property', 'doc']` and `e2e` has the description in design.md.
- FR2/AC7: `validateTestLayers` accepts an optional `paths` object and rejects, with `TestLayersError` naming `paths`, `paths.<type>` or `paths.<type>[<index>]` and the value: a non-object `paths`, an unknown type key, a non-array value, a non-string, empty or `/`-leading glob, a glob with a `..` segment, and a glob repeated anywhere in the map. Input without `paths` normalizes to exactly `{ version, kept }`.
- FR3: `declaredTestType(config, rel)` implements the glob semantics in design.md, returns the matching type or `null`, and throws `TestLayersError` (key `paths`, `test_layers_invalid`) naming the file and both types when two types match. `src/test-layers.mjs` still has no imports.
- FR7/AC6: `testLayersRule` renders the e2e description, the e2e scenario-implementation line when `e2e` is kept, and one line of globs per declared type when `paths` is declared.
- FR9: `writeTestLayers` writes back a valid existing file's `paths` with the new `kept`, and throws without writing when the existing file is invalid.

### T002: Classify by declared globs across the inventory, upgrade and check

**File(s)**: `scripts/upgrade-test-layers.mjs`, `scripts/check-test-layers.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR3/AC2: `classifyTestFile` returns the declared type before every built-in rule, and `scan` includes a file that a declared glob matches even when `isTestPath` is false.
- FR4/AC3: with no matching glob every input keeps its previous type, except that the `e2e` path token gives `e2e`; `component` still gives `integration`.
- FR5/AC4: `pairWithFeatures` excludes kept `e2e` files in the detector item, the recorded inventory and `computeCandidates`; kept e2e tests are never `duplicate`, `convert` or `unmatched`; `check-test-layers` reports no violation for them.
- FR6/AC5: `gateBatch` counts a kept e2e test's lines, branches and outcomes in the kept union.
- FR8/AC8: `detectedTypes` reports `e2e`; `apply --kept bdd,e2e` records it.
- AC3: a two-type match is reported as `test_layers_invalid` with the diagnostic by `check-test-layers`, `apply`, candidates, begin, gate and report, and as `configError` by `detect`, as design.md describes.

### T003: Document e2e and paths in the workflows, README and changelog

**File(s)**: `workflows/write-spec/templates/tasks.md`, `workflows/write-code/WORKFLOW.md`, `workflows/verify-code/references/report-format.md`, `workflows/verify-code/checklists/report-template.md`, `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/detection.md`, `workflows/upgrade-project/references/v3-detectors.md`, `workflows/upgrade-project/references/test-layer-migration.md`, `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- FR7/AC6: the write-spec tasks template and the write-code workflow say that, when `e2e` is kept, a scenario's implementation may be an e2e test that cites its `@SCN` tag, for behavior only observable through the running app or UI.
- FR6/AC5: the verify report format and template say that a kept e2e test citing a scenario's `@SCN` tag is listed in that AC's Implementation column marked `(e2e)`, and is neither a Duplicate nor a Non-kept type finding. The existing table rows are unchanged.
- FR8/AC8: the upgrade workflow and its references list the six types in vocabulary order, name `e2e` first among the non-`bdd` options, and describe `configError` and the `apply` refusal on an invalid file.
- FR10: README "Kept test layers" and the upgrade section document `e2e`, the `paths` field, the glob syntax, glob precedence over built-in rules, the two-type conflict and the preserved `paths` on `apply --kept`, with `paths` examples for Flutter (`mobile/integration_test/**`) and a web stack (`cypress/**`).
- `CHANGELOG.md` `[Unreleased]` gains an `### Added` bullet describing the feature that ends with `(#635)`.

### T004: Implement the `feature.gherkin` scenarios

**File(s)**: `scripts/__tests__/e2e-test-type.test.mjs`, `scripts/__tests__/test-layers.test.mjs`, `scripts/__tests__/test-layers-contract.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/upgrade-test-layers-contract.test.mjs`
**Type**: Create | Modify
**Depends**: T001, T002, T003
**Acceptance**:
- Each `describe` in `scripts/__tests__/e2e-test-type.test.mjs` cites its scenario tag.
- `@SCN001` (AC1): `{ version: 1, kept: ['e2e', 'bdd'] }` loads, normalizes to `['bdd', 'e2e']`, and the rendered rule names `e2e` with its description.
- `@SCN002` (AC2): in a disposable project declaring `paths.e2e: ["mobile/integration_test/**"]`, the inventory lists both example files as `e2e`, including a copy that cites an `@SCN` tag.
- `@SCN003` (AC3): each table row keeps its type with only the `e2e` token changed, and a file matching `e2e` and `unit` globs makes `check-test-layers` fail with `test_layers_invalid` naming the file and both types.
- `@SCN004` (AC4): with `kept: ["bdd", "e2e"]` and an e2e file whose stem pairs with a `.feature` file, the detector item's `pairs` and the inventory's `pairs` omit it, `test-layers-candidates` lists none of its tests in `batches` or `unmatched`, and `check-test-layers` passes.
- `@SCN005` (AC5): a glob-declared file citing an `@SCN` tag classifies as `e2e`; `gateBatch` accepts a batch whose removed test is covered only by a kept e2e test; the verify report format and template contain the e2e implementation rule.
- `@SCN006` (AC6): the rule rendered for `kept: ["bdd", "e2e"]` with `paths` contains the e2e scenario-implementation line and the declared globs; the write-spec tasks template contains the e2e sentence; handoff validation accepts a `justifiedTests` entry of type `e2e`.
- `@SCN007` (AC7): each Examples row throws `TestLayersError` with `reasonCode` `test_layers_invalid` and the listed field.
- `@SCN008` (AC8): the detector reports `detectedTypes.e2e`; the upgrade workflow names `e2e` first among the non-`bdd` options; `apply --approve test-layers:<digest> --kept bdd,e2e` writes `kept: ["bdd", "e2e"]` and leaves `paths` unchanged; the same apply on an invalid existing file fails and leaves its bytes unchanged.
- Existing assertions that use `e2e` as an unknown type, or that spell the five-type list, are updated to the six-type vocabulary with a different unknown type.
- `node scripts/check-test-layers.mjs --root .` passes, and `cd scripts && npx jest --runInBand __tests__/e2e-test-type.test.mjs __tests__/test-layers.test.mjs __tests__/test-layers-contract.test.mjs __tests__/upgrade-test-layers.test.mjs __tests__/upgrade-test-layers-contract.test.mjs __tests__/check-test-layers.test.mjs __tests__/pytest-bdd-binding.test.mjs __tests__/sdlc-execute.test.mjs` passes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #635 | 2026-11-25 | Initial feature tasks |
