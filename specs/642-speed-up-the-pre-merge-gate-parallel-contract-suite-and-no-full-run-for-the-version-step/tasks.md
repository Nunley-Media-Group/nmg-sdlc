# Tasks: Speed up the pre-merge gate: parallel contract suite and no full run for the version step

**Issue**: #642
**Date**: 2026-11-27
**Status**: Approved
**Author**: Claude Code

## Implementation Tasks

### T001: Exempt the version step from fallback-path full runs

**File(s)**: `src/sdlc-test-selection.mjs`, `src/sdlc-verification-runtime.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1, FR2: `versionOnlyChanges` and `versionOnlyDiff` are exported from `src/sdlc-test-selection.mjs` and behave as design.md describes.
- FR3: `runSteeringValidations` passes the remaining paths to the selection, the docs-only check and `unaccountedPaths`, keeps every path in `changedPaths`, and records `selection.versionOnlyPaths` only when it is not empty.

### T002: Run this repository's contract suite in parallel

**File(s)**: `steering/manifest.json`, `steering/test-coverage.json`, `scripts/package.json`, `scripts/jest.config.mjs`, `scripts/jest-global-setup.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR4: no `--runInBand` in the two validations or the coverage suite command; both validations are `heavy: true`.
- FR5: `scripts/jest.config.mjs` holds the Jest configuration and names the global setup by absolute path; `scripts/package.json` has no `jest` key.
- `npm --prefix scripts test` passes.

### T003: Make the publish readiness poll interval configurable

**File(s)**: `scripts/publish-approved-spec.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR6: the interval is `NMG_SDLC_PUBLICATION_POLL_MS` when it is a positive whole number, else 5000.

### T004: Update steering, references and public docs

**File(s)**: `steering/snippets/project-tech.md`, `steering/snippets/project-smoke.md`, `references/steering-schema.md`, `README.md`, `CHANGELOG.md`, `VERSION`, `package.json`, `.claude-plugin/plugin.json`
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- FR7: `project-tech.md` has the "Checks Before the Implement Handoff" subsection and documents `NMG_SDLC_PUBLICATION_POLL_MS`; `project-smoke.md` covers the auto-mode block.
- FR8: `references/steering-schema.md` and `README.md` describe the exemption and no longer say that no path is exempt.
- `CHANGELOG.md` lists the changes under 4.25.0, each bullet ending `(#642)`; `VERSION`, `package.json` and `.claude-plugin/plugin.json` read 4.25.0.

### T005: Implement the scenarios

**File(s)**: `scripts/__tests__/test-selection-gate.test.mjs`, `scripts/__tests__/repository-surfaces.test.mjs`, `scripts/__tests__/publish-approved-spec.test.mjs`
**Type**: Modify
**Depends**: T001, T002, T003, T004
**Acceptance**:
- Each `@SCN` tag is cited in a test title.
- `@SCN001`-`@SCN003` drive `runSteeringValidations` on a committed fixture project.
- `@SCN004` and `@SCN006` read this repository's steering files.
- `@SCN005` runs `merge` with `GH_PENDING_CI` and a 1200 ms interval and checks the elapsed time is at least two intervals and under the 10 s the default would take.
- `npm --prefix scripts test` passes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #642 | 2026-11-27 | Initial tasks |
