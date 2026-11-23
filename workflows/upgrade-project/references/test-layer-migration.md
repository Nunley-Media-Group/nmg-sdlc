# Test-Layer Migration

Read this when an approved upgrade plan includes the `test-layers` category. It moves tests of types the project does not keep into BDD scenarios, one batch at a time, and never trades away coverage: a deterministic gate in `scripts/sdlc-upgrade.mjs` decides whether each batch stays, and restores the pre-batch tree when it does not.

All commands run from the project root and print one JSON object. Exit 0 means `ok:true`, 1 a refusal, 2 bad arguments.

## Prerequisites

- `steering/test-layers.json` records the kept set (written by `apply --approve test-layers:<digest> --kept <types>`).
- `steering/test-coverage.json` declares the suite and per-test coverage commands as argument arrays:

  ```json
  {
    "version": 1,
    "suite": { "program": "npm", "args": ["test"] },
    "coverage": { "program": "node", "args": ["tools/per-test-coverage.mjs"] }
  }
  ```

  The coverage command prints `{ "version": 1, "tests": [{ "id", "file", "lines": ["path:N"], "branches": ["path:N:K"], "outcomes": ["…"] }] }`. Two outcomes are equivalent when their strings are equal. Keep test ids stable across edits: the gate detects a removed test by id, so an id that embeds a line number (such as `features/cart.feature:12`) changes when a row is inserted above it and the batch is refused with `test_layers_removal_out_of_batch`. Use scenario names or Examples-row keys instead.
  The command may instead write the report to the file named by `NMG_SDLC_COVERAGE_OUTPUT` as v2: a `{"version":2}` header line with an optional `executableLines`, then one test per line `{ "id", "file", "lines": {"path": [[from,to]]}, "branches": {"path": [[line,fromIndex,toIndex]]}, "outcomes": [...] }`, with per-file `[from, to]` line ranges and `[line, fromIndex, toIndex]` branch triples. When that file is absent after a successful run, stdout is read as v1, so a v1 command is unchanged. A malformed v2 line refuses the batch with `test_layers_coverage_failed` and a message that begins with its line number.
- The project is a Git work tree. Each batch is snapshotted into a temporary index under `.nmg-sdlc/upgrade/test-layers/`; HEAD, refs and the real index are never changed.

When the coverage file is missing or invalid, `apply` still records the kept set and the inventory, and `test-layers-candidates` returns no batches with `test_coverage_command_missing` or `test_coverage_config_invalid` naming `steering/test-coverage.json`. Report that gap in the plan outcome and delete nothing.

## Batch loop

1. Run `["node","<plugin-root>/scripts/sdlc-upgrade.mjs","test-layers-candidates","--root","."]`. It runs the suite and coverage, records the baseline on the first run only, and lists `batches` (one non-kept test file each) and `unmatched` tests. Each batch test is `duplicate` (a single `bdd` test already covers its lines, branches and outcomes) or `convert` (its file pairs with a `.feature` file and no scenario covers it yet). Tests of kept types are never candidates. Leave `unmatched` tests in place.
2. For each batch in order, run `test-layers-batch begin --root . --batch <id>` before editing anything, so the gate can compare against and restore the pre-batch state. Begin refuses a batch that is already begun and not yet gated (`test_layers_batch_already_begun`), so the recorded snapshot is never replaced by an edited tree; gate it first. It also refuses an accepted batch (`test_layers_batch_already_accepted`), an id missing from the latest candidates (`test_layers_batch_unknown`), and a project outside a Git work tree (`test_layers_git_required`); `test_layers_snapshot_failed` means a Git command failed while snapshotting. Run one batch at a time: every batch restores the whole work tree.
3. For each `convert` test, add the behavior to the paired feature as a new scenario or a Scenario Outline Examples row, reusing existing step definitions where they apply. Add production seams only where the new steps need them.
4. Delete the batch's `duplicate` tests and the tests you converted, and touch no test outside the batch's file. Delete a converted test only in the same batch as its conversion.
5. Run `test-layers-batch gate --root . --batch <id>`. It accepts the batch, with per-deleted-test evidence (the covering `bdd` test ids and the covered lines), or refuses it and restores the pre-batch tree byte for byte:
   - `test_layers_suite_failed`: the suite exited non-zero.
   - `test_layers_coverage_failed`: the coverage command failed or printed an invalid report.
   - `test_layers_removal_out_of_batch`: a kept-type test, or a test outside the batch's file, was removed.
   - `test_layers_coverage_gap`: kept-type tests no longer cover a removed test's line, branch or outcome, or total coverage shrank; the output lists the missing entries.
   - `kept_types_unrecorded`, `test_layers_invalid`, `test_coverage_command_missing` or `test_coverage_config_invalid`: a steering file the gate needs was removed or broken after begin.

   A gate on a batch with no begin record refuses with `test_layers_batch_not_begun` and changes nothing. A refused batch is recorded and not retried unchanged in this run; continue with the next batch.
6. Finish with `test-layers-report --root .`. It prints `before` and `after` `testCount`, `wallMs`, `lines`, `branches` and `outcomes`, the accepted evidence, and every refused batch with its gap. `ok:false` with `test_layers_coverage_regressed` means an after-coverage count fell below its baseline; report it rather than hiding it. Report refuses with `test_layers_baseline_missing` when `test-layers-candidates` has never recorded a baseline.

Candidates, begin and report refuse with the same steering reason codes as the gate: `kept_types_unrecorded` (no `steering/test-layers.json`), `test_layers_invalid` (that file is invalid), `test_coverage_command_missing` or `test_coverage_config_invalid`. Candidates reports them under `refused` with no batches; begin and report return them with `ok:false`.

## Reruns and limits

Rerun `test-layers-candidates` after an interrupted run or a kept-set change. It keeps the original baseline and gives each file the batch id it had before (new files take the next unused number), so earlier accepted and refused records survive and the report still compares against the pre-migration state. An accepted batch's id is retired: when its file still holds candidate tests (a convert test left for later, or a test that a newer scenario now duplicates), the file is listed again under a new id, and the report shows both accepted batches. To start a migration from scratch, delete `.nmg-sdlc/upgrade/test-layers/` first.

Restore rewrites only the paths changed since begin and removes files added after it. It round-trips the tree through `git add` and `git checkout-index`, so a repository with clean or smudge filters (Git LFS, `core.autocrlf`, `text`/`eol` attributes) may not restore byte for byte. Check `git status` after a refused batch in such a repository.
