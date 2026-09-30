# Root Cause Analysis: Recognize already-delivered issues before dispatching START from a non-issue branch

**Issue**: #447
**Date**: 2026-09-30
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/441-continue-an-explicit-execute-queue-after-the-previous-issue-is-delivered/

## Root Cause

In `scripts/sdlc-execute.mjs` `runExecute`, the per-issue loop proves delivered state with `completed(cwd, run, issue, branch, head)` only when `parseIssueBranch(current.branch)` returns an issue branch. `completed()` lists pull requests by `--head <branch>` and compares the local head, so it cannot run without the issue branch checked out. On a non-issue branch the loop enters the admission block (`gh issue view N --json number,labels`, spec-created label, blocked-by graph, `specStatus`) and then sets `step = 'start'`. Nothing reads the issue's live state or closing pull requests before dispatch, so an already-delivered issue is sent to START, which fails and aborts the rest of the queue.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/sdlc-execute.mjs` | `runExecute` per-issue loop, `if (!branchIssue && !failure)` admission block | Dispatches START without checking live issue state |
| `scripts/sdlc-execute.mjs` | `completed()` | Branch-bound delivery proof; unusable off-branch |

## Fix Strategy

Add a module-private function `closedIssueDelivery(cwd, run, issue)` in `scripts/sdlc-execute.mjs`, placed directly after `completed()`. It returns `'open'` or `'delivered'`, or throws an `Error` whose message is `<reasonCode>: #<issue>`:

1. Run `gh issue view <issue> --json number,state,closedByPullRequestsReferences`. A non-success result, or a parsed value whose `number !== issue` or whose `state` is not `OPEN` or `CLOSED`, throws `delivery_evidence_unavailable: #<issue>`.
2. `OPEN` returns `'open'` without further reads.
3. For `CLOSED`, `closedByPullRequestsReferences` must be an array whose every element has a positive safe-integer `number` and string `repository.owner.login` and `repository.name`; otherwise throw `delivery_evidence_unavailable`.
4. Read `gh repo view --json nameWithOwner`; a failed read or a value not matching `^[^/]+/[^/]+$` throws `delivery_evidence_unavailable`. Keep only references whose `${owner.login}/${name}` equals `nameWithOwner` case-insensitively, de-duplicated by `number`. Cross-repository references are ignored and never read.
5. For each kept reference run `gh pr view <number> --json number,state,headRefName,mergedAt,mergeCommit,closingIssuesReferences`. A failed read, or a parsed value whose `number` differs from the reference or whose `state` is not a string, throws `delivery_evidence_unavailable`.
6. Let `merged` be the viewed pull requests with `state === 'MERGED'`. Zero → throw `issue_closed_undelivered: #<issue>`. More than one → throw `merged_pr_ambiguous: #<issue>`.
7. For the single merged pull request: a non-string `mergedAt`, a `mergeCommit.oid` not matching `SHA`, or a non-array `closingIssuesReferences` throws `delivery_evidence_unavailable`. If `closingIssuesReferences` has no entry with `number === issue`, or `parseIssueBranch(headRefName)?.issueNumber !== issue`, throw `issue_closed_undelivered: #<issue>`.
8. Otherwise return `'delivered'`.

In `runExecute`, make `closedIssueDelivery` the first statement inside `if (!branchIssue && !failure) { … }`, before the existing `gh issue view N --json number,labels` read:

    if (closedIssueDelivery(cwd, run, issue) === 'delivered') {
      output.push(`#${issue}: MERGED and CLOSED`);
      break;
    }

`break` leaves the `for (;;)` loop for this issue, so the outer queue continues with the next issue. Thrown errors reach the existing `catch` → `fail()`, producing exit 1 with stderr `<reasonCode>: #<issue>\n`, no pane, and no git or GitHub mutation. Reuse `succeeded`, `parsed`, `SHA`, and `parseIssueBranch`; no equivalent helper exists for issue-side closing-PR proof.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/sdlc-execute.mjs` | Add `closedIssueDelivery()` and call it first in the off-branch admission block | AC1, AC2, AC3, FR1–FR3 |
| `scripts/__tests__/sdlc-execute.test.mjs` | Off-branch delivered, undelivered, ambiguous, unreadable, and open-admission regression tests | AC1–AC4 |

## Blast Radius

Only the non-issue-branch path of `runExecute` changes. The on-branch path, `completed()`, `leaveDeliveredBranch()`, START, and deliver are untouched. An OPEN issue costs one additional `gh issue view` read and then follows the existing admission order. A failed issue read on a non-issue branch now stops with `delivery_evidence_unavailable: #N` before the admission read.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Issue-side proof via `closedByPullRequestsReferences` plus `gh pr view` | Selected | Works without a local issue branch; matches the fields the issue names |
| Reuse `completed()` by guessing the issue branch name | Rejected | Branch names are not derivable from the issue number alone and `completed()` also requires the local head |
| Merge the state read into the existing `number,labels` read | Rejected | Would change the admission read and its failure message for OPEN issues |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #447 | 2026-09-30 | Initial defect design |
