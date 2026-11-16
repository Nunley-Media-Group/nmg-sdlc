# Tasks: Default the execute implement stage to Opus at medium effort and offer the new defaults on upgrade

**Issue**: #561
**Date**: 2026-11-15
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/535-make-sdlc-execute-stage-models-and-efforts-configurable-per-project-via-steering-sdlc-models-json/

## Implementation Tasks

### T001: Change the implement default and record superseded defaults

**File(s)**: `src/stage-models.mjs`, `src/stage-models.d.mts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1, FR2/AC1: implement is opus/medium, verify opus/high; superseded defaults are exported

### T002: Refresh helper

**File(s)**: `scripts/sdlc-models.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR3/AC3: only entries equal to a superseded default are replaced; other values and key order are kept

### T003: Upgrade offers the refresh

**File(s)**: `scripts/sdlc-upgrade.mjs`, `workflows/upgrade-project/references/`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- FR4/AC2, AC3: create and complete write the new defaults; an approvable `sdlc-models-defaults` item refreshes stale entries

### T004: Docs and repository file

**File(s)**: `README.md`, `workflows/onboard-project/`, `steering/sdlc-models.json`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR5/AC4: docs and the checked-in file state the new defaults

### T005: Regression tests

**File(s)**: `scripts/__tests__/`
**Type**: Modify
**Depends**: T001, T002, T003, T004
**Acceptance**:
- FR6: tests cover AC1 to AC4
- `cd scripts && npm test` exits 0

### T006: Add the CHANGELOG entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T005
**Acceptance**:
- The change has `[Unreleased]` bullets ending `(#561)`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #561 | 2026-11-15 | Initial feature tasks |
