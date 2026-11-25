# Defect Report: Type pytest-bdd scenario binding files as bdd in the test-layer classifier

**Issue**: #623
**Date**: 2026-11-25
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/572-add-an-sdlc-upgrade-project-item-that-migrates-non-kept-test-layers-into-bdd-scenarios-under-a-coverage-guarantee/

## Reproduction

1. Use a Python project with `steering/test-layers.json` `kept: ["bdd"]` and pytest-bdd binding files under `tests/features/test_*_bdd.py`, for example:

       from pytest_bdd import scenarios

       from features.steps.absolute_edge_live_entry_steps import *  # noqa: F403

       scenarios("absolute_edge_live_entry.feature")

2. Produce per-test coverage in which pytest reports every scenario test under its binding file.
3. Run `node scripts/sdlc-upgrade.mjs test-layers-candidates --root .`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | A test source file that binds Gherkin scenarios through pytest-bdd (it imports `pytest_bdd` and calls `scenarios(...)` or uses the `@scenario(...)` decorator) is typed `bdd`, checked before the path-token rules, so a binding file whose path contains `contract`, `docs`, `integration` or similar is still `bdd`. The inventory, `test-layers-candidates`, `test-layers-batch begin\|gate` and `test-layers-report` all use that type. |
| **Actual** | On a Python project with about 7,760 tests and `kept: ["bdd"]`, nmg-sdlc 4.22.4 typed 168 of 170 binding files under `tests/features/test_*_bdd.py` as `unit` and 2 as `doc` (their paths contain `contract`). 2,454 scenario tests were treated as non-BDD: 282 appeared as `duplicate` candidates and 2,172 as `unmatched`. Only 212 tests counted as the kept BDD layer. |

## Acceptance Criteria

### AC1: scenarios() binding file is bdd

**Given** a Python test file that imports `pytest_bdd` and calls `scenarios("x.feature")`
**When** it is classified
**Then** its type is `bdd`

### AC2: @scenario binding file is bdd

**Given** a Python test file that imports `pytest_bdd` and decorates a test with `@scenario("x.feature", "name")`
**When** it is classified
**Then** its type is `bdd`

### AC3: Binding rule precedes path tokens

**Given** a pytest-bdd binding file whose path contains `contract`
**When** it is classified
**Then** its type is `bdd`, not `doc`

### AC4: Non-binding files are unchanged

**Given** a Python test file that never imports `pytest_bdd`, or that imports it without calling `scenarios(...)` or using `@scenario(...)`
**When** it is classified
**Then** it keeps its current type (for example `unit`), and every existing classification rule is unchanged

### AC5: Binding-file tests count as kept BDD in candidates

**Given** per-test coverage where tests are reported under a binding file and `kept` is `["bdd"]`
**When** candidates are computed
**Then** those tests count as kept BDD: they are neither duplicate or convert candidates nor unmatched, and they can serve as `coveredBy` for other tests

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `classifyTestFile` types a `.py` test file that imports `pytest_bdd` and calls `scenarios(...)` or uses `@scenario(...)` as `bdd` | Must |
| FR2 | The pytest-bdd binding rule is checked before the path-token rules | Must |
| FR3 | The inventory, `test-layers-candidates`, `test-layers-batch begin\|gate` and `test-layers-report` use the corrected type | Must |
| FR4 | Classification of files that are not pytest-bdd binding files is unchanged | Must |

## Out of Scope

- A per-file type override in `steering/test-layers.json`
- Binding conventions of other BDD frameworks

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #623 | 2026-11-25 | Initial defect report |
