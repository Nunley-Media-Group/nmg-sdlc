# Root Cause Analysis: Generated bug-fix CHANGELOG lines are filed under ### Changed

**Issue**: #512
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/503-fix-duplicate-changelog-entry-when-delivery-rolls-a-hand-written-issue-entry/

## Root Cause

`synchronizeVersion` in `scripts/sdlc-deliver.mjs` computes `labels = issueLabels(issueData)` and uses `labels.includes('bug')` to choose a patch bump. It then calls `updateChangelog(changelog, version, date, '<title> (#N)', breaking)` with only the `breaking` flag. `updateChangelog` sets `category = breaking ? 'Changed (BREAKING)' : 'Changed'`, so a `bug` issue's classification never reaches the heading. `updateChangelog` also always writes `### <category>` plus the line after the rolled `[Unreleased]` text. It never looks for a section with the same heading in that text, so once bugs map to `Fixed`, a rolled hand-written `### Fixed` section would sit next to a second `### Fixed` heading.

`synchronizedDeliveryVersion` checks only that the release section includes `- <title> (#N)`, so detection is already independent of the heading.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/sdlc-deliver.mjs` | `synchronizeVersion` | Knows the labels but passes only `breaking` to `updateChangelog` |
| `scripts/sdlc-deliver.mjs` | `updateChangelog` | Hard-codes the `Changed` category and always appends a new heading |
| `scripts/sdlc-deliver.mjs` | `synchronizedDeliveryVersion` | Heading-agnostic prepared-release check that must stay so |

## Fix Strategy

`synchronizeVersion` computes the category once: `breaking ? 'Changed (BREAKING)' : labels.includes('bug') ? 'Fixed' : 'Changed'`. It passes that category to `updateChangelog` instead of the `breaking` boolean. `updateChangelog` splits the trimmed rolled body into lines and looks for a line exactly equal to `### <category>`. If it finds one, it inserts `- <entry>` after the last non-blank line of that section (the section ends at the next line starting with `### `, or at the end of the body) and writes the body without an extra heading. Otherwise it keeps today's output: the rolled body, a blank line, then `### <category>` and the line. Exact line equality keeps `### Changed` from matching `### Changed (BREAKING)`. `synchronizedDeliveryVersion` is not changed. If #503's hand-written-reference skip is already present when this lands, it stays in front of this logic: the category and merge rules apply only when the generated line is added.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/sdlc-deliver.mjs` | `synchronizeVersion` derives the category from `breaking` and the `bug` label, and passes it to `updateChangelog` | AC1, AC3, AC4; FR1 |
| `scripts/sdlc-deliver.mjs` | `updateChangelog` takes a category and appends to an exactly matching rolled section, otherwise adds a new heading | AC2, AC3; FR2 |
| `scripts/__tests__/sdlc-deliver.test.mjs` | Fixture options for issue labels, title, `[Unreleased]` content, and approved spec text; regression tests for AC1–AC5 | FR3, FR4 |

## Blast Radius

Only the category and placement of the generated `CHANGELOG.md` line from `prepare-version` change. Bump selection, `major_bump_required`, version mirror updates, the `fix:`/`feat:` delivery commit subject, the `version_artifact_missing` checks, and prepared-release detection are untouched. Existing releases that hold the generated line under `### Changed` remain recognized as prepared, because detection ignores the heading.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Append into an exactly matching rolled section | Selected | Avoids duplicate headings when hand-written content uses the same category |
| Always add a new `### <category>` heading | Rejected | Produces two `### Fixed` headings in releases like 4.4.4 and 4.4.6 |
| Derive the category inside `updateChangelog` from labels | Rejected | `synchronizeVersion` already owns label classification for the bump; one place keeps them consistent |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #512 | 2026-10-25 | Initial defect design |
