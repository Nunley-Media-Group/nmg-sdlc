# Defect Report: Exclude every gate-recognized heading from the delivery PR body's Verification section

**Issue**: #602
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/597-delivery-pr-body-copies-verification-report-headings-into-the-verification-section-and-drops-the-changed-path-evidence/

## Reproduction

1. Build a delivery pull-request body with `buildDeliveryPullRequestBody` from a verification report that contains the line `    ### Results (`npm test` passed)` (four leading spaces), with changed paths that include `VERSION`.
2. Evaluate the built body with `evaluateContributionEvidence`.
3. The heading-shaped line appears under `## Verification`, and the evaluation reports `VERSION` as an unmatched changed path.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | No report line that the contribution gate treats as a heading is copied into the body, so `Changed paths:` stays inside the `## Verification` section and every changed path is matched |
| **Actual** | Heading-shaped lines indented by four or more spaces, or by a tab, are copied. The gate reads them as headings that end the Verification section, and the changed paths are reported as unmatched |

## Acceptance Criteria

### AC1: Indented heading lines are not copied

**Given** a verification report with a heading-shaped line indented by four spaces, by eight spaces, or by a tab, each containing a code span and a pass word
**When** the delivery pull-request body is built
**Then** the body does not contain that line
**And** the only line in the body matching the gate's heading rule `/^\s*#{1,6}\s+(.+?)\s*$/` is `## Verification`

### AC2: Changed paths stay verification evidence

**Given** that report and changed paths including `VERSION`, `package.json` and `.claude-plugin/plugin.json`
**When** the built body is evaluated by the contribution evidence check
**Then** every changed path is matched and the evaluation passes

### AC3: Command results are still copied

**Given** a verification report with a command-result list item, a table row, or an indented list item, each naming a command in a code span with a pass word
**When** the delivery pull-request body is built
**Then** that line appears unchanged in the `## Verification` section before `Changed paths:`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `buildDeliveryPullRequestBody` excludes every report line whose first non-whitespace characters are one to six `#` followed by whitespace or the end of the line, whatever its indentation | Must |
| FR2 | Non-heading command-result lines, including indented ones, are still copied unchanged | Must |

## Out of Scope

- Changing the contribution gate's heading rule or its managed workflow version
- Other content of the delivery pull-request body

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #602 | 2026-11-23 | Initial defect report |
