# Defect Report: Hand-written CHANGELOG entries are not required to cite their issue

**Issue**: #514
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/503-fix-duplicate-changelog-entry-when-delivery-rolls-a-hand-written-issue-entry/

## Reproduction

1. Write a spec whose task acceptance requires a `CHANGELOG.md` `[Unreleased]` entry for issue #N, using `workflows/write-spec/templates/tasks.md`.
2. Implement it with a bullet that describes the change without the text `(#N)`.
3. Run version preparation for issue #N.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The tasks template, `references/versioning.md`, `steering/snippets/project-tech.md`, and `CLAUDE.md` state that each `[Unreleased]` bullet written for issue #N ends with the exact citation `(#N)`, and `references/versioning.md` documents when delivery adds its generated `- <issue title> (#N)` line. |
| **Actual** | None of these sources state a citation rule, and `references/versioning.md` does not describe the `[Unreleased]` roll, so a bullet without `(#N)` is followed by a duplicate generated line. |

## Acceptance Criteria

### AC1: The tasks template states the citation rule

**Given** `workflows/write-spec/templates/tasks.md`
**When** a spec writer authors a task whose acceptance requires a `CHANGELOG.md` `[Unreleased]` entry for issue #N
**Then** the template states that the acceptance requires each bullet written for that issue to end with the exact citation `(#N)`

### AC2: The versioning reference documents the roll behavior

**Given** `references/versioning.md`
**When** a reader looks up how delivery prepares `CHANGELOG.md`
**Then** it states that each `[Unreleased]` bullet written for issue #N ends with the exact citation `(#N)`, that delivery moves `[Unreleased]` content containing a `- ` bullet with `(#N)` under the new version heading without adding its generated `- <issue title> (#N)` line, and that delivery adds the generated line when no rolled bullet contains `(#N)`

### AC3: Project steering and CLAUDE.md state the same rule

**Given** `steering/snippets/project-tech.md` and the `CLAUDE.md` "Commit & CHANGELOG Conventions" section
**When** an implement worker reads the project changelog conventions
**Then** both state that each `CHANGELOG.md` `[Unreleased]` bullet written for issue #N ends with the exact citation `(#N)`

### AC4: A contract test guards the rule text

**Given** `scripts/__tests__/changelog-citation-contract.test.mjs`
**When** `cd scripts && npm test` runs
**Then** the test fails if the `(#N)` citation rule text is absent from `workflows/write-spec/templates/tasks.md` or `references/versioning.md`

### AC5: Version mirror discovery is preserved

**Given** the edited `steering/snippets/project-tech.md`
**When** its `## Versioning` section is read up to the next `##` or `###` heading, as version preparation reads it
**Then** the declared table rows are exactly `VERSION`, `package.json` (`version`), and `.claude-plugin/plugin.json` (`version`)

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `workflows/write-spec/templates/tasks.md` states that any task acceptance requiring a `CHANGELOG.md` `[Unreleased]` entry for issue #N requires each bullet written for that issue to end with the exact citation `(#N)`. | Must |
| FR2 | `references/versioning.md` states the `(#N)` citation rule and documents that delivery rolls `[Unreleased]` bullets citing `(#N)` without adding its generated title line, and adds the generated line otherwise. | Must |
| FR3 | `steering/snippets/project-tech.md` and the `CLAUDE.md` "Commit & CHANGELOG Conventions" section state the same `(#N)` citation rule, without changing the version mirrors declared in the `## Versioning` table. | Must |
| FR4 | A contract test under `scripts/__tests__/` asserts the `(#N)` citation rule text is present in `workflows/write-spec/templates/tasks.md` and `references/versioning.md`. | Must |

## Out of Scope

- Changing how version preparation detects a citation (the "contains `(#N)`" match specified by #503).
- Validating or rewriting existing `CHANGELOG.md` entries, including the released entries for #484, #485, and #486.
- The `### Changed` vs `### Fixed` category of the generated line.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #514 | 2026-10-25 | Initial defect report |
