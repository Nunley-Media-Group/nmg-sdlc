# Defect Report: Read per-test coverage reports from a file in a streamable, range-compressed format so large suites do not overflow the 256 MiB stdout buffer

**Issue**: #615
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/572-add-an-sdlc-upgrade-project-item-that-migrates-non-kept-test-layers-into-bdd-scenarios-under-a-coverage-guarantee/

## Reproduction

1. In a project whose v1 per-test coverage report exceeds 256 MiB (about 7,750 pytest tests in the observed project), configure `steering/test-coverage.json` with that coverage command.
2. Run `node scripts/sdlc-upgrade.mjs test-layers-candidates --root .`.
3. The suite passes and the coverage command finishes, but the run refuses with `test_layers_coverage_failed`, message `spawnSync .venv/bin/python ENOBUFS`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The plugin passes the coverage command an output file path in `NMG_SDLC_COVERAGE_OUTPUT`. It streams a v2 newline-delimited, range-compressed report from that file and keeps coverage in compact form in memory and in the test-layers state files. A v1 report on stdout keeps working unchanged. |
| **Actual** | Coverage is read only from a single stdout string capped at 256 MiB (`ENOBUFS`). It is parsed with one `JSON.parse` call, and the batch begin state is written with one `JSON.stringify` call, so the report and the state both hit Node's buffer and string-size limits. The verification gate fails the same report as `coverage_failed: coverage report exceeded … bytes`. |

## Acceptance Criteria

### AC1: A v2 report larger than 256 MiB is read from the provided path

**Given** a coverage command that writes a v2 report larger than 256 MiB to the path in `NMG_SDLC_COVERAGE_OUTPUT`
**When** `test-layers-candidates` runs
**Then** it records the baseline and lists batches

### AC2: v1 on stdout is unchanged

**Given** a coverage command that prints a v1 report on stdout and does not write the provided path
**When** any consumer (`test-layers-candidates`, `test-layers-batch begin`, `test-layers-batch gate`, `test-layers-report`, or the verification gate's coverage check) runs
**Then** its behavior is unchanged

### AC3: A malformed v2 line refuses with its line number

**Given** a v2 report with a malformed line
**When** a consumer reads it
**Then** the run refuses with a coverage reason code (`test_layers_coverage_failed` for the upgrade commands, `coverage_failed` for the verification gate) whose message names the line number

### AC4: v1 and v2 classify identically

**Given** the same coverage written once in v1 form and once in v2 form
**When** candidates and the batch gate run
**Then** the duplicate/convert classification and the gap detection are identical

### AC5: Begin state round-trips without a suite-sized string

**Given** a batch begun against a v2 report
**When** `test-layers-batch gate` refuses or accepts it
**Then** the stored begin state round-trips without building a single string that grows with suite size

### AC6: The references describe the v2 contract

**Given** `references/verification-scope.md`, `references/steering-schema.md` and `workflows/upgrade-project/references/test-layer-migration.md`
**When** they are read
**Then** each names `NMG_SDLC_COVERAGE_OUTPUT`, the v2 header line `{"version":2}`, one test per line, per-file line ranges and `[line, fromIndex, toIndex]` branch triples, and the v1 stdout fallback

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Every coverage-command run sets `NMG_SDLC_COVERAGE_OUTPUT` to a path inside a fresh plugin-created temporary directory, including in the verification gate's scrubbed environment. When the file exists after the command exits 0, it is read as v2. Otherwise stdout is parsed as v1. The temporary directory is removed afterwards. | Must |
| FR2 | A v2 report is read line by line from the file without building one string for the whole report. Line 1 is a header `{"version":2}` with an optional `executableLines`. Each later non-empty line is one test `{ id, file, lines, branches, outcomes }`. | Must |
| FR3 | v2 `lines` and `executableLines` are objects that map a path to `[from, to]` ranges (integers, 1 ≤ from ≤ to). `branches` maps a path to `[line, fromIndex, toIndex]` triples (line ≥ 1, 0 ≤ fromIndex ≤ toIndex). Paths follow the v1 path rule (no `:`, no leading whitespace). `file` is repository-relative, `outcomes` is a string array, and ids are unique. A line that breaks any rule, or is not valid JSON, refuses with the consumer's coverage reason code and a message naming its 1-based line number. | Must |
| FR4 | Coverage from either version is held in one compact per-file range form. Candidates, the batch gate and the report compute containment, union and counts on that form. Each batch's begin state is written and read one test per line, so no single string or state file entry grows with suite size. | Must |
| FR5 | The duplicate/convert classification, gap entries (`path:N`, `path:N:K`, outcome strings), accepted `deleted` evidence, report counts and the verification gate's `coverage` result are identical for equivalent v1 and v2 reports. | Must |
| FR6 | A v1 report on stdout keeps working unchanged for every consumer. `scripts/jest-per-test-coverage.mjs` stays on v1. | Must |
| FR7 | `references/verification-scope.md`, `references/steering-schema.md` and `workflows/upgrade-project/references/test-layer-migration.md` document the v2 contract and `NMG_SDLC_COVERAGE_OUTPUT`. | Must |

## Out of Scope

- Migrating `scripts/jest-per-test-coverage.mjs` to v2.
- Removing v1 support.
- Changing the `steering/test-coverage.json` config schema (it stays `version: 1`).

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #615 | 2026-11-23 | Initial defect report |
