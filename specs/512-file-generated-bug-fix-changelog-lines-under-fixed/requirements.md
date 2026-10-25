# Defect Report: Generated bug-fix CHANGELOG lines are filed under ### Changed

**Issue**: #512
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/503-fix-duplicate-changelog-entry-when-delivery-rolls-a-hand-written-issue-entry/

## Reproduction

1. In a project with `VERSION` `3.4.5`, a declared `package.json` version mirror, and a `CHANGELOG.md` whose `## [Unreleased]` section is empty, use issue #42 titled `Deliver verified changes` and labelled `bug`, with no `BREAKING:` declaration.
2. Run `sdlc-deliver.mjs prepare-version --issue 42`.
3. Read the new `## [3.4.6]` section of `CHANGELOG.md`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | `## [3.4.6]` contains `### Fixed` followed by `- Deliver verified changes (#42)`. |
| **Actual** | `## [3.4.6]` contains `### Changed` followed by `- Deliver verified changes (#42)`. |

## Acceptance Criteria

### AC1: Bug issue line is filed under Fixed

**Given** an issue labelled `bug` with no `BREAKING:` declaration, and a `CHANGELOG.md` whose `[Unreleased]` section is empty
**When** `prepare-version --issue N` prepares the version
**Then** the new `## [X.Y.Z] - date` section contains `### Fixed` followed by `- <issue title> (#N)`
**And** that section contains no `### Changed` heading

### AC2: Generated line merges into an existing matching section

**Given** an issue labelled `bug`, and an `[Unreleased]` section containing a hand-written `### Fixed` section with a bullet that cites a different issue number, followed by a `### Changed` section
**When** `prepare-version --issue N` prepares the version
**Then** the new release section contains exactly one `### Fixed` heading
**And** `- <issue title> (#N)` is the last bullet of that `### Fixed` section, directly after the hand-written bullet
**And** the hand-written bullets and the `### Changed` section are kept in their original order and text

### AC3: Feature issues keep Changed

**Given** an issue labelled `enhancement` (not `bug`) with no `BREAKING:` declaration, and an `[Unreleased]` section containing a hand-written `### Changed` section with a bullet that cites a different issue number
**When** `prepare-version --issue N` prepares the version
**Then** the new release section contains exactly one `### Changed` heading, whose last bullet is `- <issue title> (#N)`
**And** the release section contains no `### Fixed` heading

### AC4: Approved breaking change keeps Changed (BREAKING)

**Given** an issue labelled `bug` whose title declares `BREAKING:`, and an approved spec containing the line `**Version bump**: major`
**When** `prepare-version --issue N` prepares the version
**Then** the version is bumped to the next major
**And** `- <issue title> (#N)` is filed under `### Changed (BREAKING)`, with no `### Fixed` heading added

### AC5: A re-run does not bump the version again

**Given** a branch where `prepare-version --issue N` already filed the issue's generated line under `### Fixed` for a `bug` issue, and committed the delivery version artifacts
**When** `prepare-version --issue N` runs again
**Then** it reports the already-prepared version
**And** `VERSION`, the declared version mirrors, and `CHANGELOG.md` are unchanged and no new commit is created

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | When version preparation adds the generated line `- <issue title> (#N)`, its category is `Changed (BREAKING)` for an approved breaking change, otherwise `Fixed` when the issue has the `bug` label, otherwise `Changed`. | Must |
| FR2 | When the rolled `[Unreleased]` content has a line exactly equal to `### <category>` for the chosen category, the generated line is appended as the last bullet of that section, before the next `### ` heading or the end of the rolled content. Otherwise a new `### <category>` heading with the generated line follows the rolled content. `### Changed` and `### Changed (BREAKING)` never match each other. | Must |
| FR3 | `synchronizedDeliveryVersion` / `hasSynchronizedDeliveryState` treat the current release as prepared when its section contains the generated line under any of the three headings, so a re-run of `prepare-version` does not bump the version again. | Must |
| FR4 | Regression tests for AC1–AC5 are in `scripts/__tests__/sdlc-deliver.test.mjs`. | Must |

## Out of Scope

- Rewriting the headings of released entries in `CHANGELOG.md`, such as 4.4.5 and 4.4.7.
- Other categories such as `### Added` or `### Removed`, and labels other than `bug` choosing the category.
- Skipping the generated line when a hand-written `[Unreleased]` bullet already references the issue (owned by #503).
- Changing version bump rules, the generated line's wording, or the delivery commit subject.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #512 | 2026-10-25 | Initial defect report |
