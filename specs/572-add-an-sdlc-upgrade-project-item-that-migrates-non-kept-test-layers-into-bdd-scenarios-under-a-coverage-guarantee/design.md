# Design: Add an /sdlc-upgrade-project item that migrates non-kept test layers into BDD scenarios under a coverage guarantee

**Issue**: #572
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/571-make-bdd-scenarios-the-single-acceptance-test-layer-with-a-kept-test-types-steering-setting/

## Overview

- A static detector adds a digest-bound `test-layers` category to `sdlc-upgrade.mjs detect`.
- The interview chooses the kept set, and the approved `apply` writes it.
- Approved plan execution then drives `test-layers-candidates` and a per-batch `begin` / `gate` pair, and finishes with `test-layers-report`.
- The agent does the conversion and deletion edits between `begin` and `gate`. The deterministic gate decides whether each batch stays.

## Components

### `scripts/test-coverage.mjs` (new)

- `TEST_COVERAGE_PATH = 'steering/test-coverage.json'`
- `class TestCoverageError`, with messages of the form `${TEST_COVERAGE_PATH}: ${key} = ${JSON value}: ${reason}`
- `validateTestCoverageConfig(value)`:
  - It requires exactly the keys `version` (`1`), `suite` and `coverage`.
  - `suite` and `coverage` are each `{ program: non-empty string, args: string[] }`.
  - It rejects unknown keys.
- `loadTestCoverageConfig(root)`:
  - It rejects a symlink or a non-file.
  - A missing file returns `{ missing: true }`.
  - Invalid JSON or an invalid shape throws `TestCoverageError`.
- `validateCoverageReport(value)`:
  - It requires `{ version: 1, tests: [...] }`.
  - Each test is `{ id, file, lines, branches, outcomes }`, where `id` is a unique non-empty string, `file` is a repository-relative path, and the other three fields are arrays of strings.
  - `lines` entries match `path:N`, and `branches` entries match `path:N:K`.
- `runCommand(root, { program, args })`: `spawnSync` with an argument array, `cwd: root` and no shell. It returns `{ status, stdout, stderr, wallMs }`, with the wall time measured around the call.

### `scripts/test-layers.mjs` (modify, #571 module)

`writeTestLayers(root, kept)`:
- It builds `{ version: 1, kept }` and validates it with #571's `validateTestLayers`. No second parser is added.
- It refuses a symlinked target.
- It writes 2-space JSON plus a trailing LF, then re-reads the file and validates it again.

### `scripts/upgrade-test-layers.mjs` (new)

**Inventory (`inventoryTestFiles(root)`)**
- It walks the repository with `node:path`, skipping `.git`, `.nmg-sdlc`, `node_modules`, `vendor`, `dist`, `build` and symlinks.
- A file is a test file when it:
  - ends in `.feature`; or
  - has a basename matching `*.test.*`, `*.spec.*`, `*_test.*`, `test_*.*`, `*Test.*` or `*Tests.*`; or
  - is a source file under a `__tests__`, `test`, `tests` or `spec` directory.
- `classifyTestFile(rel, text, featureFileRefs)` returns the first matching type, in this order:
  1. `bdd`: a `.feature` file, a file under a `steps` or `step_definitions` directory, a file citing `@SCN\d+`, or a file named by a feature's `# File:` header.
  2. `integration`: a path segment or basename token of `integration`, `component` or `e2e`.
  3. `property`: a token of `property`, `properties` or `fuzz`.
  4. `doc`: a token of `doc`, `docs`, `contract` or `steering`.
  5. `unit`: anything else.

**Pairing (`pairWithFeatures(inventory)`)**
- A non-`bdd` test file pairs with a `.feature` file when their normalized stems are equal.
- The normalized stem is the basename with the test markers (`.test`, `.spec`, `_test`, `test_`, `Test`, `Tests`) and the extension removed, lower-cased, with `-`, `_` and case boundaries folded to `-`.

**Item (`detectTestLayers(root)`)**
- There is no item when no test file exists.
- Otherwise the item is:
  - id `test-layers:<sha256>`, kind `test-layers`, `actionable: true`;
  - `detectedTypes` (type → file count, in vocabulary order);
  - `recordedKept` (from `loadTestLayers`, or `null` when the file is missing);
  - `pairs` (each non-`bdd` file with its feature and type);
  - `coverageConfig: 'present' | 'missing' | 'invalid'`.
- The digest covers the sorted inventory (path, type and SHA-256 of the bytes), plus the bytes of `steering/test-layers.json` and `steering/test-coverage.json`, or an absent marker for each.

**Candidates (`computeCandidates(inventory, kept, coverage)`)**
- It considers only tests whose file type is not in `kept`.
- `duplicate`: a test whose `lines`, `branches` and `outcomes` are each a subset of a single `bdd` test's. It records the covering test ids.
- `convert`: a test in a paired file that is not `duplicate`. Its target is the paired feature.
- `unmatched`: everything else, which is reported only.
- A batch is one non-kept test file with at least one `duplicate` or `convert` test. Batch ids are `batch-NNN`, numbered in sorted path order.

**Snapshot and restore**
- `begin` requires a Git work tree, or it fails with `test_layers_git_required`.
- It stages every non-ignored file into a temporary index at `.nmg-sdlc/upgrade/test-layers/index-<batch>`, using `GIT_INDEX_FILE` and `git add -A`, then records `git write-tree`.
- `restore(tree)`:
  - writes every path of that tree back into the work tree, using `read-tree` and `checkout-index -a -f` on the temporary index;
  - deletes each non-ignored path that exists now but is absent from the tree.
- The real index, HEAD and refs are never changed.

**Gate (`gateBatch(before, after, suite, batch, kept)`)**
1. If the suite exits non-zero → refuse with `test_layers_suite_failed`.
2. If the coverage command fails or its output is invalid → refuse with `test_layers_coverage_failed`.
3. If a test of a kept type was removed, or a removed test lies outside the batch's file → refuse with `test_layers_removal_out_of_batch`.
4. Let R be the union of the removed tests' lines, branches and outcomes, and K the union of those sets over the kept-type tests after the batch. If R ⊄ K, or the all-tests union shrank → refuse with `test_layers_coverage_gap`. The refusal lists the missing lines, branches and outcomes.
5. Otherwise accept. For each removed test, the evidence records its id and file, the covering `bdd` test ids, and its lines.

A refusal calls `restore` before returning. Batch records are written to `.nmg-sdlc/upgrade/test-layers/batches/<batch>.json`.

### `scripts/sdlc-upgrade.mjs` (modify)

**Detection and apply**
- `detectUpgrade` pushes `detectTestLayers(rootAbs)`.
- `apply` accepts `--kept <comma list>` and `--approve test-layers:<digest>`.
- A digest that no longer matches the live item → error `test_layers_plan_stale`, raised before any mutation.
- The approved item applies at priority `10.82`, after `sdlc-models-defaults`.
- `applyTestLayers`:
  - With `--kept`, it calls `writeTestLayers` (with `bdd` added if absent).
  - Without `--kept` and with no recorded file, it returns `skipped:kept_types_unrecorded` and writes nothing.
  - Otherwise it keeps the recorded set.
  - It then writes `.nmg-sdlc/upgrade/test-layers/inventory.json`. A missing or invalid `steering/test-coverage.json` adds `gap: { reasonCode, path, key? }` to the result.

**New subcommands** (each prints one JSON object; exit 0 on `ok:true`, 1 on refusal, 2 on bad arguments)
- `test-layers-candidates --root .`
  - It requires a recorded `steering/test-layers.json` and a valid `steering/test-coverage.json`. Otherwise it returns `ok:true` with `batches: []` and `refused: [{ reasonCode: 'test_coverage_command_missing' | 'test_coverage_config_invalid', path, key? }]`.
  - It runs the suite (timed) and the coverage command, then writes `baseline.json`.
  - It prints `batches`, `unmatched` and the baseline counts.
- `test-layers-batch begin --root . --batch <id>`: it takes the snapshot, runs the coverage command for the pre-batch state, and writes `batches/<id>.begin.json`.
- `test-layers-batch gate --root . --batch <id>`: it runs the suite and the coverage command, then calls `gateBatch`. It restores the snapshot on refusal and prints `{ ok, batch, status: 'accepted' | 'refused', reasonCode?, gap?, deleted? }`.
- `test-layers-report --root .`:
  - It runs the suite and the coverage command at the current tree, and reads `baseline.json` and every batch record.
  - It prints `before` / `after` `{ testCount, wallMs, lines, branches, outcomes }` (unique-set sizes), plus `accepted` evidence and `refused` gaps.
  - If any after-coverage count is below its before count, it prints `ok:false` with `test_layers_coverage_regressed`.

`CLI_VALUE_OPTIONS` gains `--kept` and `--batch`.

### Workflow and reference

- `workflows/upgrade-project/WORKFLOW.md`:
  - Detector 15 describes the `test-layers` category.
  - The Interview section adds the kept-types question:
    - It is one multi-select question.
    - Its options are `bdd (Recommended)` first, then the detected non-`bdd` types in vocabulary order, at most three.
    - When a fourth non-`bdd` type is detected, the question paragraph names it and says to type it in Other.
    - The question is skipped when `bdd` is the only detected type.
  - The Plan section shows the exact `apply ... --approve test-layers:<digest> --kept <types>` argv, followed by the reference procedure's commands.
- `workflows/upgrade-project/references/test-layer-migration.md` (new) gives the batch loop:
  1. Run `test-layers-candidates`.
  2. For each batch, run `begin`.
  3. For each `convert` test, add a scenario or an Examples row to the paired feature, reusing existing step definitions and adding production seams only where steps need them.
  4. Delete the `duplicate` and converted tests.
  5. Run `gate`. A refused batch is recorded and the loop continues with the next batch.
  6. Finish with `test-layers-report`.

### README

- The "Existing projects" section gains a "Test-layer migration" paragraph covering the item, the kept-types question, batches, the gate, refusals and the report.
- The "Configure steering and verification" table gains `steering/test-coverage.json`, with its format and the coverage output format.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Coverage key inside `steering/test-layers.json` | Rejected | #571's validator rejects unknown keys |
| Running coverage during plan-mode `detect` | Rejected | Runs the suite and may write artifacts while still in plan mode |
| Commit each accepted batch to snapshot | Rejected | Upgrade does not commit; a temporary-index tree restores without touching HEAD |
| Static detect + post-approval coverage candidates + per-batch gate | Selected | Plan shows the static scope, and every deletion is proven |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #572 | 2026-11-19 | Initial feature spec |
