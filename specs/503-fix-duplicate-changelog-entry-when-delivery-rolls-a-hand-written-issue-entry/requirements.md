# Defect Report: Delivery duplicates the issue's CHANGELOG entry

**Issue**: #503
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/484-fix-first-run-delivery-missing-changelog-md-and-push-event-checks-block-sdlc-execute/

## Reproduction

1. In a project with `VERSION` `1.2.3` and a `CHANGELOG.md` whose `## [Unreleased]` section contains `### Fixed` with `- Corrected the widget (#42).`, use issue #42 labeled `bug`.
2. Run `sdlc-deliver.mjs prepare-version --issue 42`.
3. Read the new `## [1.2.4]` section of `CHANGELOG.md`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The `## [1.2.4]` section contains the hand-written `### Fixed` entry once and no generated `### Changed` line for #42. A second `prepare-version --issue 42` run leaves `VERSION` at `1.2.4`, changes no file, and creates no commit. |
| **Actual** | The `## [1.2.4]` section contains the hand-written `### Fixed` entry plus a generated `### Changed` section with `- <issue title> (#42)`, so #42 is listed twice. |

## Acceptance Criteria

### AC1: Hand-written issue entry is rolled without a generated duplicate

**Given** the `[Unreleased]` section of `CHANGELOG.md` contains a `- ` bullet line containing the exact text `(#N)` for the issue being delivered
**When** `prepare-version --issue N` prepares the version
**Then** the new `## [X.Y.Z] - date` section contains the rolled `[Unreleased]` content unchanged
**And** it contains no generated `### Changed` or `### Changed (BREAKING)` line for the issue
**And** `## [Unreleased]` is left empty above the new heading

### AC2: Generated entry is still added when no entry references the issue

**Given** the `[Unreleased]` section is empty, or contains only bullets that do not contain the exact text `(#N)`
**When** `prepare-version --issue N` prepares the version
**Then** the new version section contains the rolled content followed by `### Changed` with `- <issue title> (#N)`

### AC3: Approved breaking change keeps the BREAKING category

**Given** an issue whose title declares `BREAKING:`, an approved spec line `**Version bump**: major`, and no `[Unreleased]` bullet containing `(#N)`
**When** `prepare-version --issue N` prepares the version
**Then** the version is bumped to the next major and the generated line is added under `### Changed (BREAKING)`

### AC4: Re-run after rolling a hand-written entry does not bump again

**Given** a branch where `prepare-version --issue N` already rolled a hand-written `(#N)` entry into `## [X.Y.Z]` and committed the delivery version artifacts
**When** `prepare-version --issue N` runs again
**Then** `VERSION`, the declared version mirrors, and `CHANGELOG.md` are unchanged and no new commit is created
**And** delivery for that branch does not fail with `version_not_prepared`

### AC5: Matching is exact to the issue number

**Given** the `[Unreleased]` section has bullets containing `(#4)` and `(#420)` but none containing `(#42)`
**When** `prepare-version --issue 42` prepares the version
**Then** the generated `### Changed` line `- <issue title> (#42)` is added

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | When the rolled `[Unreleased]` content contains a `- ` bullet line containing the exact text `(#N)`, version preparation moves that content under the new version heading without adding the generated title line. | Must |
| FR2 | When no rolled bullet contains `(#N)`, version preparation adds the generated `### Changed` (or `### Changed (BREAKING)` for an approved breaking change) line `- <issue title> (#N)`. | Must |
| FR3 | `synchronizedDeliveryVersion` and `hasSynchronizedDeliveryState` treat the current version's release section as synchronized when it contains the generated line or a `- ` bullet line containing `(#N)`, so a re-run of `prepare-version` or delivery's prepared-version check does not bump the version again. | Must |
| FR4 | Regression tests for AC1–AC5 are in `scripts/__tests__/sdlc-deliver.test.mjs`. | Must |

## Out of Scope

- Rewriting existing duplicate entries in released `CHANGELOG.md` sections.
- Recognizing issue references in forms other than the exact `(#N)` text, such as `(#484, #485)` or `see #484`.
- Changing the version bump rules or the generated entry's wording.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #503 | 2026-10-25 | Initial defect report |
