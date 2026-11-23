# Requirements: Make per-test coverage outcome ids independent of the test file so the test-layer gate can accept cross-file conversions

**Issue**: #590
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/572-add-an-sdlc-upgrade-project-item-that-migrates-non-kept-test-layers-into-bdd-scenarios-under-a-coverage-guarantee/

## User Story

**As a** developer running the `/sdlc-upgrade-project` test-layers migration on this repository
**I want** per-test outcome ids that do not embed the test file path
**So that** a non-kept test whose `it` blocks move into an `@SCN`-tagged BDD test in another file can be deleted through the gated batch

## Background

`scripts/jest-per-test-coverage.mjs` reports each Jest outcome as `<test file>::<full test name>:<status>`, and a suite that fails to run as `<test file>::(suite):failed`. The test-layer gate in `scripts/upgrade-test-layers.mjs` (`gateBatch`) and its candidate labelling (`computeCandidates`) treat a removed test as covered only when kept tests reproduce every one of its outcome strings. Every outcome contains the removed test's own file path, so a test in another file can never reproduce it. As a result, `test-layers-candidates` labels every unpaired non-kept test `unmatched`, and `test-layers-batch gate` refuses any batch that deletes a whole test file with `test_layers_coverage_gap` on `outcomes`.

An outcome is now identified by the Jest `it` title and its status, without the file path or the enclosing describe titles. Lines and branches are still compared as before.

## Acceptance Criteria

### AC1: Outcome ids do not depend on the test file

**Given** Jest results for two test files that each contain an `it` titled the same, nested under different describe blocks
**When** `collect()` in `scripts/jest-per-test-coverage.mjs` derives each file's report entry
**Then** both entries report the identical outcome `<it title>:<status>`
**And** no reported outcome contains a test file path or a describe title
**And** a suite that fails to run reports the outcome `(suite):failed`

### AC2: A cross-file doc→bdd conversion passes the gate

**Given** a `doc` test file whose `it` blocks were moved into an `@SCN`-tagged `bdd` test in another file that covers the same lines and branches
**When** the original file is deleted and `gateBatch` evaluates the batch for that file with `bdd` kept, using outcomes derived by `collect()`
**Then** the batch is `accepted`
**And** its `deleted` evidence lists the removed test with the `bdd` test's id in `coveredBy` and the removed test's lines

### AC3: Dropping an asserted outcome is still refused

**Given** the same conversion, except that one moved `it` block is missing from the `bdd` test
**When** `gateBatch` evaluates the batch
**Then** it is refused with `test_layers_coverage_gap`
**And** `gap.outcomes` lists exactly the missing `<it title>:<status>` outcome

### AC4: Candidates label a cross-file covered test as duplicate

**Given** coverage, derived by `collect()`, for a `doc` test and for a `bdd` test in another file whose lines, branches and outcomes include the `doc` test's
**When** `computeCandidates` runs with `bdd` kept
**Then** the `doc` test is labelled `duplicate` with the `bdd` test's id in `coveredBy`, not `unmatched`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `collect()` reports each Jest assertion's outcome as `<assertion.title>:<assertion.status>`, without the test file path or ancestor describe titles | Must |
| FR2 | `collect()` reports a suite that fails to run as `(suite):failed` and still marks the run failed | Must |
| FR3 | The `jest-per-test-coverage.mjs` header comment documents the new outcome format | Must |
| FR4 | `gateBatch` still refuses a batch whose kept tests do not reproduce every removed outcome, listing the missing outcomes under `gap.outcomes` | Must |
| FR5 | `gateBatch` and `computeCandidates` accept, or label as `duplicate`, a removed test whose outcomes, lines and branches are reproduced by a `bdd` test in another file | Must |

## Out of Scope

- Changing how lines, branches or executable lines are derived or compared
- Changing the coverage report schema validated by `src/test-coverage.mjs`
- Running the doc→bdd migration of this repository's test files

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #590 | 2026-11-23 | Initial feature spec |
