# Tasks: Recognize already-delivered issues before dispatching START from a non-issue branch

**Issue**: #447
**Date**: 2026-09-30
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/441-continue-an-explicit-execute-queue-after-the-previous-issue-is-delivered/

## Implementation Tasks

### T001: Correct the Root Cause

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `closedIssueDelivery(cwd, run, issue)` exists after `completed()` and implements the eight-step algorithm in `design.md`, reusing `succeeded`, `parsed`, `SHA`, and `parseIssueBranch`
- It is the first statement of the `if (!branchIssue && !failure)` block in `runExecute`; `'delivered'` pushes `#N: MERGED and CLOSED` and breaks out of that issue's loop (AC1, FR1, FR2)
- CLOSED without proof throws `issue_closed_undelivered: #N`; two or more MERGED same-repository closing pull requests throw `merged_pr_ambiguous: #N`; a failed or malformed issue, repository, or pull-request read throws `delivery_evidence_unavailable: #N`; each yields exit 1 with that stderr and no worker (AC2, AC3, FR3)
- OPEN issues continue to the unchanged label, dependency, and Approved-spec admission; the on-branch `completed()` path is unchanged (AC4)

### T002: Add Behavioral Regression Coverage

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- A test-file helper wraps `f.run`, answering `gh issue view <N> --json number,state,closedByPullRequestsReferences` and `gh pr view <M>` from per-test maps (unmapped issue reads return exit 1; other commands delegate to `f.run`)
- AC1: from `fixture({ branch: 'main' })`, `#42 #43` where both issues are CLOSED with one same-repository MERGED closing pull request on `42-example` / `43-next` (plus an unreadable cross-repository reference on #42) returns `{ status: 0, stdout: '#42: MERGED and CLOSED\n#43: MERGED and CLOSED\n', stderr: '' }`, `state.starts` is `[]`, and the branch stays `main`
- AC2: CLOSED #42 with no references, and CLOSED #42 whose only reference is an OPEN pull request, each return `{ status: 1, stdout: '', stderr: 'issue_closed_undelivered: #42\n' }` with no starts
- AC3: two MERGED closing pull requests return stderr `merged_pr_ambiguous: #42\n`; a failed issue read, an issue read missing `closedByPullRequestsReferences`, a failed pull-request read, and a MERGED pull request missing `mergedAt` each return stderr `delivery_evidence_unavailable: #42\n`; all exit 1 with no starts
- AC4: an OPEN #42 on `main` with `f.state.labels = []` returns `{ status: 1, stdout: '', stderr: '#42 has no spec-created label\n' }` with no starts; the existing tests "starts an explicit issue from a non-issue branch, then uses its new live branch" and "recognizes an exact-head merged PR and closed issue without a label or new worker" still pass
- `cd scripts && npm test -- sdlc-execute.test.mjs` exits 0; the AC1–AC3 tests fail against the pre-fix controller

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #447 | 2026-09-30 | Initial defect tasks |
