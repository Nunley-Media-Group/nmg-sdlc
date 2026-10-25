# Tasks: Hand-written CHANGELOG entries are not required to cite their issue

**Issue**: #514
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/503-fix-duplicate-changelog-entry-when-delivery-rolls-a-hand-written-issue-entry/

## Implementation Tasks

### T001: State the citation rule in the write-spec tasks template

**File(s)**: `workflows/write-spec/templates/tasks.md`
**Type**: Modify
**Depends**: none
**Acceptance**:
- After the `**File(s)**:` paragraph, the template states that a task acceptance requiring a `CHANGELOG.md` `[Unreleased]` entry for issue #N requires each bullet written for that issue to end with the exact citation `(#N)`, allowing a single trailing period, with an example bullet (AC1, FR1)

### T002: Document the citation rule and roll behavior in the versioning reference

**File(s)**: `references/versioning.md`; `scripts/skill-inventory.baseline.json`
**Type**: Modify
**Depends**: none
**Acceptance**:
- A `## CHANGELOG entries` section states the end-with-`(#N)` rule, that delivery moves `[Unreleased]` content under the new version heading without adding its generated `- <issue title> (#N)` line when a rolled `- ` bullet contains `(#N)`, and that it adds the generated line otherwise (AC2, FR2)
- `node scripts/skill-inventory-audit.mjs --check` exits 0 and `scripts/skill-inventory.baseline.json` equals a fresh `--baseline` output

### T003: State the citation rule in project steering and CLAUDE.md

**File(s)**: `steering/snippets/project-tech.md`; `CLAUDE.md`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `steering/snippets/project-tech.md` has a `### Changelog Entries` subsection after `### Version Bump Classification` stating the end-with-`(#N)` rule; the `## Versioning` table is unchanged (AC3, AC5, FR3)
- `CLAUDE.md` `## Commit & CHANGELOG Conventions` has a bullet stating the same rule (AC3, FR3)

### T004: Add the changelog citation contract test

**File(s)**: `scripts/__tests__/changelog-citation-contract.test.mjs`
**Type**: Create
**Depends**: T001, T002, T003
**Acceptance**:
- Asserts the end-with-`(#N)` rule text in `workflows/write-spec/templates/tasks.md` (AC1), `references/versioning.md` with the generated-line roll wording (AC2), `steering/snippets/project-tech.md`, and the `CLAUDE.md` `## Commit & CHANGELOG Conventions` section (AC3), so removing the text from the template or reference fails the test (AC4, FR4)
- Asserts the `## Versioning` section of `steering/snippets/project-tech.md`, sliced to the next `##`/`###` heading, declares exactly `VERSION`, `package.json` (`version`), and `.claude-plugin/plugin.json` (`version`) (AC5)
- `cd scripts && npm test -- --testPathPattern=changelog-citation-contract` exits 0, and the full `cd scripts && npm test` exits 0

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #514 | 2026-10-25 | Initial defect tasks |
