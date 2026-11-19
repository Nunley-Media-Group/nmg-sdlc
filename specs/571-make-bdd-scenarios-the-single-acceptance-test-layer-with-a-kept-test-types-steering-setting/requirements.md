# Requirements: Make BDD scenarios the single acceptance test layer with a kept-test-types steering setting

**Issue**: #571
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/535-make-sdlc-execute-stage-models-and-efforts-configurable-per-project-via-steering-sdlc-models-json/

## User Story

**As a** developer whose project is delivered through nmg-sdlc
**I want** specs, implement workers and verify to treat the feature's BDD scenarios as the single acceptance test layer, governed by a kept-test-types setting in my project's steering
**So that** each acceptance criterion is tested once, and the whole-suite gates stop growing with duplicate tests

## Background

Today a spec's `feature.gherkin` has one scenario per AC. Its `tasks.md` also emits generic AC-linked test tasks, which implement workers fill with unit tests for the same ACs. The verify report counts unit and integration tests, and the testability checklist rewards comprehensive unit tests. No steering setting records which test types a project keeps.

A scenario's implementation is either its step definitions or the test that the scenario's `feature.gherkin` `# File:` header names and that cites the scenario's `@SCN` tag. Both count as the `bdd` layer.

## Acceptance Criteria

### AC1: New specs task only scenarios and step definitions under the default

**Given** a project with no `steering/test-layers.json`
**When** `/sdlc-write-spec` generates `tasks.md` for an issue
**Then** every AC-linked test task implements the `feature.gherkin` scenarios (step definitions or the scenario's named test, plus any production seams the steps need)
**And** no task asks for a separate test that restates an AC
**And** variations of one AC are expressed as a Scenario Outline with Examples that carries that AC's single `@SCN` tag

### AC2: Kept-test-types setting is read and validated

**Given** `steering/test-layers.json` lists its kept test types
**When** write-spec, the implement worker, or the verify worker renders its prompt
**Then** the rendered rule names exactly the kept types
**And** a missing file resolves to BDD-only
**And** a file whose version is unsupported, whose types are unknown, or whose kept set lacks `bdd` is rejected with a diagnostic that names the file and the offending field, and the stage does not fall back to the default

### AC3: Implement workers justify any non-scenario test

**Given** an implement worker working an issue
**When** it adds a test that is not a scenario's implementation
**Then** the test is of a kept type and covers a behavior that no scenario covers
**And** the worker's handoff lists each such test with its type and justification
**And** a test that restates a scenario's AC is not added

### AC4: Verify judges scenario coverage and flags duplicates

**Given** an implementation under verify
**When** the verify report is produced
**Then** its Test Coverage section shows, for each AC, the covering scenario and the status of that scenario's implementation
**And** it flags each test added or changed on the branch that duplicates a scenario, and each such test of a type the project does not keep
**And** it has no per-layer test count (such as `Unit tests: [count]`) as a quality signal

### AC5: Testability checklist no longer rewards a second layer

**Given** the verify testability checklist
**When** an implementation is scored
**Then** the injectable-clock and dependency-injection checks apply to step definitions and production seams
**And** no score level requires or rewards comprehensive unit tests or high unit-test counts

### AC6: Setting is documented

**Given** the README
**When** a user reads the steering documentation
**Then** it describes `steering/test-layers.json`, the type vocabulary, the BDD-only default, and how write-spec, implement and verify honor it

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Add a versioned `steering/test-layers.json` format, `{ "version": 1, "kept": [...] }`, with the fixed vocabulary `bdd`, `unit`, `integration`, `property` and `doc`. Add a shared reader that validates it, requires `bdd`, rejects unknown keys and types, and resolves a missing file to `{ "version": 1, "kept": ["bdd"] }` | Must |
| FR2 | Render one kept-types rule into the `sdlc-write-spec`, `worker:implement`, `worker:verify` and `sdlc-verify-code` prompts. An invalid file fails the render, and the user sees the reader's diagnostic | Must |
| FR3 | Rewrite the `tasks.md` feature and defect test tasks so they implement `feature.gherkin` scenarios, and add Scenario Outline + Examples guidance to `feature.gherkin` | Must |
| FR4 | write-code test work is the feature's scenario implementations. Any other test must be of a kept type, cover no scenario's behavior, and appear in the handoff's `justifiedTests` list | Must |
| FR5 | The verify report shows per-AC scenario coverage, flags duplicate and non-kept-type tests on the branch, and drops per-layer test counts | Must |
| FR6 | The testability checklist keeps the injectable-clock and DI checks for step definitions and production seams, and no longer rewards unit-test volume | Must |
| FR7 | The README documents the setting, its vocabulary, its default and how stages honor it | Must |

## Out of Scope

- The `/sdlc-upgrade-project` item that asks which types to keep and migrates an existing project's tests
- Changing nmg-sdlc's own test suite layout
- Prompting for the setting during `/sdlc-onboard-project`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #571 | 2026-11-19 | Initial feature spec |
