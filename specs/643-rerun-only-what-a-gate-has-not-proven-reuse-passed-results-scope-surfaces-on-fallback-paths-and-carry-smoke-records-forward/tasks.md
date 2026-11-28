# Tasks: Rerun only what a gate has not proven: reuse passed results, scope surfaces on fallback paths, and carry smoke records forward

**Issue**: #643
**Date**: 2026-11-27
**Status**: Approved
**Author**: Claude Code

## Implementation Tasks

### T001: Reuse passed results on a gate rerun

**File(s)**: `src/sdlc-verification-runtime.mjs`, `scripts/sdlc-verify-steering.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1-FR3: `runSteeringValidations` reuses as design.md describes and records `reused: { generatedAt }`; `--fresh true` passes `reuse: false`, and any other `--fresh` value but `false` is `invalid_arguments`.

### T002: Choose surfaces on a fallback path

**File(s)**: `src/sdlc-test-selection.mjs`, `src/sdlc-verification-runtime.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR4, FR5: `resolveChangeSelection` asks for surfaces on `fallback_path` only when a surface names a validation, and the runtime uses `selection.surfaces` in every mode.

### T003: Carry smoke surface records forward

**File(s)**: `steering/extensions/nmg-sdlc-smoke.mjs`, `steering/manifest.json`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- FR6: `carriesForward` decides as design.md describes; a carried record's evidence names both heads.
- FR7: the manifest sources are as design.md lists.

### T004: Split the controller tests and remove the empty CI job

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-execute-dispatch.test.mjs`, `scripts/__tests__/sdlc-execute-supervision.test.mjs`, `scripts/__tests__/sdlc-execute-queue.test.mjs`, `scripts/__fixtures__/sdlc-execute-fixture.mjs`, `.github/workflows/nmg-sdlc-verify.yml`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR9: the four files hold the 139 tests the one file held, unchanged; the workflow has no `checkpoint-portability` job.

### T005: Update steering, references and public docs

**File(s)**: `steering/snippets/project-tech.md`, `steering/snippets/project-smoke.md`, `references/steering-schema.md`, `workflows/verify-code/WORKFLOW.md`, `README.md`, `CHANGELOG.md`, `VERSION`, `package.json`, `.claude-plugin/plugin.json`, `specs/642-speed-up-the-pre-merge-gate-parallel-contract-suite-and-no-full-run-for-the-version-step/`
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- FR8: each document describes reuse and fallback surfaces; smoke steering gives the carry-forward rule.
- `CHANGELOG.md` lists the changes under 4.26.0, each bullet ending `(#643)`; `VERSION`, `package.json` and `.claude-plugin/plugin.json` read 4.26.0.
- The #642 spec says that a fallback path asks Claude for surfaces when a surface binds a validation.

### T006: Implement the scenarios

**File(s)**: `scripts/__tests__/test-selection-gate.test.mjs`, `scripts/__tests__/nmg-sdlc-smoke.test.mjs`, `scripts/__tests__/repository-surfaces.test.mjs`
**Type**: Modify
**Depends**: T001, T002, T003, T004, T005
**Acceptance**:
- Each `@SCN` tag is cited in a test title.
- `@SCN001`-`@SCN004` drive `runSteeringValidations` on a committed fixture project; `@SCN005` drives the smoke provider against a real git repository; `@SCN006` and `@SCN007` read this repository's files.
- `npm --prefix scripts test` passes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #643 | 2026-11-27 | Initial tasks |
