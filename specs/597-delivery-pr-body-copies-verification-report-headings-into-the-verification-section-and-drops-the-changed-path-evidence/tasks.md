# Tasks: Delivery PR body copies verification report headings into the Verification section and drops the changed-path evidence

**Issue**: #597
**Date**: 2026-11-22
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/360-close-contribution-gate-evidence-gaps-in-automated-delivery/

## Implementation Tasks

### T001: Correct the Root Cause

**File(s)**: `scripts/contribution-evidence.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1: `buildDeliveryPullRequestBody` drops report lines matching `/^ {0,3}#{1,6}(?:\s|$)/` before the command-result tests.
- FR2: non-heading lines keep the existing code-span or `command:` / `run:` test and pass/fail-word test.

### T002: Implement the Regression Scenarios

**File(s)**: `scripts/__tests__/delivery-pull-request-body.test.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- The file imports `buildDeliveryPullRequestBody` and `evaluateContributionEvidence` from `../contribution-evidence.mjs` and uses an in-memory repository fixture with `CONTRIBUTING.md`, the steering files, and an Approved `specs/42-*/` package. Each test cites its `@SCN` tag:
  - `@SCN001` (AC1): with a report containing ``### Review Findings (all `info`, carried from the passed review)``, no body line starts a Markdown heading except the body's own `## Verification`.
  - `@SCN002` (AC2): with that report and changed paths `scripts/sdlc-deliver.mjs`, `VERSION`, `package.json`, `.claude-plugin/plugin.json`, `evaluateContributionEvidence` returns `{ ok: true, errors: [] }`.
  - `@SCN003` (AC3): a list item and a table row naming a command in a code span with a pass word both appear between `## Verification` and `Changed paths:`.
- `@SCN001` and `@SCN002` fail without T001 and pass with it.
- `scripts/test-layers-allowlist.json` is unchanged and `node scripts/check-test-layers.mjs` passes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #597 | 2026-11-22 | Initial defect tasks |
