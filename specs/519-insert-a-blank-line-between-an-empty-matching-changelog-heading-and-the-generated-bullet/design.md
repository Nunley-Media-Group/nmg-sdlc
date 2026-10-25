# Root Cause Analysis: Generated CHANGELOG bullet lacks a blank line under an empty matching heading

**Issue**: #519
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/512-file-generated-bug-fix-changelog-lines-under-fixed/

## Root Cause

`updateChangelog` trims the `[Unreleased]` body and passes it to `addGeneratedEntry`. That function locates the line exactly equal to `### <category>` (`start`), finds the section end (`end`, the next `### ` line or the end of input), and walks `last` back from `end - 1` past blank lines. It then splices the entry at `last + 1`. When the section holds no non-blank lines, the walk stops at `last === start`, so the entry is inserted directly after the heading. A trailing empty heading has no blank lines left after trimming, which yields `### Fixed\n- …`. An empty heading followed by another heading keeps its blank lines, but they now sit after the inserted entry instead of before it.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/sdlc-deliver.mjs` | `addGeneratedEntry` | Chooses the insertion point for the generated bullet |
| `scripts/sdlc-deliver.mjs` | `updateChangelog` | Trims `[Unreleased]` and calls `addGeneratedEntry` |

## Fix Strategy

In `addGeneratedEntry`, after computing `last`, branch on `last === start`. If true, the matching section is empty: replace `lines[start + 1 .. end - 1]` (all blank) with `''`, the entry, and one more `''` only when `end < lines.length` (another heading follows). Otherwise keep the existing `lines.splice(last + 1, 0, entry)`. The no-match path (`start < 0`) is untouched.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/sdlc-deliver.mjs` | Add the empty-section branch to `addGeneratedEntry` and update its leading comment to describe it | AC1, AC2; FR1, FR2 |
| `scripts/__tests__/sdlc-deliver.test.mjs` | Add `prepare-version` regression tests for the empty trailing heading and for the empty heading followed by another section, and keep the populated and no-match tests | AC1–AC4; FR1–FR3 |

## Blast Radius

`addGeneratedEntry` is called only from `updateChangelog`, and only when `[Unreleased]` has no existing `(#N)` bullet for the issue. `synchronizedDeliveryVersion` matches the generated line by content, not position, so idempotent re-runs are unaffected. The populated and no-match outputs are byte-identical to before.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Replace the empty section's blank lines with `''`, entry, and a `''` only before a following heading | Selected | Gives exactly one blank line on each side whatever the number of original blank lines |
| Splice `['', entry]` after the heading | Rejected | Leaves the original blank lines after the entry, so several blank lines before a following heading produce more than one blank line |
| Normalize blank lines across the whole rolled section | Rejected | Rewrites hand-written content outside the defect, which is out of scope |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #519 | 2026-10-25 | Initial defect design |
