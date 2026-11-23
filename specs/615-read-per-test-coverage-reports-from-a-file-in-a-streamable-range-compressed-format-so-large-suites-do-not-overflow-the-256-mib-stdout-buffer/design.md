# Root Cause Analysis: Read per-test coverage reports from a file in a streamable, range-compressed format so large suites do not overflow the 256 MiB stdout buffer

**Issue**: #615
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/572-add-an-sdlc-upgrade-project-item-that-migrates-non-kept-test-layers-into-bdd-scenarios-under-a-coverage-guarantee/

## Root Cause

The per-test coverage report travels only through stdout and is held as one string:

- `runCommand` in `src/test-coverage.mjs` calls `spawnSync` with `maxBuffer: MAX_OUTPUT_BYTES` (256 MiB). `collectCoverage` in `scripts/upgrade-test-layers.mjs` then calls `JSON.parse(run.stdout)`. A larger report fails with `ENOBUFS`, and raising the cap only moves the failure to Node's maximum string length.
- The v1 format spells out every covered line per test as its own `"path:N"` string, so a whole-suite report grows far past the buffer.
- `writeState` writes each batch's `begin.json`, including every test's coverage, through one `JSON.stringify(value, null, 2)` call. `readState` reads it back with one `JSON.parse`. Both meet the same string-size limit.
- `coverageCheck` in `src/sdlc-verification-runtime.mjs` collects stdout under its own `maxOutputBytes` cap, then calls `JSON.parse` on it.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `src/test-coverage.mjs` | `runCommand`, `validateCoverageReport`, `MAX_OUTPUT_BYTES` | Runs the command and validates v1 from stdout |
| `scripts/upgrade-test-layers.mjs` | `collectCoverage`, `covers`, `unionOf`, `counts`, `computeCandidates`, `gateBatch`, `writeState`/`readState` for `*.begin.json`, `beginTestLayersBatch`, `gateTestLayersBatch` | Consumes the entry-string sets and stores begin state |
| `src/sdlc-verification-runtime.mjs` | `coverageCheck`, `runCoverageCommand` | The gate's coverage check |
| `references/verification-scope.md`, `references/steering-schema.md`, `workflows/upgrade-project/references/test-layer-migration.md` | coverage report contract | Document v1 only |

## Fix Strategy

1. **Output path.** Before each coverage run, create a temporary directory with `fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-coverage-'))` and set `NMG_SDLC_COVERAGE_OUTPUT=<dir>/report.ndjson` in the child environment. `runCommand` gains an optional `env` argument (default `process.env`) that is merged in. `coverageCheck` adds the key to its scrubbed `env`. After exit 0:
   - if the file exists, read it as v2;
   - otherwise validate stdout as v1 exactly as today.

   Remove the directory in a `finally`.
2. **Streaming reader.** `readCoverageReportFile(file)` in `src/test-coverage.mjs` reads with `fs.openSync`/`fs.readSync` in 1 MiB chunks, splits on `\n` and carries partial lines forward. It `JSON.parse`s one line at a time. Line 1 must be the header and empty lines are skipped. A JSON or schema error throws `TestCoverageError` with `source: 'coverage output'`, `reasonCode: 'test_layers_coverage_failed'` and a message beginning `line <N>: `.
3. **Compact form.** One normalized shape for both versions: `{ id, file, lines: { [path]: [[from,to],…] }, branches: { [path]: [[line,fromIndex,toIndex],…] }, outcomes: [...] }`. Paths are sorted and ranges are sorted and merged; adjacent line ranges and adjacent index ranges on the same line are merged. `validateCoverageReport` (v1) converts its entries into this shape, so every consumer handles one form. `src/test-coverage.mjs` exports the range helpers:
   - `rangesContain(big, small)` per kind;
   - `unionRanges(tests)`;
   - `rangeCount` (number of `path:N` / `path:N:K` entries a range set stands for);
   - `hasLine(ranges, path, n)`;
   - `expandEntries(kind, ranges)`, which yields `path:N` / `path:N:K` strings and is used only for bounded outputs.
4. **Upgrade consumers.**
   - `covers`, `unionOf` and `counts` use the range helpers. Baseline and report counts keep the same numeric meaning.
   - `gateBatch` computes missing ranges by range difference and expands only the missing entries into the existing `gap` string arrays. `deleted[].lines` is the expanded `path:N` list of that one removed test, so evidence is unchanged.
   - Begin state is split into two files. `batches/<id>.begin.json` holds `{ version: 2, batch, tree, testsFile: '<id>.begin.tests.ndjson' }`. `batches/<id>.begin.tests.ndjson` holds one compact test per line, written with `fs.openSync` + `fs.writeSync` per test. `gateTestLayersBatch` reads the sidecar with the streaming reader and removes both files. A legacy `version: 1` begin record with inline `tests` is still read (converted through `validateCoverageReport`'s v1 normalization).
5. **Verification gate.** `coverageCheck` builds `reported` from the path keys of every test's `lines` plus `executableLines`, and `testFiles` from `test.file`. `hit` and `executable` membership use `hasLine`, so the `changedLines`, `hitLines`, `uncovered` and `counts` outputs are unchanged. A malformed v2 line yields `coverage_failed: coverage report invalid: line <N>: …`. The stdout overflow cap still applies only to stdout.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `src/test-coverage.mjs` | Output-path env, streaming v2 reader, v1→compact normalization, range helpers, `runCommand` `env` option | FR1–FR4, FR6 |
| `scripts/upgrade-test-layers.mjs` | Compact-form set operations, expanded gap/evidence entries, begin state as header + NDJSON sidecar | FR4, FR5, AC1, AC4, AC5 |
| `src/sdlc-verification-runtime.mjs` | Env key in scrubbed env, file-first read, range lookups | FR1, FR5, AC2, AC3 |
| `references/verification-scope.md`, `references/steering-schema.md`, `workflows/upgrade-project/references/test-layer-migration.md` | Document v2 and `NMG_SDLC_COVERAGE_OUTPUT` | FR7, AC6 |

## Blast Radius

- `scripts/test-coverage.mjs` re-exports `src/test-coverage.mjs`, so new exports reach scripts automatically.
- `scripts/verification-scope.mjs` reads only the config and is unaffected.
- `scripts/jest-per-test-coverage.mjs` keeps printing v1. It ignores the env var, so this repository's `repository.tests` gate takes the stdout path.
- Existing state: `candidates.json`, `baseline.json` and batch records keep their shapes. Only the begin record changes, and a legacy one is still read.
- Existing tests that assert v1 entry arrays on in-memory tests must read them through the expanded outputs (gap, `deleted[].lines`) whose shapes are unchanged.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Raise `maxBuffer` | Rejected | Moves the failure to Node's maximum string length |
| Placeholder token in `coverage.args` or a new config key | Rejected | Env var needs no config schema change and leaves v1 commands untouched (issue decision) |
| Keep v1 entry strings in memory and convert v2 on read | Rejected | In-memory and begin-state size would still grow past string limits |
| Single compact form for both versions | Selected | Parity between v1 and v2 holds by construction |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #615 | 2026-11-23 | Initial defect design |
