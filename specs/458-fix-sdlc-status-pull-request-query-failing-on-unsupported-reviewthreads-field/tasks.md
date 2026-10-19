# Tasks: Fix sdlc-status pull-request query failing on unsupported reviewThreads field

**Issue**: #458
**Date**: 2026-10-18
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/145-add-lifecycle-status-command-for-active-sdlc-work/

## Implementation Tasks

### T001: Correct the Root Cause

**File(s)**: `scripts/sdlc-status.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `collectGithub` runs `gh pr view --json number,state,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,closingIssuesReferences`; `reviewThreads` is no longer requested (FR1)
- A non-zero `gh pr view` result whose `commandFailure` text does not match `NO_BRANCH_PULL_REQUEST` (`/^no pull requests found for branch /m`) leaves `pullRequest` `null` and adds exactly one `pull request fetch failed: <boundedMessage(commandFailure(prRes))>` gap (AC3, FR2)
- Output that `JSON.parse` rejects leaves `pullRequest` `null` and adds exactly one `pull request parse failed: <boundedMessage(error.message)>` gap (AC3, FR2)
- A non-zero result matching `NO_BRANCH_PULL_REQUEST` leaves `pullRequest` `null` and adds no gap (AC4, FR3)
- A successful response for the current branch maps into `pullRequest` exactly as before: `number`, `state`, `isDraft`, `headRefOid`, `baseRefName`, `mergeStateStatus`, `checks: 'unknown'`, and `closing` (AC1, AC2)

### T002: Reject Unsupported Fields in the Execute Fixture and Prove Verify Turns Green

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `GH_PR_VIEW_JSON_FIELDS` and `ghPrViewUnknownField(args)` are defined at module level exactly as in `design.md` (FR4)
- In `fixture()`'s `run`, the `pr view` branch first returns `{ status: 1, stdout: '', stderr: <ghPrViewUnknownField message> }` for any unsupported requested field, and its no-pull-request response is `{ status: 1, stdout: '', stderr: 'no pull requests found for branch "42-example"\n' }`; the draft and merged responses are unchanged (FR4)
- AC2: the existing test `routes PR Evidence Pending through draft evidence and back to verification, never early merge` passes with the strict stub: `f.execute('#42')` matches `{ status: 0 }` and the worker starts are `['verify', 'verify', 'verify', 'deliver']`; it fails against the pre-T001 `scripts/sdlc-status.mjs`, whose query the stub rejects with `Unknown JSON field: "reviewThreads"`
- Every other test in the file passes unchanged
- `cd scripts && npm test -- sdlc-execute.test.mjs` exits 0

### T003: Add Status Regression Coverage for Draft, Failed, and Missing Pull Requests

**File(s)**: `scripts/__tests__/sdlc-status.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `GH_PR_VIEW_JSON_FIELDS` and `ghPrViewUnknownField(args)` are defined at module level exactly as in `design.md`; `inspectIssueSpecScope` is imported from `../issue-spec-scope.mjs`; `statusFixture(prView)` and `statusJson(fixture)` behave as described in `design.md` inside a new `describe('sdlc-status branch pull-request evidence')` (FR4)
- AC1: test `reports the open draft pull request when gh rejects unsupported pr view fields` uses a `prView` that builds `{ number: 9, state: 'OPEN', isDraft: true, headRefName: '42-example', headRefOid: head, baseRefName: 'main', mergeStateStatus: 'CLEAN', closingIssuesReferences: [{ number: 42 }] }` and returns only the keys named in the requested `--json` list; the status JSON `pullRequest` equals `{ number: 9, state: 'OPEN', isDraft: true, headRefOid: head, baseRefName: 'main', mergeStateStatus: 'CLEAN', checks: 'unknown', closing: [42] }`, `missingArtifacts` does not contain `pull request`, and no `gaps` entry starts with `pull request `
- AC3: `it.each` test `reports a pull-request %s as one bounded gap` covers three `prView` results, each asserting `pullRequest` is `null` and that the `gaps` entries starting with `pull request ` equal exactly `[expected]`:
  - `fetch failure`: `{ ok: false, status: 1, stdout: '', stderr: 'HTTP 502: Bad Gateway (https://api.github.com/graphql)\n' }` → `'pull request fetch failed: HTTP 502: Bad Gateway (https://api.github.com/graphql)'`
  - `long fetch failure`: stderr `` `GraphQL: ${'x'.repeat(400)}` `` → `` `pull request fetch failed: ${`GraphQL: ${'x'.repeat(400)}`.slice(0, 237)}...` ``
  - `parse failure`: `{ ok: true, status: 0, stdout: '{not json', stderr: '' }` → `expect.stringMatching(/^pull request parse failed: \S.{0,239}$/)`
- AC4: test `keeps a branch without a pull request gap-free and verified` uses `prView` returning `{ ok: false, status: 1, stdout: '', stderr: 'no pull requests found for branch "42-example"\n' }`; the status JSON has `pullRequest: null`, no `gaps` entry starting with `pull request `, `verification` matching `{ status: 'pass', current: true }`, `stage: 'verified'`, and `nextAction.command: '/sdlc-open-pr #42'`
- The AC1 and AC3 tests fail against the pre-T001 `scripts/sdlc-status.mjs`; the AC4 test passes before and after T001
- `cd scripts && npm test -- sdlc-status.test.mjs` exits 0

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #458 | 2026-10-18 | Initial defect tasks |
