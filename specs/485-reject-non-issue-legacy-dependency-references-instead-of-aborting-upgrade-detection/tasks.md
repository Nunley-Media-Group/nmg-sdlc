# Tasks: Non-issue legacy dependency references abort upgrade detection

**Issue**: #485
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG

## Implementation Tasks

### T001: Ignore table rows and qualified references in legacy parsing

**File(s)**: `scripts/issue-dependencies.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC1/FR1: a markdown table row and `requires the fix after PR #307` yield no edge for `#307`
- AC2/FR1: `PennyScan issue #102 therefore fails` and `depends on Other-Org/other-repo#12` yield no edge for `#102` or `#12`
- AC4: `After issue #394 resumes a consumed dispatch` still yields `blockedBy #394`, `Depends on: #10, #11` still yields `blockedBy #10` and `blockedBy #11`, and `Requires #10 and #11` remains an `ambiguous_dependency_evidence` finding

### T002: Report dangling legacy candidates as findings

**File(s)**: `scripts/sdlc-upgrade.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC3/FR2: a candidate with an endpoint outside the repository issue graph is absent from `additions` and present in `findings` with `reason: 'dependency_dangling_candidate'`, its source `line`, and its `edge`, and `detect` returns the full report without throwing
- AC5/FR3: an existing official edge to a non-issue target, or a dangling approved edge at apply, still throws `dependency_dangling`

### T003: Document report-only dangling candidates

**File(s)**: `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/detection.md`, `workflows/upgrade-project/references/v3-detectors.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- FR4: the issue-dependencies detection text says that table rows and PR, other-project, and other-repository references are ignored, that legacy candidates with non-issue endpoints are report-only `dependency_dangling_candidate` findings, and that existing official dangling edges and open cycles still fail closed
- Workflow edits are made after invoking the `skill-creator` skill
- `CHANGELOG.md` `[Unreleased]` has a `### Fixed` entry for #485

### T004: Regression coverage

**File(s)**: `scripts/__tests__/issue-dependencies.test.mjs`, `scripts/__tests__/body-relationships.test.mjs`, `scripts/__tests__/sdlc-upgrade.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- AC1/AC2/AC4: parser tests cover the table row, `PR #307`, `PennyScan issue #102`, `Other-Org/other-repo#12`, `After issue #394 …`, `Depends on: #10, #11`, and the existing ambiguous and fenced/quoted cases
- AC3: an `official dependency upgrade reconciliation` test stubs a repository issue listing where one body references a number that is a pull request or absent from the listing. It asserts that detect returns the report with the edge in `findings` as `dependency_dangling_candidate`, that the edge is absent from `additions`, and that other valid additions and other categories are still present
- AC5: tests assert that `dependency_dangling` is still thrown for an existing official edge to a missing target and for a dangling approved edge passed to `preflightBlockedByEdges`
- `cd scripts && npm test` exits 0

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #485 | 2026-10-25 | Initial defect report |
