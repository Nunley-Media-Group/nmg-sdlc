# Defect Report: Fix write-spec template path resolution

**Issue**: #276
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG

---

## Reproduction

1. Install nmg-sdlc under the OMP plugin root.
2. Invoke `/sdlc-write-spec #N` for an open issue.
3. Allow the workflow to load the four specification templates.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The workflow reads the four bundled templates from `workflows/write-spec/templates/`. |
| **Actual** | The ambiguous `templates/` instruction resolves against the package root and raises `Path not found: <plugin-root>/templates`. |

## Acceptance Criteria

### AC1: Packaged template paths are explicit

**Given** the write-spec workflow is loaded from an installed plugin
**When** it reads the requirements, design, tasks, and Gherkin templates
**Then** every template path is rooted at `workflows/write-spec/templates/`
**And** no package-root `templates/` lookup is requested

### AC2: Prompt contract prevents regression

**Given** the repository contract suite
**When** the write-spec workflow contract is evaluated
**Then** it requires all four explicit packaged template paths
**And** it rejects the obsolete ambiguous template instruction

### AC3: Changed workflow is verified

**Given** the corrected workflow bundle
**When** focused contract, skill validation, plugin-surface, and contribution checks run
**Then** each applicable gate passes
**And** the correction is recorded in the release changelog

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Replace the ambiguous write-spec template directory with explicit package-root-relative paths. | Must |
| FR2 | Preserve the existing four template artifacts and write-spec lifecycle. | Must |
| FR3 | Add focused regression coverage for the exact paths and obsolete lookup. | Must |
| FR4 | Document and verify the workflow-bundle correction. | Must |

## Out of Scope

- Moving or duplicating the template files.
- Changing spec content, approval behavior, or publication lifecycle.
- Adding runtime path-resolution code for a static workflow contract.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #276 | 2026-08-26 | Initial defect report |
