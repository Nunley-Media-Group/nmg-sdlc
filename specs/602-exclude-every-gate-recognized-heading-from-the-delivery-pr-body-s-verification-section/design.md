# Root Cause Analysis: Exclude every gate-recognized heading from the delivery PR body's Verification section

**Issue**: #602
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/597-delivery-pr-body-copies-verification-report-headings-into-the-verification-section-and-drops-the-changed-path-evidence/

## Root Cause

`buildDeliveryPullRequestBody` in `scripts/contribution-evidence.mjs` drops report lines matching `/^ {0,3}#{1,6}(?:\s|$)/`, the CommonMark heading rule with at most three spaces of indentation. The contribution gate's `extractVerificationSection` treats any line matching `/^\s*#{1,6}\s+(.+?)\s*$/` as a heading, with any leading whitespace. The two rules disagree for lines indented by four or more spaces or by a tab. Such a line, when it also names a command in a code span and a pass word, passes the builder's filter, is copied under `## Verification`, and ends that section in the gate before `Changed paths:`.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/contribution-evidence.mjs` | `buildDeliveryPullRequestBody`, `commandResults` filter | Selects the report lines copied into the body |
| `.github/workflows/nmg-sdlc-contribution-gate.yml` | `extractVerificationSection` heading match | Defines which body lines end the Verification section (unchanged) |

## Fix Strategy

Replace the builder's heading exclusion with `/^\s*#{1,6}(?:\s|$)/`. This matches every line the gate's rule matches, at any indentation including tabs, and it keeps excluding the bare `#`-only lines the current rule already excludes. The command and pass-word conditions are unchanged.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/contribution-evidence.mjs` | In the `commandResults` filter, change the heading exclusion from `/^ {0,3}#{1,6}(?:\s|$)/` to `/^\s*#{1,6}(?:\s|$)/` | AC1, AC2, FR1 |

## Blast Radius

`buildDeliveryPullRequestBody` is called only by delivery when it creates or updates the pull-request body. The change only removes more lines from the copied command results. A report line indented four or more spaces whose first character is `#`, such as a shell comment inside an indented code block, is no longer copied. The gate already read such a line as a heading, so it never counted as evidence. The scenarios of #597 in `scripts/__tests__/delivery-pull-request-body.test.mjs` keep passing, because the new rule excludes a superset of the old one.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Widen the builder's exclusion to any leading whitespace | Selected | One-line change that makes the builder at least as strict as the gate |
| Narrow the gate's heading rule to CommonMark indentation | Rejected | Changes the managed gate workflow and its version, which the issue excludes |
| Strip leading whitespace from copied lines | Rejected | Would turn an indented heading-shaped line into a real heading in the body |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #602 | 2026-11-23 | Initial defect design |
