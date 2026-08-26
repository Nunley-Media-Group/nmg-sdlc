# Tasks: Fix write-spec template path resolution

**Issue**: #276
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG

---

## T001: Correct packaged template references

**File(s)**: `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/defect-variant.md`
**Type**: Modify
**Depends**: none

**Acceptance**:

- Reference each of the four templates under `workflows/write-spec/templates/`.
- Remove the ambiguous package-root `templates/` instruction.
- Preserve template ownership and the existing write-spec lifecycle.

**Covers**: AC1

## T002: Add prompt-contract regression coverage

**File(s)**: `scripts/__tests__/interactive-plan-contract.test.mjs`
**Type**: Modify
**Depends**: T001

**Acceptance**:

- Assert all four explicit packaged template paths.
- Assert the obsolete ambiguous instruction is absent.
- Keep coverage in the existing write-spec interactive-plan contract.

**Covers**: AC2

## T003: Document and verify the correction

**File(s)**: `CHANGELOG.md`, `VERSION`, `package.json`, `specs/276-fix-write-spec-template-path-resolution/`
**Type**: Modify/Create
**Depends**: T001, T002

**Acceptance**:

- Record the missing-template correction in the release changelog and synchronize the patch version.
- Run the focused contract, bundle validation, and applicable repository gates.
- Preserve exact issue ownership across all four spec artifacts.

**Covers**: AC3
