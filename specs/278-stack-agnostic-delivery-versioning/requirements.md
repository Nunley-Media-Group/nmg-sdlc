# Defect Report: Make delivery version synchronization stack-agnostic

**Issue**: #278
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG

---

## Reproduction

1. Use the v3 delivery controller in a Python repository with `VERSION`, `CHANGELOG.md`, `pyproject.toml`, and `src/pennyscan/__init__.py` declared by the manifest-registered technical steering.
2. Do not create a Node `package.json` because the project is not a Node package.
3. Run delivery for an approved issue.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The v3 controller bumps `VERSION`, updates each steering-declared Python version mirror, rolls `CHANGELOG.md`, and continues automated pull-request delivery. |
| **Actual** | The controller unconditionally opens `package.json` and fails with `ENOENT` before publishing the delivery commit. |

## Acceptance Criteria

### AC1: Delivery does not require Node package metadata

**Given** a project has no `package.json`
**And** `VERSION` is its version source
**And** its technical steering declares `pyproject.toml` and `src/pennyscan/__init__.py` as version mirrors
**When** the v3 delivery controller computes a release version
**Then** delivery succeeds without reading or creating `package.json`
**And** it updates both declared Python mirrors from the exact current version to the release version

### AC2: Declared version artifacts fail closed

**Given** technical steering declares a stack-specific version mirror
**When** that file is missing or does not contain the current `VERSION` at its declared field
**Then** delivery fails before committing or opening a pull request
**And** it does not silently omit the declared artifact

### AC3: Resume validation uses the configured artifact set

**Given** a prior delivery commit is considered for resume
**When** delivery validates its release state
**Then** the commit must contain `VERSION`, `CHANGELOG.md`, and every steering-declared version artifact
**And** the current working tree must match that commit for the same configured paths

### AC4: Existing Node repositories remain supported

**Given** technical steering declares `package.json` and its `version` field
**When** delivery computes a release version
**Then** that JSON field is synchronized without introducing a second versioning convention

### AC5: V3 delivery behavior remains intact

**Given** stack-agnostic artifact synchronization
**When** delivery runs
**Then** v3 semver classification, approved-major gate, changelog release entry, delivery commit, push, automated review remediation, exact-head merge, and issue closure behavior remain unchanged
**And** the user-visible correction is documented and verified

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Derive stack-specific version artifacts from the manifest-registered technical steering version table. | Must |
| FR2 | Keep v3 `VERSION` and `CHANGELOG.md` release behavior while removing the unconditional `package.json` dependency. | Must |
| FR3 | Update each declared JSON, TOML, or plain-text mirror at its declared field and reject missing or unsynchronized mirrors. | Must |
| FR4 | Validate prior delivery commits and working-tree synchronization against the configured artifact set. | Must |
| FR5 | Preserve all v3 controller behavior outside version artifact discovery and synchronization. | Must |

## Out of Scope

- Reverting to the interactive v2 delivery workflow.
- Inferring version files from repository language or framework.
- Creating missing version artifacts or compatibility manifests.
- Changing semver bump classification, major approval, changelog structure, or merge policy.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #278 | 2026-08-26 | Initial defect report |
