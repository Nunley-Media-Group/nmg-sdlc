# Requirements: Record bdd as the only kept test layer and convert the doc contract tests into BDD scenarios

**Issue**: #591
**Date**: 2026-11-20
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/571-make-bdd-scenarios-the-single-acceptance-test-layer-with-a-kept-test-types-steering-setting/
**Related Spec**: specs/572-add-an-sdlc-upgrade-project-item-that-migrates-non-kept-test-layers-into-bdd-scenarios-under-a-coverage-guarantee/

## User Story

**As a** maintainer of nmg-sdlc
**I want** this repository to keep only BDD scenarios as its test layer, with its documentation contract tests expressed as scenarios and CI enforcing the kept set
**So that** the repository follows the same single-acceptance-layer rule it ships to managed projects

## Background

`/sdlc-upgrade-project` detected 27 `bdd`, 39 `unit` and 13 `doc` test files and no recorded kept set. The maintainer chose `bdd` only, and asked for the `doc` tests to be removed from the doc layer once BDD covers them.

The gated migration (#572) cannot do that conversion today. `scripts/jest-per-test-coverage.mjs` reports each outcome as `<test file>::<full name>:<status>`, so a test moved to another file can never reproduce the removed test's outcomes, and `test-layers-candidates` returns no batches. That defect is tracked in #590. This issue converts the doc tests in place instead: each doc test file becomes an `@SCN`-tagged BDD test owned by a scenario in this spec, which keeps every assertion and every covered line, branch and outcome.

The doc test files keep their paths because specs and `references/rewrite-contract.{json,md}` cite them as verification evidence.

## Acceptance Criteria

### AC1: The kept set is bdd only

**Given** the approved upgrade plan
**When** `sdlc-upgrade.mjs apply --approve test-layers:<digest> --kept bdd` runs
**Then** `steering/test-layers.json` is `{ "version": 1, "kept": ["bdd"] }`

### AC2: Every doc test becomes a BDD scenario test

**Given** the 13 test files the upgrade inventory classifies as `doc`
**When** the conversion is complete
**Then** each file's top-level `describe` carries an `@SCN` tag of a scenario in this spec's `feature.gherkin`, and the gherkin names the file in a `# File:` header
**And** the upgrade inventory classifies none of them as `doc`

### AC3: Conversion keeps coverage

**Given** per-test coverage of the 13 files before the conversion
**When** the same coverage runs after it
**Then** the covered lines and branches are a superset of the earlier ones
**And** every earlier outcome is present and passing, ignoring only the added `@SCN` tag in the test name, and the test count is unchanged

### AC4: CI rejects a test of a type the project does not keep

**Given** `steering/test-layers.json` keeps `bdd` only
**When** `node scripts/check-test-layers.mjs --root .` runs and a non-`bdd` test file is not listed in `scripts/test-layers-allowlist.json`
**Then** it exits 1 with `test_layers_type_not_kept` naming the file and its type

### AC5: The allowlist only shrinks

**Given** `scripts/test-layers-allowlist.json` lists the existing unit test files still to be converted
**When** a listed file is missing or is now classified `bdd`
**Then** the check exits 1 with `test_layers_allowlist_stale`
**And** an invalid `steering/test-layers.json` exits 1 with `test_layers_invalid`

### AC6: CI runs the check before the tests

**Given** `.github/workflows/nmg-sdlc-verify.yml`
**When** the verify job runs
**Then** it runs `node scripts/check-test-layers.mjs --root .` before the Jest suite

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Record `bdd` as the only kept test type in `steering/test-layers.json` | Must |
| FR2 | Tag each doc test file's top-level `describe` with its scenario id and name the file in `feature.gherkin` | Must |
| FR3 | Add `scripts/check-test-layers.mjs` and the shrink-only `scripts/test-layers-allowlist.json` | Must |
| FR4 | Run the check in `nmg-sdlc-verify.yml` before the tests | Must |
| FR5 | Document the CI check in `README.md` | Should |

## Out of Scope

- Converting the 39 `unit` test files; they stay allowlisted until a later conversion.
- Fixing the gate's outcome identity (#590).
