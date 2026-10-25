# Tasks: /sdlc-execute routes an empty issue branch to verify when the local default branch is stale

**Issue**: #502
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/470-fix-sdlc-execute-closing-worker-panes-while-their-background-work-runs/

## Implementation Tasks

### T001: Count branch commits against the fetched remote default ref

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `branchCommits` fetches `refs/heads/<defaultBranch>` into `refs/remotes/origin/<defaultBranch>` and counts `refs/remotes/origin/<defaultBranch>..HEAD` (FR1)
- A branch with zero commits relative to the fetched remote ref and no implement pass at its head routes to `implement` with no `prepare-version` call before that worker starts (AC1, FR2)
- A clean, published branch with commits ahead of the remote ref still routes to `verify` with version preparation first (AC2)
- A missing default branch name, failed fetch, or unreadable count throws `default_branch_unreadable`; the controller exits non-zero, starts no worker and invokes no `prepare-version` (AC3, FR3)

### T002: Add stale-local-default regression coverage

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- Empty-branch test: a fixture starts on `main`, a commit is pushed to `origin/main` while local `main` stays behind, and the start worker creates `42-example` from `origin/main`. The test asserts that the dispatched steps begin `start`, `implement` and that no `state.versionPreparations` entry exists before the implement worker starts (AC1)
- Real-commits test: a fixture with a published implementation commit and a local `main` behind `origin/main` routes to `verify` first, with a version preparation before it (AC2)
- Fetch-failure test: a wrapping `run` fails the default-branch `git fetch` on an issue branch. The test asserts status 1, `default_branch_unreadable` on stderr, `state.starts` empty and `state.versionPreparations` empty (AC3)
- The empty-branch and fetch-failure tests fail against the pre-fix `branchCommits` and pass with T001 (AC4)
- `cd scripts && npm test` exits 0

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #502 | 2026-10-25 | Initial defect tasks |
