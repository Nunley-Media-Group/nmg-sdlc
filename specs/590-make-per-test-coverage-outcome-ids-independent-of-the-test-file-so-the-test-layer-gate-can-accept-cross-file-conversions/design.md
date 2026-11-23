# Design: Make per-test coverage outcome ids independent of the test file so the test-layer gate can accept cross-file conversions

**Issue**: #590
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/572-add-an-sdlc-upgrade-project-item-that-migrates-non-kept-test-layers-into-bdd-scenarios-under-a-coverage-guarantee/

## Overview

The fix changes only how `collect()` in `scripts/jest-per-test-coverage.mjs` names outcomes. `gateBatch` and `computeCandidates` in `scripts/upgrade-test-layers.mjs` already compare outcomes as opaque strings across all tests (`covers`, `unionOf`), so once outcomes no longer embed the file they match across files with no change to the gate.

## Architecture

`collect(file, results, coverage, executable, root)` builds `outcomes` from Jest `--json` results:

- per assertion: `${assertion.title}:${assertion.status}`. Jest's `assertionResults[].title` is the `it` title alone, while `fullName` also joins the enclosing describe titles;
- per suite that failed to run (`testExecError`, or `status: 'failed'` with no assertions): `(suite):failed`, and `failed` is still set to true.

Outcomes stay a sorted, de-duplicated array. The report shape `{ id, file, lines, branches, outcomes }` is unchanged, so `validateCoverageReport` in `src/test-coverage.mjs` still accepts it. `test.id` and `test.file` remain the file path: they identify the test and the batch, not the outcome.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `collect()` in `scripts/jest-per-test-coverage.mjs` | Jest `--json` results and istanbul coverage | `test.outcomes` entries `<it title>:<status>` and `(suite):failed` | Outcome strings no longer contain the file path or describe titles |
| `node scripts/jest-per-test-coverage.mjs <tests>` | test paths | same JSON report with the new outcome strings | Exit codes unchanged |

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `it` title + status | Selected | A moved `it` block keeps its identity under any new describe and file. Lines and branches still guard against lost code coverage. |
| Full name (describe path + title) + status | Rejected | A conversion into an `@SCN`-tagged describe changes the describe prefix, so the gate would still refuse it |
| Map outcomes in the gate instead of in the coverage command | Rejected | The gate is stack-agnostic and takes outcomes as opaque strings from the configured coverage command |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #590 | 2026-11-23 | Initial feature design |
