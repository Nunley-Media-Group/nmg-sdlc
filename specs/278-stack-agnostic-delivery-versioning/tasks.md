# Tasks: Make delivery version synchronization stack-agnostic

**Issue**: #278
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG

---

## T001: Replace hard-coded Node artifact handling

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: none

**Acceptance**:

- Parse version artifact paths and field locators from manifest-registered technical steering.
- Keep `VERSION` and `CHANGELOG.md` under the v3 controller while removing unconditional `package.json` access.
- Update declared JSON, TOML, and text mirrors at their configured fields.
- Fail closed before commit or PR creation for unsafe, missing, ambiguous, or unsynchronized declarations.
- Validate resume commits and working-tree state against the configured artifact set.

**Covers**: AC1, AC2, AC3, AC4, AC5

## T002: Add multi-stack regression coverage

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Modify
**Depends**: T001

**Acceptance**:

- Exercise a Python layout with no `package.json`, including `pyproject.toml` and a runtime `__version__` mirror.
- Preserve the existing Node `package.json` behavior.
- Cover missing and mismatched declared mirrors.
- Cover configured-path resume validation.

**Covers**: AC1, AC2, AC3, AC4

## T003: Align versioning guidance

**File(s)**: `workflows/open-pr/references/version-bump.md`, `references/versioning.md`, `steering/snippets/project-tech.md`, `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T001

**Acceptance**:

- Describe steering-declared stack-specific version mirrors without making Node metadata universal.
- Preserve the v3 automated delivery, major approval, changelog, and merge contracts.
- Record the user-visible correction under `[Unreleased]`.

**Covers**: AC5

## T004: Verify and deliver the correction

**File(s)**: `specs/278-stack-agnostic-delivery-versioning/`, repository verification surfaces
**Type**: Create/Verify
**Depends**: T001, T002, T003

**Acceptance**:

- Run focused and full changed-contract verification.
- Validate the changed workflow bundle through `skill-creator`.
- Open a contribution-compliant PR that closes #278.
- Pass hosted checks, merge exact head to `main`, and confirm issue closure.

**Covers**: AC5
