# Defect Report: frontmatter-fix flags specs whose prose mentions Issues

**Issue**: #486
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG

## Reproduction

1. Create a spec package `specs/404-restrict-drafted-issues-and-specs/`. Its `requirements.md` has `**Issue**: #404`, `**Status**: Approved`, and the heading `# Requirements: Restrict Drafted Issues and Specs`. Its `feature.gherkin` starts with `# Issue: #404`, `# Date: 2026-09-18`, `# Status: Approved`, and `# Author: NMG`.
2. Run `node scripts/sdlc-upgrade.mjs detect --root .`.
3. Run `apply`, approving the reported `frontmatter-fix:specs/404-…` id.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Detection reports no `frontmatter-fix` item for the package. When a genuine frontmatter fix runs on a gherkin with a comment header, it updates the existing Issue and Status values in place, keeps the `# Field:` comment syntax, and adds no duplicate fields. |
| **Actual** | Detection reports `frontmatter-fix:specs/404-…`. Apply rewrites `# Issue: #404` to `**Issue**: #404` and inserts `**Date**: <today>`, `**Status**: Approved`, and `**Author**: Unknown`, while the original `# Date:`, `# Status:`, and `# Author:` lines remain. |

## Acceptance Criteria

### AC1: Prose "Issues" does not trigger frontmatter-fix

**Given** a `specs/{N}-{slug}/` package whose `requirements.md` has a singular `**Issue**: #N` field and contains the word "Issues" only in headings or prose
**When** upgrade detection runs
**Then** no `frontmatter-fix` item is reported for that package

### AC2: A plural Issues field still triggers frontmatter-fix

**Given** a `specs/{N}-{slug}/` package whose `requirements.md` has `**Issues**: #N, #M`
**When** upgrade detection runs
**Then** a `frontmatter-fix` item is reported for that package with `primaryN` equal to `N`

### AC3: Gherkin comment headers are updated in place without duplicates

**Given** a `feature.gherkin` whose header is `# Issues: #N, #M` / `# Date: D` / `# Status: S` / `# Author: A`
**When** an approved `frontmatter-fix` applies with target `#N` and status `T`
**Then** the header becomes `# Issue: #N` / `# Date: D` / `# Status: T` / `# Author: A`, and the file contains no `**Issue**`, `**Date**`, `**Status**`, or `**Author**` lines that were not present before

### AC4: Bold-form frontmatter behavior is preserved

**Given** spec files using the bold `**Issues**:` / `**Status**:` form
**When** an approved `frontmatter-fix` applies
**Then** the files are rewritten exactly as the current `rewriteFrontmatter` behavior does for bold-form fields

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Plural detection in `detectUpgrade` considers only `**Issues**:` frontmatter field lines, not arbitrary text | Must |
| FR2 | `rewriteFrontmatter` recognizes `# Issue:` / `# Issues:` / `# Date:` / `# Status:` / `# Author:` comment headers as existing fields, updates Issue and Status in place in comment syntax, and inserts no duplicate bold fields | Must |
| FR3 | Existing bold-form frontmatter normalization is unchanged | Must |

## Out of Scope

- Converting existing gherkin comment headers to the bold-line convention
- Changing directory-rename or cumulative-split detection

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #486 | 2026-10-25 | Initial defect report |
