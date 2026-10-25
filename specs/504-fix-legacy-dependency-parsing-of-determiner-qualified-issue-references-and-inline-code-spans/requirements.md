# Defect Report: Legacy dependency parsing drops determiner-qualified local references and parses inline code

**Issue**: #504
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/485-reject-non-issue-legacy-dependency-references-instead-of-aborting-upgrade-detection/

## Reproduction

1. Call `parseLegacyDependencyEvidence` from `scripts/issue-dependencies.mjs` with the body `After the API issue #5 lands`.
2. Call it with the body `Depends on our Auth issue #7`.
3. Call it with the body `` `Requires #9` ``.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Steps 1 and 2 each return one `blockedBy` edge (to #5 and to #7) and no findings. Step 3 returns no edges and no findings. |
| **Actual** | Steps 1 and 2 return no edges and no findings, because the descriptor is treated as a foreign project name. Step 3 returns a `blockedBy` edge to #9. |

## Acceptance Criteria

### AC1: Determiner before a capitalized descriptor keeps a local edge

**Given** a legacy body line `After the API issue #5 lands`
**When** `parseLegacyDependencyEvidence` parses it
**Then** it returns one `blockedBy` edge to issue 5 and no findings

### AC2: Determiner before a run of capitalized words keeps a local edge

**Given** the legacy body lines `Depends on our Auth issue #7` and `Depends on the Auth API issue #8`
**When** `parseLegacyDependencyEvidence` parses them
**Then** it returns `blockedBy` edges to issues 7 and 8 and no findings

### AC3: Undetermined and punctuated project names stay foreign

**Given** the legacy body lines `PennyScan issue #102 therefore fails`, `Depends on nmg-pi issue #4` and `After the nmg-pi issue #4 lands`
**When** `parseLegacyDependencyEvidence` parses them
**Then** it returns no edges and no findings

### AC4: Inline code spans are ignored

**Given** the legacy body lines `` `Requires #9` `` and ``Requires `#9` and #10``
**When** `parseLegacyDependencyEvidence` parses each body separately
**Then** the first body returns no edges and no findings
**And** the second body returns exactly one `blockedBy` edge, to issue 10, and no findings

### AC5: Existing classification behavior is preserved

**Given** the existing parser cases:
- table rows
- `PR #N` and `pull request #N` references
- `owner/repo#N` references
- `Depends on:`, `Blocked by:`, `Requires:`, `After:`, `Precursor:` and `Blocks:` field lines
- fenced and quoted prose
- multi-reference ambiguous clauses

**When** `parseLegacyDependencyEvidence` parses them
**Then** it returns the same edges and findings as before this fix

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Treat as a local descriptor a run of one or more capitalized words (first letter `A`–`Z`, no `-`, `.` or `_`) that ends directly before `issue #N`, when the word directly before the run is a determiner. The determiners are the, a, an, this, that, our, its, each, every, same, matched case-insensitively. Such a reference yields a local edge. | Must |
| FR2 | Keep treating these words directly before `issue #N` as foreign-project qualifiers, which yield neither an edge nor a finding: a capitalized word whose capitalized run has no determiner before it, and a word containing `-`, `.` or `_`, whether or not a determiner comes before it. | Must |
| FR3 | Remove inline code spans before dependency parsing. A span is a run of backticks matched by an equal run on the same line, after fenced code is removed. A `#N` inside a span yields neither an edge nor an `ambiguous_dependency_evidence` finding. | Must |
| FR4 | Add regression tests for AC1–AC4 and keep the existing AC5 tests passing unchanged. | Must |

## Out of Scope

- Changing which clause keywords or field-line labels count as dependency evidence
- Changing how `/sdlc-upgrade-project` uses parsed legacy evidence, or how the official blocked-by graph is validated or applied

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #504 | 2026-10-25 | Initial defect report |
