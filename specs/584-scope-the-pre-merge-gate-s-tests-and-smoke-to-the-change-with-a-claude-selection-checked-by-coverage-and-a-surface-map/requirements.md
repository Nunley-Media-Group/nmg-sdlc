# Requirements: Scope the pre-merge gate's tests and smoke to the change with a Claude selection checked by coverage and a surface map

**Issue**: #584
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/551-add-parallel-delivery-with-worktree-isolation-a-merge-queue-change-scoped-validation-tiers-and-one-pass-verification/

## User Story

**As a** developer delivering changes with `/sdlc-execute` in any project that uses nmg-sdlc, whatever its stack and whether or not it is a Claude Code plugin
**I want** the pre-merge gate to run only the tests and smoke surfaces that Claude selects for the change, with deterministic checks that the selection reaches every changed line and every changed surface
**So that** each change is gated by what it touches, instead of the whole suite and a full smoke delivery every time

## Background

Today, `src/sdlc-steering-runtime.mjs` `validateSelection` accepts `selection` only as a project command `{ program, args, cwd?, env? }` on a `change`-tier `builtin.command` validation, with optional `fallbackPaths`.

`src/sdlc-verification-runtime.mjs` `resolveSelection` behaves as follows:
- It runs that command once per validation on the changed paths and appends the selected tests to `args`.
- It runs the full command on `all` or on any failure.
- An empty selection passes as `selection_empty`.

`providerRequest` gives project providers no changed paths and no selection, so this repository's `repository.nmg-sdlc-smoke` always delivers one whole issue. `steering/manifest.json` declares no tier, selection or fallback, so `repository.tests` always runs in full.

`steering/sdlc-models.json` (`src/stage-models.mjs`) configures model and effort per execute stage only.

The prompt registry (`src/sdlc-prompt-snippets.mjs`) already renders plugin fragments plus project `snippets[]` for a consumer.

#572 adds `steering/test-coverage.json` (`{ version: 1, suite, coverage }`) and its per-test report, `{ version: 1, tests: [{ id, file, lines, branches, outcomes }] }`. Both are validated by `scripts/test-coverage.mjs`.

## Acceptance Criteria

### AC1: Claude selects tests and surfaces for a change

**Given** a manifest declaring the top-level `selection` key, so the bundled `gate:selection` prompt plus any project snippets routed to `gate:selection` form the selection prompt
**When** the pre-merge gate runs for a change
**Then** headless Claude receives the rendered prompt, the base ref, the changed paths, the diff and the declared surface ids
**And** its answer is read as `{ mode: "selected" | "all", tests: [...], surfaces: [...] }`
**And** each `change`-tier `builtin.command` validation that opts in with `selection: true` runs only the selected tests
**And** each project provider receives the changed paths and the selected surfaces in its request
**And** the gate artifact records the selection:
- the prompt provenance (fragment ids and hash)
- the model and effort
- the reason
- the selected tests and surfaces

### AC2: Selection model and effort are configurable

**Given** `steering/sdlc-models.json` declares `selection: { model, effort }`
**When** the gate asks Claude for a selection
**Then** that model and effort are used
**And** without the entry, `haiku` at `xhigh` is used
**And** an invalid value fails with the existing `steering/sdlc-models.json` diagnostic naming the key and value

### AC3: The command form of `selection` is rejected

**Given** a manifest whose `selection` (on a validation or at the top level) is a command `{ program, args }`
**When** the steering runtime loads it
**Then** loading fails with `steering_validation_invalid` naming `selection`
**And** the message states that selection takes a prompt

### AC4: Changed code lines must be covered by the selected tests

**Given** a project with a valid `steering/test-coverage.json`
**And** the selected tests pass
**When** the gate runs the coverage command with the selected tests appended to its arguments
**Then** every changed line of a changed path that appears in the coverage report must be covered by a selected test
- When the report declares `executableLines`, the changed lines are those that are executable.
- Otherwise, the changed lines are the non-blank ones.
**And** each opted-in result records `coverage: { changedLines, hitLines, uncovered }`
**And** a changed line left uncovered is a rejection with reason `selection_uncovered`, naming the uncovered lines

### AC5: Changed surfaces must be selected

**Given** a manifest declaring `surfaces: [{ id, sources: [globs], validations?: [validation ids] }]`
**When** a changed path matches a surface's `sources`
**Then** that surface must appear in Claude's selected surfaces
**And** Claude may select additional surfaces, but omitting a matched one is a rejection with reason `selection_surface_missing`

### AC5a: Surface-bound validations run only for selected surfaces

**Given** a validation, of any provider kind, that is named in one or more surfaces' `validations`
**When** the gate runs and none of those surfaces is selected
**Then** the validation passes as `surface_not_selected` without running, with evidence that no bound surface was selected
**And** when at least one is selected, the validation runs and its request carries the selected surfaces
**And** a validation bound to no surface runs as it does today

### AC6: Every changed path must be accounted for

**Given** a change in selected mode
**When** the gate checks the selection
**Then** each changed path must be covered by at least one of:
- the coverage report (a line record for the path, or the path is the `file` of a selected test)
- a selected surface
- `docPaths`
- `fallbackPaths`
**And** a path covered by none is a rejection with reason `selection_unaccounted`, naming the path

### AC7: A rejected selection escalates to the orchestrator

**Given** a selection rejected as `selection_uncovered` (AC4), `selection_surface_missing` (AC5), `selection_unaccounted` (AC6) or `selection_empty_code_change` (AC8)
**When** the gate completes
**Then** the affected validations are non-passing, naming the uncovered lines, the missing surfaces or the unaccounted paths
**And** the verify handoff reports a selection escalation, which `/sdlc-execute` presents to its supervising session as a stage report instead of routing the branch to implement
**And** when the session answers `redispatch --text "<guidance>"`, the rerun gate appends that guidance to the selection prompt and records that guidance was supplied

### AC8: Only a docs-only change may select nothing

**Given** `docPaths` globs
**When** every changed path matches one and Claude selects no tests and no surfaces
**Then** the opted-in test validations pass with reason `selection_empty` without running
**And** project providers receive an empty surface selection
**And** a change with any path outside `docPaths` and an empty selection is rejected as `selection_empty_code_change`
**And** without `docPaths` declared, no change is docs-only

### AC9: Full-run fallbacks are kept

**Given** a manifest that declares `selection`
**When** a changed path matches `fallbackPaths`, or Claude exits non-zero, times out, prints malformed output or answers `mode: "all"`
**Then** the opted-in test validations run their full commands and record `fallback_path`, `selection_failed` or `selection_all`
**And** project providers receive every declared surface
**And** when a fallback path matches, Claude is not asked for tests; since #643 it is asked for surfaces when a surface binds a validation, and providers then receive the surfaces the change requires plus those it names

### AC10: This repository's smoke runs only the selected surfaces

**Given** this repository's smoke validation, bound to the `draft-issue`, `write-spec`, `onboard-project`, `upgrade-project`, `steering`, `run-retro` and `execute` surfaces
**And** a selection whose surfaces include some interactive commands, the execute pipeline, or neither
**When** the gate runs `repository.nmg-sdlc-smoke`
**Then** each selected interactive command surface passes only with a head-bound evidence record showing it was exercised live through its real command against a clone of `Nunley-Media-Group/nmg-sdlc-smoke`
**And** a selected `execute` surface, which covers the execute workflow, its stage agents and the controller scripts, runs one full provisioned smoke delivery with the existing exact-head merge and closure evidence
**And** with no selected surface, smoke passes as `surface_not_selected` with evidence that no surface was selected
**And** the result lists each exercised surface and its evidence

### AC11: Onboard and upgrade enforce the configuration

**Given** the steering of any project that uses nmg-sdlc
**When** `/sdlc-onboard-project` or `/sdlc-upgrade-project` inspects it
**Then** it reports each of these that applies:
- a missing `selection` or `docPaths`
- a legacy command `selection`
- a missing or invalid `steering/test-coverage.json` in a project with a `builtin.command` validation
- a missing `surfaces` map
- tracked non-doc files that no `selection.coveragePaths`, surface, `docPaths` or `fallbackPaths` glob accounts for
**And** it proposes one digest-bound change, applied only after plan approval
**And** that change carries a stack-appropriate per-test coverage command and a surface map derived from the project's structure:
- for a Claude Code plugin (a project with `.claude-plugin/plugin.json`): its commands, agents and hooks
- otherwise: its features, entry points and non-code assets
**And** a repeat run after applying proposes nothing

### AC12: This repository adopts scoped verification

**Given** this repository's steering
**When** the change is delivered
**Then** `steering/manifest.json` declares `selection` with `docPaths`, `fallbackPaths` and `coveragePaths`, plus a `surfaces` map, and `repository.tests` is `change`-tier with `selection: true`
**And** `steering/test-coverage.json` declares the Jest per-test coverage command
**And** a test asserts that every tracked file under `workflows/`, `agents/`, `references/`, `commands/`, `hooks/` and `.claude-plugin/` matches at least one surface
**And** `references/steering-schema.md`, `README.md` and the smoke and verification rules in `steering/snippets/` describe scoped selection, the checks, escalation and surface-scoped smoke

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | A top-level manifest `selection` object, `{ docPaths?, fallbackPaths?, coveragePaths? }`, enables prompt-driven selection. Validations opt in with `selection: true`, and the command form fails with `steering_validation_invalid` | Must |
| FR2 | The selection prompt is the bundled `gate:selection` fragment plus any project snippets routed to `gate:selection`. One headless Claude call per gate run answers `{ mode, tests, surfaces }`, validated against bounded limits | Must |
| FR3 | `steering/sdlc-models.json` accepts an optional `selection: { model, effort }`, defaulting to `haiku` / `xhigh` | Must |
| FR4 | The `steering/test-coverage.json` coverage command runs for the selected tests. Changed executable (or non-blank) lines of reported paths must be hit, and the report may declare `executableLines` | Must |
| FR5 | A top-level `surfaces` map, `[{ id, sources, validations? }]`, requires every matched surface to be selected | Must |
| FR6 | Every changed path is accounted for by coverage, a selected surface, `docPaths` or `fallbackPaths` | Must |
| FR7 | Rejections are non-passing selection escalations that the verify handoff reports and `/sdlc-execute` presents to its supervising session. Redispatch guidance is appended to the rerun's selection prompt and recorded | Must |
| FR8 | Only a docs-only change (`docPaths`) may select nothing | Must |
| FR9 | `fallbackPaths` and any Claude failure, malformed answer or `all` answer run everything | Must |
| FR10 | Project-provider requests carry the changed paths and the selected surfaces. A surface-bound validation runs only when one of its surfaces is selected, and otherwise records `surface_not_selected` | Must |
| FR11 | This repository's smoke checks head-bound live evidence for each selected interactive command surface, and runs the execute surface as one full delivery | Must |
| FR12 | Onboard and upgrade detect missing, legacy or incomplete configuration and propose an idempotent, digest-bound fix with a stack-appropriate coverage command and a structure-derived surface map | Must |
| FR13 | This repository adopts the configuration, with a test that its surface map covers every tracked plugin file | Must |
| FR14 | The schema reference, README, verify/execute/upgrade/onboard workflows and the steering snippets document the behavior | Must |

## Out of Scope

- Scoping within the execute pipeline, for example starting smoke at verify from a prepared branch. Execute is one smoke unit.
- Changing `--runInBand` on `repository.tests`.
- Selection or checks in full-tier runs (`/sdlc-verify-full`). Full tier runs every validation in full.
- Whole-file or project coverage thresholds.
- Coverage report formats other than #572's per-test report with the optional `executableLines`.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #584 | 2026-11-19 | Initial feature spec |
