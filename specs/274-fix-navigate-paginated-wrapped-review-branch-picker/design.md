# Design: Navigate paginated wrapped review branch picker

**Issue**: #274
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/208-replace-execute-simplify-with-two-branch-to-main-review-and-fix-panes/

---

## Overview

Keep review orchestration in `scripts/sdlc-execute.mjs`. Replace the wrapped-picker all-branches assumption with a parser that reconstructs the visible fragments against every possible contiguous segment of the known branch list. Recognition succeeds only when exactly one segment consumes every fragment, produces at least two complete options, and contains exactly one cursor attached to an option's first fragment.

The recognized picker returns the selected branch, not only a boolean. `completeInteractiveReview()` derives directional key events from that selected branch's index to the default branch's index, appends Enter, and preserves the existing working/settled waits. Numbered and ordinary unnumbered layouts continue through their existing validation, with the selected visible option exposed when available.

## Parser Contract

1. Normalize terminal border and whitespace with the existing `pickerLineContent()` logic.
2. Require one exact `Select base branch to compare against` title and a supported navigation footer.
3. Collect non-empty option fragments, preserving whether the cursor precedes each fragment.
4. For each index in the complete known branch list, attempt to consume fragments into consecutive exact branch names.
5. Reject a candidate when a fragment is not a prefix continuation, a cursor appears after an option has started, an option is incomplete, fewer than two options are reconstructed, or cursor cardinality is not one.
6. Accept only one candidate segment. Multiple candidates are ambiguous and fail closed.
7. Return the cursor-owned branch as the current selection. The default branch may be outside the visible segment.

## Navigation Contract

Given current index `c` and default index `d` in the same known branch order:

- `d > c`: send `d - c` Down events.
- `d < c`: send `c - d` Up events.
- `d === c`: send no directional event.
- Append Enter in every successful case.

This avoids depending on picker wraparound while retaining the existing initial-first-row behavior.

## Failure Handling

Unknown layouts, incomplete page renders, impossible fragment reconstruction, duplicate reconstruction, missing branches, and invalid cursor placement remain unrecognized. Execute sends no selection keys and retains the existing `review_failed` stop behavior.

## Affected Paths

- `scripts/sdlc-execute.mjs`: visible-segment parser, selected-branch extraction, and relative navigation.
- `scripts/__tests__/sdlc-execute.test.mjs`: paginated wrapped fresh and retained review regressions plus malformed/ambiguous negatives.
- `CHANGELOG.md`: pending defect correction.
- `README.md`: clarify that review selection supports wrapped, paginated OMP branch pickers.

## Verification Strategy

- Focused Jest execution for `scripts/__tests__/sdlc-execute.test.mjs`.
- Existing script test suite.
- Repository validation commands required by the registered steering runtime.
- Behavioral controller fixture proving key submission reaches off-screen `main` before the review worker prompt.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #274 | 2026-08-26 | Initial bug-fix design |
