# Tasks: Add an /sdlc-upgrade-project item that migrates non-kept test layers into BDD scenarios under a coverage guarantee

**Issue**: #572
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/571-make-bdd-scenarios-the-single-acceptance-test-layer-with-a-kept-test-types-steering-setting/

## Implementation Tasks

### T001: Add the test-coverage steering validator and command runner

**File(s)**: `scripts/test-coverage.mjs`
**Type**: Create
**Depends**: none
**Acceptance**:
- FR3: `validateTestCoverageConfig` accepts `{version:1, suite:{program,args}, coverage:{program,args}}`. It throws `TestCoverageError` naming `steering/test-coverage.json` and the field for:
  - an unsupported version;
  - an unknown key;
  - a missing or empty program;
  - non-string args.
- `loadTestCoverageConfig` returns `{missing:true}` for an absent file and rejects a symlink, a non-file, or invalid JSON.
- `validateCoverageReport` accepts the `{version:1, tests:[{id,file,lines,branches,outcomes}]}` format and rejects duplicate ids and malformed `path:N` / `path:N:K` entries.
- `runCommand` runs an argument array with no shell and reports `status` and `wallMs`.

### T002: Add the shared kept-types writer

**File(s)**: `scripts/test-layers.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR2/AC1/AC10: `writeTestLayers(root, kept)` validates through `validateTestLayers`, refuses a symlinked target, writes 2-space JSON with a trailing LF, and re-validates after writing.
- `kept` always contains `bdd`.

### T003: Add the test-layer inventory, candidates, snapshot and gate

**File(s)**: `scripts/upgrade-test-layers.mjs`
**Type**: Create
**Depends**: T001, T002
**Acceptance**:
- FR1/AC1/AC3:
  - `inventoryTestFiles` and `classifyTestFile` follow the design's file and type rules.
  - `pairWithFeatures` pairs by normalized stem.
  - `detectTestLayers` returns a `test-layers:<sha256>` item whose digest changes when any inventoried file, `steering/test-layers.json` or `steering/test-coverage.json` changes.
- AC3/AC10: `computeCandidates` never returns a test of a kept type. It labels tests `duplicate`, `convert` or `unmatched` as the design defines, and groups them into `batch-NNN` per file.
- AC6/AC7: `restore` returns every non-ignored path to the snapshot tree, without changing the real index, HEAD or refs.
- FR5/AC4/AC6/AC7: `gateBatch` refuses with `test_layers_suite_failed`, `test_layers_coverage_failed`, `test_layers_removal_out_of_batch` or `test_layers_coverage_gap` (listing the missing lines, branches and outcomes). Otherwise it accepts, with per-deleted-test evidence of the covering `bdd` test ids and the lines.

### T004: Wire the category and subcommands into the upgrade controller

**File(s)**: `scripts/sdlc-upgrade.mjs`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- FR1/FR2/FR7/AC2:
  - `detect` lists the `test-layers` item.
  - `apply` without the approved id, or with it but with no `--kept` and no recorded file, writes no test or steering file. The latter reports `skipped:kept_types_unrecorded`.
  - A stale digest fails with `test_layers_plan_stale` before mutation.
  - `--kept` writes `steering/test-layers.json` and `.nmg-sdlc/upgrade/test-layers/inventory.json`.
- AC8:
  - With `steering/test-coverage.json` missing or invalid, `apply` still records the choice and the inventory and reports the gap.
  - `test-layers-candidates` returns no batches and a refusal with `test_coverage_command_missing` or `test_coverage_config_invalid` naming the path.
- FR5/FR6/AC4–AC7/AC9:
  - `test-layers-batch begin|gate` and `test-layers-report` behave as the design states.
  - Refused batches leave the tree byte-identical to the pre-batch state.
  - The report prints before/after `testCount`, `wallMs`, `lines`, `branches` and `outcomes`, plus accepted evidence and refused gaps.
- `--kept` and `--batch` are value options. Bad arguments exit 2.

### T005: Document the item in the upgrade workflow

**File(s)**: `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/test-layer-migration.md`
**Type**: Modify
**Depends**: T004
**Acceptance**:
- FR2/FR4/FR8/AC1/AC5:
  - WORKFLOW.md adds detector 15, the single multi-select kept-types question (`bdd (Recommended)` first, only detected types, the fourth-type Other rule, skipped when only `bdd` is detected), and the plan argv.
  - The new reference gives the batch loop: candidates → begin → convert into scenarios or Examples rows reusing step definitions → delete → gate → report.
  - The reference says a refused batch is recorded and not retried unchanged.

### T006: Document the item and test-coverage.json in the README

**File(s)**: `README.md`
**Type**: Modify
**Depends**: T004
**Acceptance**:
- FR8: the README describes:
  - the test-layer migration item, its kept-types question, its batches and coverage gate, its refusal reason codes and its before/after report;
  - the `steering/test-coverage.json` format and the coverage command's output format.

### T007: Implement the feature.gherkin scenarios

**File(s)**: `scripts/__tests__/upgrade-test-layers.test.mjs`, `scripts/__tests__/upgrade-test-layers-contract.test.mjs`
**Type**: Create
**Depends**: T001, T002, T003, T004, T005, T006
**Acceptance**:
- The fixture tests create temporary Git projects whose suite and coverage commands are `node` scripts that emit fixture JSON and exit codes. Each test cites its `@SCN` tag:
  - `@SCN001` (AC1): WORKFLOW.md question text, and `apply --kept` writing the file.
  - `@SCN002` (AC2): `detect` and `apply` without `--kept` leave every file unchanged.
  - `@SCN003` (AC3): candidates exclude kept types and list pairs and subsets.
  - `@SCN004` (AC4): an accepted duplicate deletion and its evidence.
  - `@SCN005` (AC5): reference text, and a converted test accepted only when the new scenario covers it.
  - `@SCN006` (AC6): gap refusal, its listed gaps, and the byte-identical restore.
  - `@SCN007` (AC7): red-suite refusal and restore.
  - `@SCN008` (AC8): missing and invalid coverage config.
  - `@SCN009` (AC9): report fields, and that coverage is never lower.
  - `@SCN010` (AC10): a rerun with a new set rewrites the file and changes the candidates.
- `cd scripts && npm test` exits 0.

### T008: Add the CHANGELOG entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T007
**Acceptance**:
- `[Unreleased]` has a bullet under `### Added` describing the `/sdlc-upgrade-project` test-layer migration item and `steering/test-coverage.json`, ending with `(#572)`.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #572 | 2026-11-19 | Initial feature spec |
