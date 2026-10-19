# Defect Report: Fix sdlc-status pull-request query failing on unsupported reviewThreads field

**Issue**: #458
**Date**: 2026-10-18
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/145-add-lifecycle-status-command-for-active-sdlc-work/

## Reproduction

1. With GitHub CLI 2.97.0, check out an issue branch `N-slug` whose pushed head has an open draft pull request.
2. Run `gh pr view --json number,reviewThreads` on that branch. It prints `Unknown JSON field: "reviewThreads"` followed by the available fields and exits 1.
3. Run `node scripts/sdlc-status.mjs --project . --json` against that project.
4. Run the `/sdlc-execute` controller for that issue while its verification report is a current Pass with readiness `pr_evidence_satisfied` and its draft pull request is at the current head.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Status JSON includes the branch's pull request: number, state `OPEN`, `isDraft: true`, head SHA, base branch, merge state, and closing issue numbers, and `missingArtifacts` does not list `pull request`. `/sdlc-execute` observes the draft pull request at the current head, treats `pr_evidence_satisfied` verification as green, and advances to deliver. A pull-request query that fails for any reason other than the branch having no pull request is named in `gaps`. |
| **Actual** | Status JSON reports `"pullRequest": null`, `missingArtifacts` includes `pull request`, and `gaps` is empty. `/sdlc-execute` keeps reporting `pr_evidence_pending` for verify and cannot advance to deliver. |

## Acceptance Criteria

### AC1: Status reports the branch's open draft pull request

**Given** an issue branch whose open draft pull request is returned by `gh pr view`, and a `gh` CLI that rejects any `pr view --json` field outside its supported set, as gh 2.97.0 rejects `reviewThreads`
**When** status evidence is collected for that branch with `/sdlc-status --json`
**Then** `pullRequest` reports the pull request number, state `OPEN`, `isDraft: true`, `headRefOid`, `baseRefName`, `mergeStateStatus`, and closing issue numbers, and `missingArtifacts` does not contain `pull request`

### AC2: Execute verify observes the draft pull request

**Given** an issue branch at head H whose verification report is a current Pass with readiness `pr_evidence_satisfied` and whose open draft pull request has head H, with a `gh` CLI that rejects unsupported `pr view --json` fields
**When** the `/sdlc-execute` controller evaluates the verify result for that issue
**Then** it treats verification as green and advances to deliver instead of reporting `pr_evidence_pending`

### AC3: A failed pull-request query is reported as a gap

**Given** `gh pr view` exits non-zero with an error other than `no pull requests found for branch`, or returns output that is not valid JSON
**When** status evidence is collected
**Then** `pullRequest` is `null`, and `gaps` contains one bounded entry that includes the error message: `pull request fetch failed: ` for a command failure, or `pull request parse failed: ` for invalid JSON

### AC4: A branch without a pull request is unchanged

**Given** an issue branch for which `gh pr view` exits non-zero with `no pull requests found for branch "<branch>"`, and whose verification report is a current Pass
**When** status evidence is collected
**Then** `pullRequest` is `null`, `gaps` contains no pull-request entry, and status still reports stage `verified` with next action `/sdlc-open-pr #N`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | The status pull-request query requests only `gh pr view --json` fields that the GitHub CLI supports and status consumes: `number,state,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,closingIssuesReferences`. It no longer requests `reviewThreads`. | Must |
| FR2 | When `gh pr view` exits non-zero with an error that is not the no-pull-request-for-branch outcome, status adds one bounded `pull request fetch failed: <message>` entry to `gaps`. Output that cannot be parsed as JSON adds `pull request parse failed: <message>`. | Must |
| FR3 | When `gh pr view` fails with `no pull requests found for branch`, status leaves `pullRequest` `null` and adds no gap. | Must |
| FR4 | The status and execute tests stub `gh pr view` so that a requested field outside gh 2.97.0's supported `pr view --json` field set fails with `Unknown JSON field`, as the real CLI does. | Must |

## Out of Scope

- Reporting pull-request review-thread state in `/sdlc-status`; `scripts/sdlc-deliver.mjs` already reads review threads through GraphQL.
- Changing the field lists of the other `gh pr view` callers in `scripts/` (`publish-approved-spec.mjs`, `sdlc-deliver.mjs`, `sdlc-execute.mjs`, `start-issue.mjs`); gh 2.97.0 supports every field they request.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #458 | 2026-10-18 | Initial defect report |
