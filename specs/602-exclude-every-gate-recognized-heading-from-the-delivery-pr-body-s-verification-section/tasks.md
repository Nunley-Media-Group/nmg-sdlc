# Tasks: Exclude every gate-recognized heading from the delivery PR body's Verification section

**Issue**: #602
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/597-delivery-pr-body-copies-verification-report-headings-into-the-verification-section-and-drops-the-changed-path-evidence/

## Implementation Tasks

### T001: Correct the Root Cause

**File(s)**: `scripts/contribution-evidence.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1: the `commandResults` filter in `buildDeliveryPullRequestBody` excludes lines matching `/^\s*#{1,6}(?:\s|$)/`.
- FR2: the command and pass-word conditions of the filter are unchanged.

### T002: Implement the Regression Scenarios

**File(s)**: `scripts/__tests__/delivery-pull-request-body-indented-headings.test.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- `@SCN001` (AC1): for the report lines `    ### Results (`npm test` passed)`, `        ## Gates (`npm test` passed)` and a tab followed by `### Results (`npm test` passed)`, the built body does not contain the line, and its only line matching `/^\s*#{1,6}\s+(.+?)\s*$/` is `## Verification`.
- `@SCN002` (AC2): `evaluateContributionEvidence` on the body built from that report, with changed paths `scripts/sdlc-deliver.mjs`, `VERSION`, `package.json` and `.claude-plugin/plugin.json`, resolves to `{ ok: true, errors: [] }`.
- `@SCN003` (AC3): the lines `- `npm test` — passed`, `| `git diff --check` | Pass |` and `    - `npm test` — passed` each appear unchanged between `## Verification` and `Changed paths:`.
- Each test cites its `@SCN` tag in its describe title.
- `@SCN001` and `@SCN002` fail without T001 and pass with it.
- `cd scripts && npm test -- __tests__/delivery-pull-request-body-indented-headings.test.mjs __tests__/delivery-pull-request-body.test.mjs __tests__/contribution-evidence.test.mjs` passes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #602 | 2026-11-23 | Initial defect tasks |
