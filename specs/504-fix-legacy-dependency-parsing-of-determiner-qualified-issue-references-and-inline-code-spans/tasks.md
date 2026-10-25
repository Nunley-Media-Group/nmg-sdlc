# Tasks: Legacy dependency parsing drops determiner-qualified local references and parses inline code

**Issue**: #504
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/485-reject-non-issue-legacy-dependency-references-instead-of-aborting-upgrade-detection/

## Implementation Tasks

### T001: Correct qualifier classification and strip inline code

**File(s)**: `scripts/issue-dependencies.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC1/FR1: `After the API issue #5 lands` yields `blockedBy` 5 and no findings
- AC2/FR1: `Depends on our Auth issue #7` and `Depends on the Auth API issue #8` yield `blockedBy` 7 and 8 and no findings
- AC3/FR2: `PennyScan issue #102 therefore fails`, `Depends on nmg-pi issue #4` and `After the nmg-pi issue #4 lands` yield no edges and no findings
- AC4/FR3: `` `Requires #9` `` yields no edges and no findings, and ``Requires `#9` and #10`` yields only `blockedBy` 10
- AC5: PR, `owner/repo#N`, table-row, field-line, fenced, quoted and ambiguous-clause behavior is unchanged

### T002: Add behavioral regression coverage

**File(s)**: `scripts/__tests__/issue-dependencies.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- New `parseLegacyDependencyEvidence` cases cover AC1, AC2, AC3 and AC4 with the exact lines above, using `toEqual` on the full `{ edges, findings }` result
- The existing tests `keeps legacy text migration-only and ignores fenced, quoted, and ambiguous prose` and `drops qualified references from legacy lines without hiding genuine ones` pass unchanged (AC5)
- The AC1, AC2 and AC4 cases fail against the pre-fix parser
- `cd scripts && npm test` exits 0

### T003: Document the corrected parsing rules

**File(s)**: `workflows/upgrade-project/references/v3-detectors.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- The issue-dependencies bullets in `v3-detectors.md` say that inline code spans are removed along with fenced code, HTML comments and block quotes
- They also say that a determiner (the, a, an, this, that, our, its, each, every, same) before a run of capitalized words marks a local descriptor, while `PennyScan issue #N` and punctuated names such as `nmg-pi issue #N` stay foreign
- The `v3-detectors.md` edit is made after invoking the `skill-creator` skill
- `CHANGELOG.md` `[Unreleased]` has a `### Fixed` entry for #504

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #504 | 2026-10-25 | Initial defect report |
