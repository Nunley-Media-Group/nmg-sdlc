# Requirements: Add a technology-agnostic e2e test type that projects identify by declared path globs

**Issue**: #635
**Date**: 2026-11-25
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/571-make-bdd-scenarios-the-single-acceptance-test-layer-with-a-kept-test-types-steering-setting/

## User Story

**As a** developer whose project is delivered through nmg-sdlc and has automated tests that drive the real app or UI (device, emulator, simulator or browser robots)
**I want** to keep those tests as their own `e2e` test type, identified by path globs I declare in `steering/test-layers.json`
**So that** nmg-sdlc never misclassifies them as unit tests, never proposes them for migration or deletion, and counts them as acceptance coverage when they drive a scenario

## Background

End-to-end robot suites live wherever each stack puts them: `integration_test/` (Flutter), `cypress/` and `e2e/` (web), `.maestro/`, `*UITests/` (XCUITest), `androidTest/` (Espresso), and others. The test-layer vocabulary (`bdd`, `unit`, `integration`, `property`, `doc`) has no type for them, and `classifyTestFile` guesses types from path tokens. A Flutter project's `mobile/integration_test/*_test.dart` robots are typed `unit`, because the segment `integration_test` does not equal the `integration` token. Under a `bdd`-only kept set, `/sdlc-upgrade-project` lists them as `convert` candidates, `check-test-layers` reports them as non-kept tests, and the rendered kept-types rule tells workers that every test is a scenario implementation. The project cannot record that it keeps them, because `kept` rejects any type outside the vocabulary.

## Acceptance Criteria

### AC1: e2e is a valid kept type

**Given** `steering/test-layers.json` is `{ "version": 1, "kept": ["bdd", "e2e"] }`
**When** any stage loads it
**Then** it validates, the normalized `kept` is `["bdd", "e2e"]` in the vocabulary order `bdd`, `e2e`, `unit`, `integration`, `property`, `doc`, and the rendered kept-types rule names `e2e` with a description of automated tests that drive the running app or UI through a device, emulator, simulator or browser

### AC2: Declared globs classify files regardless of stack

**Given** `steering/test-layers.json` declares `"paths": { "e2e": ["mobile/integration_test/**"] }`
**When** the test inventory classifies `mobile/integration_test/offline_banner_test.dart` and `mobile/integration_test/robots/home_robot.dart`
**Then** both are in the inventory and typed `e2e`, even when their name, path tokens or content would otherwise leave them out of the inventory or give `unit`, `integration` or `bdd`

### AC3: Declared globs apply to every type, and undeclared files keep today's classification

**Given** a `paths` map that declares globs for `e2e` only
**When** a file matches no declared glob
**Then** it is classified exactly as before this change, except that the `e2e` path token now gives `e2e` instead of `integration`
**And** a file that matches globs of two different types is rejected with a `test_layers_invalid` diagnostic naming `steering/test-layers.json`, the file and both types

### AC4: Kept e2e tests are never migration candidates or check violations

**Given** `kept` includes `e2e`, and e2e files pair with `.feature` files by name
**When** `/sdlc-upgrade-project` detects test layers, `test-layers-candidates` runs, and `check-test-layers` runs
**Then** no e2e file appears as a `duplicate`, `convert` or `unmatched` candidate, the upgrade item's `pairs` and the recorded inventory's `pairs` exclude it, and `check-test-layers` reports no violation for it

### AC5: An e2e test that cites a scenario counts as that scenario's implementation

**Given** a kept e2e test file, matched by a declared `e2e` glob, that cites a scenario's `@SCN<n>` tag
**When** verify builds the Test Coverage section, and the migration gate computes kept-type coverage
**Then** verify lists that e2e test as an implementation of the scenario's AC and flags it neither as a duplicate nor as a non-kept type, and the gate counts its lines, branches and outcomes as kept-type coverage
**And** the file stays typed `e2e` and is not reported as `bdd`

### AC6: Write-spec may task an e2e test, and implement workers may add one

**Given** a project whose kept set includes `e2e`
**When** write-spec generates `tasks.md` for an AC whose behavior is only observable through the running app or UI, or an implement worker adds such a test
**Then** the rendered kept-types rule states that an `e2e` test citing the AC's scenario tag is that scenario's implementation, and lists the declared `paths` globs
**And** the worker-handoff `justifiedTests` validation accepts type `e2e`

### AC7: Invalid paths declarations fail closed

**Given** `paths` that is not an object, or that has an unknown type key, a non-array value, a non-string, empty or absolute glob, a glob with a `..` segment, or a glob declared twice anywhere in the map
**When** any stage loads `steering/test-layers.json`
**Then** loading fails with `test_layers_invalid` and a diagnostic naming `steering/test-layers.json`, the offending field (for example `paths.e2e[1]`) and its value
**And** no stage falls back to the default

### AC8: Upgrade proposes e2e when globs are declared

**Given** a project whose `paths` declares e2e globs that match files
**When** `/sdlc-upgrade-project` detects the test-layers category
**Then** `detectedTypes` reports an `e2e` count, the kept-types question offers `e2e` as the first non-`bdd` option, and `apply --kept bdd,e2e` records `kept` while preserving the existing `paths` map

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Add `e2e` to the kept-type vocabulary, second after `bdd`, with a stack-neutral description of automated tests that drive the running app or UI | Must |
| FR2 | Add an optional `paths` object to `steering/test-layers.json` (version stays 1) that maps vocabulary types to arrays of repository-relative globs, validated fail-closed. A file without `paths` stays valid and normalizes as before | Must |
| FR3 | The shared classifier gives a declared glob match precedence over every built-in rule, including `bdd` detection, and a glob-matched file is part of the test inventory. A file matching two types' globs is a `test_layers_invalid` error | Must |
| FR4 | Files matching no glob are classified as before, except that the `e2e` path token gives `e2e` | Must |
| FR5 | Kept e2e files are excluded from upgrade pairs, migration candidates and `check-test-layers` violations | Must |
| FR6 | An e2e test that cites a scenario's `@SCN` tag counts as that scenario's implementation in verify's per-AC coverage and as kept-type coverage in the migration gate | Must |
| FR7 | The write-spec, implement and verify prompts and the worker-handoff justification accept `e2e` when it is kept, and the rendered rule lists declared globs | Must |
| FR8 | The upgrade test-layers detector counts e2e files and the kept-types question offers `e2e` | Must |
| FR9 | `apply --kept` preserves an existing valid `paths` map, and fails without writing when the existing file is invalid | Must |
| FR10 | README documents `e2e`, the `paths` field, its glob syntax and its precedence, with examples from at least two stacks | Must |

## Out of Scope

- Running e2e suites (devices, emulators, browsers). Projects keep their own registered validation providers
- A built-in list of framework directories or file patterns
- Converting e2e tests into BDD scenarios or deleting them
- Prompting for `paths` during `/sdlc-onboard-project`
- Brace, negation or character-class glob syntax
- Letting an e2e test serve as the `coveredBy` evidence that labels another test `duplicate`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #635 | 2026-11-25 | Initial feature spec |
