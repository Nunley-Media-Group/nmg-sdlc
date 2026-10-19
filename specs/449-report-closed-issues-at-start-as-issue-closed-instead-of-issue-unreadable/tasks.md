# Tasks: Report closed issues at START as issue_closed instead of issue_unreadable

**Issue**: #449
**Date**: 2026-10-18
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

## Implementation Tasks

### T001: Correct the Root Cause

**File(s)**: `scripts/start-issue.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- In `startIssue`, the guard after the `gh issue view <N> --json number,title,body,labels,state` read is replaced by the two-step check in `design.md`: `issueState` is the upper-cased `state` when it is a string, otherwise `null`
- A mismatched `number`, or an `issueState` other than `OPEN` or `CLOSED`, calls `fail('GitHub issue #N is unreadable', 'issue_unreadable')` (AC2, FR1)
- `issueState === 'CLOSED'` calls `fail('GitHub issue #N is CLOSED', 'issue_closed')` (AC1, FR1)
- Both checks return before `createIssueDependencyClient`, `untrackOmpSdlcRuntime`, and every git command (FR2); `OPEN` continues to the unchanged dependency, untrack, branch, and handoff code (AC3)

### T002: Add Behavioral Regression Coverage

**File(s)**: `scripts/__tests__/start-issue-controller.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC1: a new test runs `startIssue({ issue: 42, cwd: f.cwd, run: f.run })` on `fixture({ issue: { number: 42, title: 'Ship It!', body: '', labels: [], state: 'CLOSED' } })`; `handoff(f.cwd)` equals `{ schemaVersion: 1, issue: 42, step: 'start', status: 'failed', intervention: true, summary: 'GitHub issue #42 is CLOSED', artifacts: [], next: null, reasonCode: 'issue_closed' }`, and `f.calls` equals `[['gh', 'issue', 'view', '42', '--json', 'number,title,body,labels,state']]`
- AC2: the existing `writes issue_unreadable` test becomes an `it.each` over four reads: `fixture({ issueStatus: 1 })`; `fixture({ issue: { number: 41, title: 'Ship It!', body: '', labels: [], state: 'OPEN' } })`; `fixture({ issue: { number: 42, title: 'Ship It!', body: '', labels: [] } })`; and a test-local `run` wrapper over `fixture()` that, for `gh issue view`, pushes `[command, ...args]` onto `f.calls` and returns `{ status: 0, stdout: '{', stderr: '' }` (all other commands delegate to `f.run`). Each case asserts `reasonCode: 'issue_unreadable'`, `summary: 'GitHub issue #42 is unreadable'`, `intervention: true`, `next: null`, and `f.calls` equal to the single issue-view call above
- AC3: the existing OPEN-path tests `writes dependency_blocked without developing a branch`, `develops the issue branch from a clean detached HEAD`, `passes with spike labels and ignores project status failure`, and `includes branch and head on passed handoff for fresh develop case` pass unchanged
- `cd scripts && npm test -- start-issue-controller.test.mjs` exits 0; the AC1 test fails against the pre-fix controller (it receives `issue_unreadable`)

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #449 | 2026-10-18 | Initial defect tasks |
