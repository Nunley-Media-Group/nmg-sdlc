# Requirements: Speed up the pre-merge gate: parallel contract suite and no full run for the version step

**Issue**: #642
**Date**: 2026-11-27
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/584-scope-the-pre-merge-gate-s-tests-and-smoke-to-the-change-with-a-claude-selection-checked-by-coverage-and-a-surface-map/

## User Story

**As a** maintainer delivering issues with `/sdlc-execute`, in this repository and in projects that use the plugin
**I want** the pre-merge gate to stop spending time that proves nothing
**So that** a delivery finishes much sooner with every check still run

## Background

Delivering #638 took about two hours. `repository.tests` took 1092 s locally against 193 s in CI: the gate ran Jest with `--runInBand`, every `git` start went through macOS's `/usr/bin/git` shim (16 ms against 5.5 ms for the binary it selects, 13,164 starts in one suite), and 13 publish tests slept on a real 5 s poll. The implementer ran three narrow checks, so a stale assertion in another suite surfaced only after the 18-minute gate. In consumer projects the gate ran everything because the version commit delivery prepares at the queue head changes a version mirror listed in `selection.fallbackPaths` (miledar #210: a 149-minute gate for a one-line version change).

## Acceptance Criteria

### AC1: A version mirror changed only by the version step forces no full run

**Given** a branch where `VERSION` moved from one semantic version to another since the merge base
**And** a committed `fallbackPaths` file whose every changed line replaces exactly the old version with the new one
**When** the pre-merge gate resolves its selection
**Then** Claude is asked, the selected tests run, and the file needs no test, surface or coverage
**And** the gate artifact lists the file in `selection.versionOnlyPaths` and keeps it in `changedPaths`

### AC2: The version step alone selects nothing

**Given** a branch whose only change is the version step
**When** the gate resolves its selection and Claude selects nothing
**Then** the opted-in validation passes as `selection_empty` and no path is unaccounted

### AC3: Any other change to a fallback path still runs everything

**Given** a `fallbackPaths` file with another changed line, an uncommitted edit, an unchanged `VERSION`, a version pair that is not the project's step, or a version with a prefix or suffix that is not build metadata
**When** the gate resolves its selection
**Then** the selection is `all` with reason `fallback_path`, every test runs, and `versionOnlyPaths` is absent
**And** Claude is asked only for surfaces, and only when a surface binds a validation (#643)

### AC4: This repository's contract suite runs in parallel in a heavy-job slot

**Given** `steering/manifest.json` and `steering/test-coverage.json`
**When** `repository.tests`, `repository.tests.full` or the coverage suite command runs
**Then** Jest runs without `--runInBand`, and both validations are `heavy: true`

### AC5: The publish readiness poll interval is configurable

**Given** `NMG_SDLC_PUBLICATION_POLL_MS` set to a positive whole number of milliseconds
**When** `publish-approved-spec.mjs merge` waits for the spec PR to be ready
**Then** it waits that long between two readiness looks
**And** unset or any other value means 5000

### AC6: Steering requires the whole suite before the implement handoff

**Given** `steering/snippets/project-tech.md`
**When** an implementer reads the checks before a passed implement handoff
**Then** it names the whole contract suite through the heavy-job pool wrapper, the hooks tests, and the plugin-surface and test-layer checks

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | The gate leaves a committed `fallbackPaths` file out of the selection paths when its whole change since the merge base is the project version step | Must |
| FR2 | The exemption needs `VERSION` to change between two semantic versions and every changed line to differ only in one token holding the old version on one side and the new one on the other; build metadata after `+` may differ | Must |
| FR3 | Exempt files stay in `changedPaths` and in `changed_paths` conditions, and are recorded as `selection.versionOnlyPaths` only when there are any | Must |
| FR4 | `repository.tests`, `repository.tests.full` and the coverage suite command drop `--runInBand`; both validations are `heavy: true` | Must |
| FR5 | The contract tests put the git binary macOS's `/usr/bin/git` shim selects first on `PATH`; other platforms and other gits are left alone | Should |
| FR6 | `publish-approved-spec.mjs merge` reads its poll interval from `NMG_SDLC_PUBLICATION_POLL_MS`, default 5000 | Must |
| FR7 | Technical steering lists the checks before a passed implement handoff; smoke steering says how to continue past an auto-mode block of a command the approved plan names | Must |
| FR8 | `README.md` and `references/steering-schema.md` describe the version-step exemption | Must |

## Out of Scope

- Review severity rules and the two-dispatch verify
- Reusing smoke surface records or validation results across heads
- Rerunning only failed validations at the same head
- Splitting `sdlc-execute.test.mjs`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #642 | 2026-11-27 | Initial requirements |
| #643 | 2026-11-27 | AC3: a fallback path asks Claude for surfaces when a surface binds a validation |
