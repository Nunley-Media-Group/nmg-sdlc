# Defect Report: Delivery PR body copies verification report headings into the Verification section and drops the changed-path evidence

**Issue**: #597
**Date**: 2026-11-22
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/360-close-contribution-gate-evidence-gaps-in-automated-delivery/

## Reproduction

1. A committed `verification-report.md` contains a Markdown heading with a code span and a pass word, such as ``### Review Findings (all `info`, carried from the passed review)``.
2. Delivery builds the pull-request body with `buildDeliveryPullRequestBody` in `scripts/contribution-evidence.mjs`.
3. The heading is copied between `## Verification` and `Changed paths:`, so it starts a new section.
4. `evaluateContributionEvidence` fails with `Unmatched changed paths: …, VERSION, package.json, .claude-plugin/plugin.json`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The `Changed paths:` list stays inside the body's `## Verification` section whatever the report contains, and the contribution evidence check passes. |
| **Actual** | A report heading that contains a code span and a pass word is copied into the body, ends the `## Verification` section, and the changed paths are reported as unmatched. |

## Acceptance Criteria

### AC1: A report heading is not copied into the body

**Given** a verification report with a Markdown heading line that contains a code span and a pass word, such as ``### Review Findings (all `info`, carried from the passed review)``
**When** the delivery pull-request body is built
**Then** the body contains no line from the report that starts a Markdown heading

### AC2: The changed-path list stays verification evidence

**Given** that report and a change that includes `VERSION`, `package.json` and `.claude-plugin/plugin.json`
**When** the built body is evaluated by the contribution evidence check
**Then** every changed path is matched and the evaluation passes

### AC3: Command results are still copied

**Given** a verification report with ordinary command-result lines, such as a list item or table row naming a command in a code span with a pass word
**When** the delivery pull-request body is built
**Then** those lines still appear in the `## Verification` section

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `buildDeliveryPullRequestBody` never copies a report line that is a Markdown ATX heading (up to three leading spaces, one to six `#`, then whitespace or end of line) | Must |
| FR2 | Report lines that are not headings keep the existing command-result selection: a code span or `command:` / `run:`, plus a pass or fail word | Must |

## Out of Scope

- Changes to the contribution gate evaluator in `references/contribution-gate.md`
- Changes to how the verification report is written

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #597 | 2026-11-22 | Initial defect report |
