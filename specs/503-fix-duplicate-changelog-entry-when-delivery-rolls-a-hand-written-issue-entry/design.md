# Root Cause Analysis: Delivery duplicates the issue's CHANGELOG entry

**Issue**: #503
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/484-fix-first-run-delivery-missing-changelog-md-and-push-event-checks-block-sdlc-execute/

## Root Cause

`synchronizeVersion` in `scripts/sdlc-deliver.mjs` calls `updateChangelog(changelog, version, date, '<title> (#N)', breaking)`. `updateChangelog` slices the trimmed body between `## [Unreleased]` and the next `## [` heading, writes it under the new `## [version] - date` heading, and then always appends `### Changed` (or `### Changed (BREAKING)`) with `- <title> (#N)`. It never inspects the rolled body, so a hand-written bullet such as `- ... (#N). ...` under `### Fixed` ends up next to a generated duplicate.

`synchronizedDeliveryVersion(changelog, version, issue, title)` reports the current release as synchronized only when its section includes the exact generated line `- <title> (#N)`. `hasSynchronizedDeliveryState` gates both the `prepare-version` early return and the delivery `version_not_prepared` check on it. Once the generated line is skipped, a release whose only reference is the hand-written bullet would fail that check, and a re-run would bump the version a second time.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/sdlc-deliver.mjs` | `updateChangelog` | Always appends the generated entry |
| `scripts/sdlc-deliver.mjs` | `synchronizedDeliveryVersion` | Recognizes only the generated line as synchronized |
| `scripts/sdlc-deliver.mjs` | `synchronizeVersion` | Passes the formatted `<title> (#N)` entry to `updateChangelog` |
| `scripts/sdlc-deliver.mjs` | `hasSynchronizedDeliveryState` | Consumes `synchronizedDeliveryVersion` for `prepare-version` and delivery |

## Fix Strategy

Add one helper that reports whether a block of changelog text has a line starting with `- ` that contains the literal `(#N)` (string containment, so `(#4)` and `(#420)` never match `(#42)`). `updateChangelog` receives the issue number; when the rolled `[Unreleased]` body satisfies the helper it writes `## [Unreleased]`, the new heading, and the rolled body with no generated category block; otherwise it keeps today's output. `synchronizedDeliveryVersion` returns true when the release section contains the generated line or satisfies the helper. `hasSynchronizedDeliveryState` keeps its commit and diff checks unchanged.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/sdlc-deliver.mjs` | Add an issue-reference helper; pass the issue number into `updateChangelog`; skip the generated block when the rolled body references `(#N)` | AC1, AC2, AC3, AC5; FR1, FR2 |
| `scripts/sdlc-deliver.mjs` | `synchronizedDeliveryVersion` also accepts a `(#N)` bullet in the release section | AC4; FR3 |
| `scripts/__tests__/sdlc-deliver.test.mjs` | Regression tests driving `prepare-version` and delivery through the existing `fixture({ versionPrepared: false })` | AC1–AC5; FR4 |

## Blast Radius

Only `prepare-version` changelog output and the synchronized-state check change. Bump selection, `major_bump_required`, version mirror updates, the delivery commit subject, and the `version_artifact_missing` checks from #484 are untouched. Releases already containing the generated line remain synchronized.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Match `(#N)` in a `- ` bullet line | Selected | Matches how hand-written entries reference issues; exact token avoids prefix matches |
| Match any `#N` with a digit boundary | Rejected | Broader than the agreed rule; out of scope |
| Remove the generated line after writing | Rejected | Two-step rewrite of the same section; skipping it at generation is simpler |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #503 | 2026-10-25 | Initial defect design |
