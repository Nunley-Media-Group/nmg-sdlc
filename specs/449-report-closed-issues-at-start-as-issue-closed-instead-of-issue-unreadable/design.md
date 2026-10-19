# Root Cause Analysis: Report closed issues at START as issue_closed instead of issue_unreadable

**Issue**: #449
**Date**: 2026-10-18
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

## Root Cause

In `scripts/start-issue.mjs` `startIssue`, the issue read `parseJson(run('gh', ['issue', 'view', N, '--json', 'number,title,body,labels,state']))` is checked by a single condition: `issueData?.number !== issueNumber || String(issueData?.state).toUpperCase() !== 'OPEN'`. `parseJson` returns `null` for a non-zero exit or unparseable stdout, so failed, malformed, and number-mismatched reads all satisfy the first operand, while a successful read of a CLOSED issue satisfies the second. Both branches call `fail('GitHub issue #N is unreadable', 'issue_unreadable')`, so a CLOSED issue is reported as a GitHub read failure.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/start-issue.mjs` | `startIssue`, issue-read guard immediately after the `gh issue view` call | Maps a successful CLOSED read to `issue_unreadable` |

## Fix Strategy

Replace the single guard with a validity check followed by a state check, both before `createIssueDependencyClient`:

```js
const issueState = typeof issueData?.state === 'string' ? issueData.state.toUpperCase() : null;
if (issueData?.number !== issueNumber || (issueState !== 'OPEN' && issueState !== 'CLOSED')) {
  return fail(`GitHub issue #${issueNumber} is unreadable`, 'issue_unreadable');
}
if (issueState === 'CLOSED') {
  return fail(`GitHub issue #${issueNumber} is CLOSED`, 'issue_closed');
}
```

`fail` → `handoffFor(issueNumber, 'failed', summary, reasonCode)` already supplies `schemaVersion: 1`, `step: "start"`, `status: "failed"`, `intervention: true`, `artifacts: []`, and `next: null`, and the CLI already exits 1 for a failed handoff. An OPEN issue falls through to the unchanged dependency, untrack, branch, and handoff code.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/start-issue.mjs` | Split the issue-read guard into `issue_unreadable` and `issue_closed` branches | AC1, AC2, AC3, FR1, FR2 |
| `scripts/__tests__/start-issue-controller.test.mjs` | Closed-issue test and parameterized unreadable-read tests asserting the issue view is the only command run | AC1, AC2 |

## Blast Radius

Only the START issue-read guard changes. `scripts/sdlc-execute.mjs` validates START handoffs for shape (`reasonCode` is a string or null) and stops on any failed handoff without matching START's `issue_unreadable`, so the new `issue_closed` code needs no consumer change. Failed, unparseable, and mismatched reads produce the same handoff as before. A non-string `state` or a value other than `OPEN`/`CLOSED` remains `issue_unreadable`.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Split the existing guard on the already-read `state` | Selected | Uses the response START already reads; adds no GitHub call |
| Report `issue_closed` for every non-`OPEN` state | Rejected | Would describe a missing or unknown state value as `CLOSED` |
| Add a separate `gh issue view --json state` read | Rejected | Duplicates a field already present in the existing read |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #449 | 2026-10-18 | Initial defect design |
