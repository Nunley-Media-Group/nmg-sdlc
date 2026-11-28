# Requirements: Rerun only what a gate has not proven: reuse passed results, scope surfaces on fallback paths, and carry smoke records forward

**Issue**: #643
**Date**: 2026-11-27
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/642-speed-up-the-pre-merge-gate-parallel-contract-suite-and-no-full-run-for-the-version-step/

## User Story

**As a** maintainer delivering issues with `/sdlc-execute`, in this repository and in projects that use the plugin
**I want** a gate rerun to repeat only what has not already been proven
**So that** a failed or interrupted gate costs minutes instead of a whole cycle, with every check still run for the code it covers

## Background

#642 removed time the gate spent proving nothing on its first run. Reruns still repeat everything. In pennyscan and miledar most sampled gate failures were load-induced or unrelated to the change, and the rerun at the same head ran every validation again, including the ones that had just passed. In this repository a changed `fallbackPaths` file such as `.gitignore` selected every smoke surface (six live interactive sessions and one full delivery) although no surface's sources changed, and a test-only repair moved the head, so every interactive surface was driven live again. `sdlc-execute.test.mjs` ran about 185 s in one Jest worker and set the wall time of the parallel suite, and the "Checkpoint portability" CI job has matched no test since #436.

## Acceptance Criteria

### AC1: A gate rerun at an unchanged tree runs only what did not pass

**Given** a pre-merge gate artifact in which a command or project-provider validation passed
**And** a second run whose request for that validation is identical apart from the run id
**When** the gate runs
**Then** the validation is not run, takes no heavy-job slot, and its passed result is recorded with this run's request and `reused: { generatedAt }`
**And** every validation that did not pass runs

### AC2: Nothing is reused across a change, for selected tests, or on request

**Given** a second run after the head, the working tree, the spec, the steering or the selection changed, or with `--fresh true`
**When** the gate runs
**Then** every applicable validation runs and no result is `reused`
**And** an opted-in validation of a `selected` run always runs its selected tests and coverage check
**And** a result that did not pass, a built-in artifact or external-evidence result, and an unreadable previous artifact are never reused

### AC3: A fallback path runs every test and only the surfaces the change affects

**Given** a manifest whose surfaces bind at least one validation, and a changed path matching `fallbackPaths`
**When** the gate resolves its selection
**Then** the selection is `all` with reason `fallback_path` and no tests, so every test runs
**And** `surfaces` holds every surface whose sources match a changed path outside `docPaths` plus every surface the selection call names
**And** a failed call or an `all` answer selects every declared surface and a failed call is not stored

### AC4: A project with no surface-bound validation is not asked

**Given** a manifest in which no surface names a validation, and a changed path matching `fallbackPaths`
**When** the gate resolves its selection
**Then** Claude is not asked and every declared surface is selected

### AC5: This repository's smoke gate carries a surface record forward

**Given** an interactive surface record made at an earlier head that is an ancestor of the head under verification
**When** every path changed since is a test, a spec, project documentation, `VERSION`, or a version mirror with only its `"version"` line changed
**Then** the record proves the surface and the evidence names both heads
**And** any other changed path, a head that is not an ancestor, or a git failure leaves the record stale

### AC6: This repository's surfaces still cover the hooks module and the smoke provider

**Given** `steering/manifest.json` and `steering/snippets/project-smoke.md`
**When** `hooks/register.ts`, `hooks/hooks.json` or `steering/extensions/**` changes
**Then** every smoke surface the file serves is required
**And** smoke steering tells the verify worker which earlier records still count

### AC7: The controller tests run in parallel and CI runs no empty job

**Given** the contract suite and `.github/workflows/nmg-sdlc-verify.yml`
**When** the suite runs
**Then** the `/sdlc-execute` controller tests are spread over four files sharing one fixture module, with the same tests
**And** CI has no job that selects tests by a name no test has

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | A pre-merge run reads the previous artifact of the issue before overwriting it and reuses a passed `builtin.command` or project-provider result whose recorded request equals the new request apart from the run id | Must |
| FR2 | A reused result carries the new request, the earlier result unchanged, and `reused: { generatedAt }` naming the run that produced it | Must |
| FR3 | Never reused: a non-passing result, an opted-in validation of a `selected` run, `builtin.artifact` and `builtin.external-evidence` results, full-tier runs, and anything when `reuse` is false (`sdlc-verify-steering.mjs --fresh true`) | Must |
| FR4 | On `fallback_path` with a surface-bound validation, the selection call runs and only its surfaces are used; the selection stays `mode: "all"` with no tests | Must |
| FR5 | A `fallback_path` selection is stored and reused like any answered selection; a failed call is not stored | Should |
| FR6 | The smoke provider accepts a surface record of an ancestor head when the changed paths since are inert, as AC5 lists | Must |
| FR7 | `steering/manifest.json` names `hooks/register.ts` and `hooks/hooks.json` as sources of every interactive surface and `execute`, and `steering/extensions/**` as a source of `execute` | Must |
| FR8 | `README.md`, `references/steering-schema.md`, `workflows/verify-code/WORKFLOW.md` and the technical and smoke steering describe the behavior | Must |
| FR9 | `sdlc-execute.test.mjs` is split into four test files and `scripts/__fixtures__/sdlc-execute-fixture.mjs`; the "Checkpoint portability" CI job is removed | Should |

## Out of Scope

- Review severity rules: every finding, including a minor one, still returns to implementation and is re-verified
- Reusing results across heads for validations other than this repository's interactive smoke records
- The gate-failure handoff already names the failing tests (#552)

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #643 | 2026-11-27 | Initial requirements |
