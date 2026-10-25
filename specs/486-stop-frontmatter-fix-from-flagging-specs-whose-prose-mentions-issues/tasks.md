# Tasks: frontmatter-fix flags specs whose prose mentions Issues

**Issue**: #486
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG

## Implementation Tasks

### T001: Detect plural Issues only from the field line

**File(s)**: `scripts/sdlc-upgrade.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC1/FR1: a package with singular `**Issue**: #N` whose headings or prose contain "Issues" gets no `frontmatter-fix` item
- AC2: a package with `**Issues**: #N, #M` gets a `frontmatter-fix` item with `primaryN` equal to `N`

### T002: Normalize gherkin comment headers in place

**File(s)**: `scripts/sdlc-upgrade.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC3/FR2: a `# Issues: #N, #M` / `# Date: D` / `# Status: S` / `# Author: A` header becomes `# Issue: #N` / `# Date: D` / `# Status: T` / `# Author: A`, with no new bold `**Issue**`, `**Date**`, `**Status**`, or `**Author**` lines
- AC4/FR3: bold-only files produce byte-identical output to the previous `rewriteFrontmatter`

### T003: Document frontmatter normalization

**File(s)**: `workflows/upgrade-project/references/v3-detectors.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- Frontmatter normalization text says that plural detection uses only the `**Issues**:` field line and that gherkin comment headers are normalized in place without bold duplicates
- The edit is made after invoking the `skill-creator` skill
- `CHANGELOG.md` `[Unreleased]` has a `### Fixed` entry for #486

### T004: Regression coverage

**File(s)**: `scripts/__tests__/sdlc-upgrade.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- AC1: detect on a package whose `requirements.md` title says "Restrict Drafted Issues and Specs" with singular `**Issue**: #404` reports no `frontmatter-fix:` item
- AC2: detect on a package with `**Issues**: #7, #9` in `specs/7-x/` reports `frontmatter-fix:specs/7-x` with `primaryN: 7`
- AC3: applying that item to a gherkin with a `# Issues: #7, #9` / `# Date:` / `# Status: Planning` / `# Author:` header yields the exact comment header with `# Issue: #7` and the computed status, and no bold field lines
- AC4: a bold-form `**Issues**: #7, #9` / `**Status**: Planning` package is rewritten to `**Issue**: #7` / `**Status**: Draft`, with the other lines unchanged
- `cd scripts && npm test` exits 0

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #486 | 2026-10-25 | Initial defect report |
