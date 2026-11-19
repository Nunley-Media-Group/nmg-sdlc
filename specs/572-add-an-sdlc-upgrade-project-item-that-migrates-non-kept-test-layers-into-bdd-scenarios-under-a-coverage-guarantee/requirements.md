# Requirements: Add an /sdlc-upgrade-project item that migrates non-kept test layers into BDD scenarios under a coverage guarantee

**Issue**: #572
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/571-make-bdd-scenarios-the-single-acceptance-test-layer-with-a-kept-test-types-steering-setting/

## User Story

**As a** developer upgrading an existing nmg-sdlc project that tests ACs in both unit tests and BDD scenarios
**I want** `/sdlc-upgrade-project` to record which test types I keep, then migrate or remove only the test types I don't keep, without losing any coverage
**So that** my suite has one acceptance layer, with a smaller collected-test count and a shorter wall time, at equal or better coverage

## Background

Existing managed projects already contain duplicate test layers:
- unit test files paired with BDD features;
- unit tests whose coverage is a subset of a scenario's and that assert the same outcome.

The kept-test-types setting `steering/test-layers.json` (#571) defines which layers a project allows. Its vocabulary is `bdd`, `unit`, `integration`, `property` and `doc`, and the default is BDD-only. This upgrade item records that choice for an existing project and consolidates the project's tests to match, never trading away coverage.

The per-test coverage and full-suite commands come from a new project steering file, `steering/test-coverage.json`. Coverage is compared as sets of covered lines, covered branches and asserted outcomes. An outcome is the string the coverage command reports for an assertion, and two outcomes are equivalent when their strings are equal.

## Acceptance Criteria

### AC1: Operator chooses kept test types

**Given** a project whose test files the detector classifies into one or more of `bdd`, `unit`, `integration`, `property` and `doc`
**When** `/sdlc-upgrade-project` runs interactively
**Then** before any change, one multi-select `AskUserQuestion` lists only the detected types, with `bdd` first and labelled ` (Recommended)`
**And** the approved plan writes the answer, always including `bdd`, to `steering/test-layers.json`

### AC2: Non-interactive run without a recorded choice changes nothing

**Given** no `steering/test-layers.json`
**When** `sdlc-upgrade.mjs detect` runs, or `sdlc-upgrade.mjs apply` runs without `--kept`
**Then** the `test-layers` item is listed as a proposal
**And** no test file and no steering file changes

### AC3: Duplicate layers are detected only for non-kept types

**Given** a recorded kept set and a valid `steering/test-coverage.json`
**When** `detect` and then `test-layers-candidates` run
**Then** they list, for non-kept types only:
- test files that pair with a `.feature` file;
- tests whose covered lines, branches and outcomes are each a subset of one `bdd` test's.
**And** tests of kept types are never candidates

### AC4: Fully duplicated tests are deleted with evidence

**Given** an approved migration batch
**When** a candidate test is fully duplicated by a `bdd` test that asserts the same outcomes, and the batch passes its gate
**Then** the test is deleted
**And** the batch evidence records the test, the covering scenario test, and the covered lines

### AC5: Uncovered behavior is converted before deletion

**Given** a paired non-kept test that covers behavior no scenario covers
**When** its batch runs
**Then** the behavior becomes a scenario or a Scenario Outline Examples row in the paired feature, reusing existing step definitions where they apply
**And** the original test is removed only in the same batch, after that conversion

### AC6: Coverage gap refuses the batch

**Given** a batch whose removed tests cover a line, branch or asserted outcome that no remaining kept-type test covers after the batch
**When** the batch is gated
**Then** nothing in that batch is deleted, and the project is restored to its pre-batch state
**And** the output lists the uncovered lines, branches and outcomes with `reasonCode: test_layers_coverage_gap`

### AC7: Red suite refuses the batch

**Given** a batch after which the declared suite command exits non-zero
**When** the batch is gated
**Then** the project is restored to its pre-batch state
**And** the batch is reported as refused with `reasonCode: test_layers_suite_failed`

### AC8: Missing coverage command refuses deletion

**Given** no valid `steering/test-coverage.json`
**When** the item is applied and `test-layers-candidates` runs
**Then** the kept-types choice and the inventory are still recorded
**And** no batch is offered, every deletion is refused, and the output names `steering/test-coverage.json` as the gap, with `reasonCode: test_coverage_command_missing` (or `test_coverage_config_invalid` and the offending field)

### AC9: Before/after report

**Given** a completed migration
**When** `test-layers-report` runs
**Then** it reports, before and after:
- the collected-test count;
- the full-suite wall time;
- the line, branch and asserted-outcome coverage counts.
**And** it reports every refused batch with its gap
**And** no after-coverage count is lower than its before count

### AC10: Choice can be changed by rerunning

**Given** an existing `steering/test-layers.json`
**When** the item is rerun and the operator selects a different set
**Then** the file is rewritten with the new set
**And** only types outside the new kept set become migration candidates

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | A detector classifies test files into the #571 types, pairs non-kept test files with `.feature` files, and returns a digest-bound `test-layers:<sha256>` upgrade item | Must |
| FR2 | One multi-select interview question over the detected types (`bdd` recommended). `apply --approve test-layers:<digest> --kept <types>` writes `steering/test-layers.json` through #571's validator | Must |
| FR3 | `steering/test-coverage.json` declares the suite and per-test coverage commands as argv arrays. A validator checks it and the coverage command's JSON output | Must |
| FR4 | A reference procedure for approved plan execution: for each batch, begin, convert uncovered behavior into scenarios or Outline rows, delete duplicated tests, then gate | Must |
| FR5 | A deterministic gate in `scripts/sdlc-upgrade.mjs`. Per batch, it runs the suite, compares before/after per-test line, branch and outcome coverage, and refuses and restores the batch on any gap or failure | Must |
| FR6 | The output records per-test deletion evidence, refused batches with their gaps, and before/after counts, wall time and coverage | Must |
| FR7 | Without a recorded or supplied kept set, the item is only proposed and nothing changes | Must |
| FR8 | The README and the upgrade workflow document the item and `steering/test-coverage.json` | Must |

## Out of Scope

- The `steering/test-layers.json` format and its reader, and the write-spec, implement and verify behavior that honors it (#571)
- Built-in detection of language-specific coverage runners
- Migrating tests of kept types
- Converting non-kept tests that pair with no feature and are not a coverage subset (reported as `unmatched`)
- Production-code changes beyond the seams that a converted scenario's steps need

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #572 | 2026-11-19 | Initial feature spec |
