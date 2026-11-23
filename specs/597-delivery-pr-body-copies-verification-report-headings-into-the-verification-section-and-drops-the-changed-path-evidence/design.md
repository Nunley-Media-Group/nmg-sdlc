# Root Cause Analysis: Delivery PR body copies verification report headings into the Verification section and drops the changed-path evidence

**Issue**: #597
**Date**: 2026-11-22
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/360-close-contribution-gate-evidence-gaps-in-automated-delivery/

## Root Cause

`buildDeliveryPullRequestBody` selects command results from the verification report with two line tests: the line has a code span (or `command:` / `run:`), and it has a pass or fail word. It does not check what kind of Markdown line it is. A heading such as ``### Review Findings (all `info`, carried from the passed review)`` passes both tests and is emitted between `## Verification` and `Changed paths:`. The contribution gate reads that heading as the end of the Verification section, so the `Changed paths:` list is no longer verification evidence and the version paths are reported as unmatched.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/contribution-evidence.mjs` | `buildDeliveryPullRequestBody` command-result filter | Copies report lines into the body's Verification section |

## Fix Strategy

Add a heading test to the command-result filter: drop any line matching `/^ {0,3}#{1,6}(?:\s|$)/`. Every other line keeps the existing selection.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/contribution-evidence.mjs` | Exclude ATX heading lines from `commandResults` | AC1, AC2, FR1 |
| `scripts/__tests__/delivery-pull-request-body.test.mjs` | New scenario tests citing `@SCN001`–`@SCN003` | AC1–AC3 |

## Blast Radius

Only `scripts/sdlc-deliver.mjs` calls `buildDeliveryPullRequestBody`. Bodies built from reports without heading matches are unchanged (FR2).

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Drop ATX heading lines from the copied results | Selected | Smallest change; headings are never command results |
| Strip the leading `#` and keep the heading text | Rejected | Copies section titles as if they were command results |
| Move `Changed paths:` above the command results | Rejected | Any later heading-like line could still split the section |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #597 | 2026-11-22 | Initial defect design |
