# Tasks: Fix controller path rewriting of project commands

**Issue**: #266
**Date**: 2026-08-25
**Status**: Approved
**Author**: NMG

---

## T001: Preserve project-local script commands

**File(s)**: `scripts/plugin-controller-path.mjs`
**Type**: Modify
**Depends**: none

**Acceptance**:

- Remove unqualified `node scripts/*.mjs` rewriting.
- Continue resolving explicit `<plugin-root>/scripts/*.mjs` shell and quoted-argv forms.
- Preserve explicit missing-controller failure behavior.

**Covers**: AC1, AC2, AC3, AC4

## T002: Add controller materialization regression coverage

**File(s)**: `scripts/__tests__/plugin-controller-path.test.mjs`
**Type**: Modify
**Depends**: T001

**Acceptance**:

- Assert project-local `node scripts/check-gate.mjs` remains unchanged.
- Assert explicit shell and quoted-argv plugin placeholders become JSON-quoted absolute paths.
- Retain missing explicit controller coverage.

**Covers**: AC1, AC2, AC3, AC4

## T003: Avoid same-ref bootstrap reinstall

**File(s)**: `/Volumes/Fast Brick/source/repos/nmg-pi/src/bootstrap-plan.ts`, `/Volumes/Fast Brick/source/repos/nmg-pi/scripts/bootstrap.mjs`
**Type**: Modify in companion repository
**Depends**: none

**Acceptance**:

- Skip nmg-sdlc installation when OMP's configured official Git revision matches remote `HEAD`.
- Use OMP's `--force` replacement path for a changed or unreadable revision.
- Leave local-link and nmg-pi install plans unchanged.

**Covers**: AC5

## T004: Add bootstrap-plan regression coverage

**File(s)**: `/Volumes/Fast Brick/source/repos/nmg-pi/test/bootstrap-plan.test.ts`
**Type**: Modify in companion repository
**Depends**: T003

**Acceptance**:

- Exact configured/remote revisions produce no install command.
- Changed revisions include `--force`, including OMP's canonical GitHub source form.
- Coverage proves unrelated install plans do not gain the option.

**Covers**: AC5

## T005: Record and verify the fixes

**File(s)**: `CHANGELOG.md`, `specs/266-fix-controller-path-rewriting-of-project-commands/verification-report.md`
**Type**: Modify/Create
**Depends**: T001, T002, T003, T004

**Acceptance**:

- `[Unreleased]` records the extension-loading correction.
- Verification records focused tests and installed-topology smoke outcomes.
- Both repository pull requests name exact changed paths and command outcomes.

**Covers**: AC1, AC2, AC3, AC4, AC5
