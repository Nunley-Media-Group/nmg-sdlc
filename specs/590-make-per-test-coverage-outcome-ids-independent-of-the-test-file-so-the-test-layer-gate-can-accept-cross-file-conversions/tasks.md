# Tasks: Make per-test coverage outcome ids independent of the test file so the test-layer gate can accept cross-file conversions

**Issue**: #590
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/572-add-an-sdlc-upgrade-project-item-that-migrates-non-kept-test-layers-into-bdd-scenarios-under-a-coverage-guarantee/

## Implementation Tasks

### T001: Report file-independent outcome ids

**File(s)**: `scripts/jest-per-test-coverage.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1: `collect()` adds `${assertion.title}:${assertion.status}` for each assertion.
- FR2: a suite that fails to run adds `(suite):failed` and sets `failed`.
- FR3: the header comment's `outcomes` rule describes `<it title>:<status>` and `(suite):failed`.
- `test.id`, `test.file`, `lines`, `branches` and `executableLines` are unchanged.

### T002: Implement the `feature.gherkin` scenarios

**File(s)**: `scripts/__tests__/jest-per-test-coverage.test.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- The tests feed `collect()` synthesized Jest `--json` results and istanbul-format coverage, with `root` set to a temporary directory holding the covered source file. They pass the resulting entries, typed `doc` or `bdd`, to `gateBatch` and `computeCandidates` from `scripts/upgrade-test-layers.mjs`.
- `@SCN001` (AC1): the same `it` title under different files and describes yields the identical `<title>:<status>` outcome. No outcome contains a file path or describe title. A failed suite yields `(suite):failed`.
- `@SCN002` (AC2): deleting the `doc` file after moving its `it` blocks into the `bdd` test is `accepted`, with `deleted` evidence naming the `bdd` id in `coveredBy` and the removed lines.
- `@SCN003` (AC3): omitting one moved `it` block is refused with `test_layers_coverage_gap`, and `gap.outcomes` equals that one outcome.
- `@SCN004` (AC4): `computeCandidates` with kept `['bdd']` labels the `doc` test `duplicate` with the `bdd` id in `coveredBy`.
- Each test cites its `@SCN` tag in its describe title.
- `cd scripts && npm test -- __tests__/jest-per-test-coverage.test.mjs __tests__/upgrade-test-layers.test.mjs __tests__/repository-surfaces.test.mjs` passes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #590 | 2026-11-23 | Initial feature tasks |
