# Tasks: Type pytest-bdd scenario binding files as bdd in the test-layer classifier

**Issue**: #623
**Date**: 2026-11-25
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/572-add-an-sdlc-upgrade-project-item-that-migrates-non-kept-test-layers-into-bdd-scenarios-under-a-coverage-guarantee/

## Implementation Tasks

### T001: Correct the Root Cause

**File(s)**: `scripts/upgrade-test-layers.mjs`, `CHANGELOG.md`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1/FR2: `classifyTestFile` returns `bdd` for a `.py` file whose text imports `pytest_bdd` and calls `scenarios(` or uses `@scenario(` (bare or `pytest_bdd.`-qualified), checked before the `TYPE_TOKENS` loop.
- FR4: every other input returns the same type as before the change.
- FR3: `scan` and `typeResolver` continue to call `classifyTestFile` with the file text, so inventory, candidates, batch begin/gate and report use the corrected type.
- `CHANGELOG.md` `[Unreleased]` gains a `### Fixed` bullet describing the fix that ends with `(#623)`.

### T002: Implement the Regression Scenarios

**File(s)**: `scripts/__tests__/pytest-bdd-binding.test.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- Each `describe` cites its scenario tag.
- `@SCN001` (AC1): a `.py` file importing `pytest_bdd` and calling `scenarios("x.feature")` classifies as `bdd`.
- `@SCN002` (AC2): a `.py` file importing `pytest_bdd` with an `@scenario("x.feature", "name")` test classifies as `bdd`.
- `@SCN003` (AC3): a binding file at a path containing `contract` classifies as `bdd`, not `doc`.
- `@SCN004` (AC4): each Examples row (no `pytest_bdd` import; import without binding; existing `.feature`, `steps/`, `@SCN`, `# File:` and path-token cases) keeps its pre-fix type.
- `@SCN005` (AC5): in a disposable git project with `kept: ["bdd"]` and a coverage command reporting tests under a binding file, `test-layers-candidates` lists none of the binding file's tests in `batches` or `unmatched`, and a unit test whose coverage is a subset of a binding test is a `duplicate` with that binding test id in `coveredBy`.
- SCN001–SCN004 fail without T001; `cd scripts && npx jest --runInBand __tests__/pytest-bdd-binding.test.mjs` passes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #623 | 2026-11-25 | Initial defect tasks |
