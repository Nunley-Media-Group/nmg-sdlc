# Root Cause Analysis: Type pytest-bdd scenario binding files as bdd in the test-layer classifier

**Issue**: #623
**Date**: 2026-11-25
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/572-add-an-sdlc-upgrade-project-item-that-migrates-non-kept-test-layers-into-bdd-scenarios-under-a-coverage-guarantee/

## Root Cause

`classifyTestFile(rel, text, featureFileRefs)` in `scripts/upgrade-test-layers.mjs` returns `bdd` only when the file is a `.feature` file, sits under a `steps/` or `step_definitions/` directory, contains an `@SCN<n>` tag, or is named by a feature file's `# File:` header. A pytest-bdd binding file (`from pytest_bdd import scenarios` + `scenarios("x.feature")`) meets none of these, so it falls through to the `TYPE_TOKENS` path rules (`contract` → `doc`) or to `unit`. Pytest reports every scenario test under its binding file, so all those scenario tests take the wrong type.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/upgrade-test-layers.mjs` | `classifyTestFile` | Decides each test file's type |
| `scripts/upgrade-test-layers.mjs` | `scan` | Types every inventoried test file (inventory, `featureFileRefs`) |
| `scripts/upgrade-test-layers.mjs` | `typeResolver` / `collectCoverage` | Types each coverage test by its file for candidates, batch begin/gate and report |

## Fix Strategy

Add a pytest-bdd binding predicate to the `bdd` branch of `classifyTestFile`, before the `TYPE_TOKENS` loop. A file is a binding file when its extension is `.py`, its text has an import of `pytest_bdd` (`from pytest_bdd… import …` or `import pytest_bdd…` at line start, allowing leading whitespace), and its text has either a `scenarios(` call (bare or `pytest_bdd.`-qualified) or an `@scenario(` decorator (bare or `pytest_bdd.`-qualified). `scan` and `typeResolver` already pass the file text to `classifyTestFile`, so every consumer gets the corrected type with no further change.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/upgrade-test-layers.mjs` | Add the binding predicate to `classifyTestFile`'s `bdd` condition; update its doc comment | AC1–AC5, FR1–FR4 |
| `CHANGELOG.md` | `[Unreleased]` `### Fixed` bullet ending `(#623)` | Records the fix |

## Blast Radius

Only files that are `.py`, import `pytest_bdd`, and bind scenarios change type, from `unit`/`integration`/`property`/`doc` to `bdd`. Every other file's type is unchanged. Inventories written before the fix keep their old types until the test-layers item is reapplied or the commands rescan.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Content-based pytest-bdd binding predicate in `classifyTestFile` | Selected | One place feeds every consumer; matches the issue's definition |
| Per-file type override in `steering/test-layers.json` | Rejected | Out of scope; requires manual listing of 170 files |
| Path heuristic on `test_*_bdd.py` | Rejected | Project naming convention, not a pytest-bdd property |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #623 | 2026-11-25 | Initial defect design |
