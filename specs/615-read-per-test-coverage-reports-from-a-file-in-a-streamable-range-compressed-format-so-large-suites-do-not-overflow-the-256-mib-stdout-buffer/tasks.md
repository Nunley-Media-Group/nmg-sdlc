# Tasks: Read per-test coverage reports from a file in a streamable, range-compressed format so large suites do not overflow the 256 MiB stdout buffer

**Issue**: #615
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/572-add-an-sdlc-upgrade-project-item-that-migrates-non-kept-test-layers-into-bdd-scenarios-under-a-coverage-guarantee/

## Implementation Tasks

### T001: Read v2 reports from the output file in compact form

**File(s)**: `src/test-coverage.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1: a helper creates a fresh temporary directory, exposes `NMG_SDLC_COVERAGE_OUTPUT=<dir>/report.ndjson`, and removes the directory after the report is read. `runCommand` accepts an optional `env` merged over `process.env`.
- FR2/FR3: `readCoverageReportFile` reads the file in fixed-size chunks, one line at a time, never holding the whole file as one string. It validates the header and each test line, and throws `TestCoverageError` (`reasonCode: 'test_layers_coverage_failed'`) whose message starts `line <N>: ` for any malformed line.
- FR4/FR6: `validateCoverageReport` still accepts exactly the v1 shapes it accepts today and returns tests in the compact per-file range form. Range helpers (containment, union, entry count, line lookup, entry expansion) are exported.

### T002: Use the compact form in the test-layers upgrade commands

**File(s)**: `scripts/upgrade-test-layers.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR1: `collectCoverage` runs the coverage command with the output path env. It reads the file as v2 when present, otherwise stdout as v1. Any malformed v2 line refuses with `test_layers_coverage_failed` naming the line.
- FR4: `covers`, `unionOf` and `counts` use the range helpers. `batches/<id>.begin.json` holds only `{ version: 2, batch, tree, testsFile }`, and `batches/<id>.begin.tests.ndjson` is written one test per `fs.writeSync` call and read back with the streaming reader. A legacy `version: 1` begin record with inline `tests` is still gated. Gating removes the begin record, its sidecar and the snapshot index.
- FR5: `gap` arrays hold the same `path:N`, `path:N:K` and outcome strings as today. `deleted[].lines` holds the removed test's `path:N` entries. Baseline and report counts equal the counts of the equivalent v1 report.

### T003: Accept v2 in the verification gate's coverage check

**File(s)**: `src/sdlc-verification-runtime.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR1: `coverageCheck` adds `NMG_SDLC_COVERAGE_OUTPUT` to the scrubbed env it passes to `runCoverage`. After a successful run it reads the file as v2 when present, otherwise `response.stdout` as v1, and it removes the temporary directory in all cases.
- FR5: `reported`, `testFiles`, `changedLines`, `hitLines`, `uncovered` and `counts` are computed from the compact form and equal today's results for an equivalent v1 report.
- AC3: a malformed v2 line fails the check with a summary `coverage_failed: coverage report invalid: line <N>: …`.

### T004: Document the v2 contract

**File(s)**: `references/verification-scope.md`, `references/steering-schema.md`, `workflows/upgrade-project/references/test-layer-migration.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR7: each file names `NMG_SDLC_COVERAGE_OUTPUT`, the `{"version":2}` header line with optional `executableLines`, one test object per line, per-file `[from, to]` line ranges, `[line, fromIndex, toIndex]` branch triples, the line-numbered refusal, and that a command which does not write the file is read as v1 from stdout.
- `references/verification-scope.md` states that the 256 MiB cap applies only to a v1 report on stdout.

### T005: Implement the regression scenarios

**File(s)**: `scripts/__tests__/coverage-report-v2.test.mjs`
**Type**: Create
**Depends**: T002, T003, T004
**Acceptance**:
- Each test cites its `@SCN` tag in its describe title. Fixtures are disposable Git projects with `steering/test-layers.json` (`kept: ["bdd"]`) and a `steering/test-coverage.json` whose commands run `process.execPath`.
- `@SCN001` (AC1): the coverage command streams a v2 report to `$NMG_SDLC_COVERAGE_OUTPUT` whose size, checked with `fs.statSync`, is over 256 MiB. Its test lines are padded with JSON whitespace so in-memory data stays small. `testLayersCandidates` returns `ok: true`, writes `baseline.json` and lists the expected batch. The test's timeout is raised to fit the write.
- `@SCN002` (AC2): with a v1 report printed on stdout and no file written, `testLayersCandidates`, `beginTestLayersBatch`, `gateTestLayersBatch`, `testLayersReport` and the verification gate's coverage check (driven through `runSteeringValidations` with an injected `runCoverage`, as in `scripts/__tests__/test-selection-gate.test.mjs`) return the same results as today's v1 expectations.
- `@SCN003` (AC3): Scenario Outline rows (invalid JSON, missing header, a reversed range `[5,2]`, a duplicate id) each refuse: the upgrade path with `test_layers_coverage_failed`, and the gate with `coverage_failed`. The message names the malformed line's number.
- `@SCN004` (AC4): one fixture's coverage is written as v1 and as v2. The `batches`/`unmatched` from `testLayersCandidates` are deep-equal, and the `gateTestLayersBatch` decisions (one accepted, one refused with `test_layers_coverage_gap`) are deep-equal, including `gap` and `deleted`.
- `@SCN005` (AC5): for a v2 suite of at least 2,000 tests, with a begin state over 1 MiB, the begin record holds no `tests` and the sidecar holds one line per test. With `jest.spyOn(JSON, 'stringify')`, no string returned during begin and gate is longer than 64 KiB. The gate accepts one batch and refuses another (restoring its tree), with results equal to the equivalent v1 run.
- `@SCN006` (AC6): each of the three reference files contains `NMG_SDLC_COVERAGE_OUTPUT`, `"version":2` and the branch-triple form.
- `@SCN001`, `@SCN003` and `@SCN005` fail without T001–T003 and pass with them.
- `cd scripts && npm test -- --runInBand __tests__/coverage-report-v2.test.mjs __tests__/upgrade-test-layers.test.mjs __tests__/test-selection-gate.test.mjs __tests__/jest-per-test-coverage.test.mjs` passes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #615 | 2026-11-23 | Initial defect tasks |
