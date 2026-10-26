# Tasks: Clean up the issue branch and sync the default branch after successful delivery

**Issue**: #523
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/441-continue-an-explicit-execute-queue-after-the-previous-issue-is-delivered/

## Implementation Tasks

### T001: Add post-delivery branch cleanup to the execute controller

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- A `cleanupDeliveredBranch(cwd, run, issue, current)` helper implements the ordered steps in design.md and returns its output lines; it is called only in the on-branch `completed()` terminal block, after `#N: MERGED and CLOSED` is pushed and before `break`
- The dirty-outside-`.nmg-sdlc/` predicate and the default-branch lookup are shared helpers used by both `leaveDeliveredBranch()` and the cleanup helper
- Remote deletion runs only when `remoteHead()` equals the proven head; absent remote is silent; moved, unreadable, or failed deletion emits `#N: remote branch cleanup skipped: <reasonCode>` and local cleanup continues (FR1, AC2, AC4)
- `git switch <default>`, `git pull --ff-only origin <default>`, and `git branch -D <branch>` run in that order; local branch deletion requires the branch ref to equal the proven head (FR2, FR3)
- Every refused or failed local step emits `#N: branch cleanup skipped: <reasonCode>` with its distinct code and runs no later step (FR4, AC3)
- Cleanup never throws out of the helper and never changes exit status (FR5)

### T002: Cover cleanup behavior with controller tests

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC1: with `42-example` pushed to the fixture's bare `origin` at the delivered head, a delivered run outputs `#42: MERGED and CLOSED` then `#42: branch cleanup: deleted 42-example and fast-forwarded main`, exits 0, the checkout is `main` at `origin/main`, and neither the local nor the remote `42-example` branch exists
- AC2: with no remote `42-example`, the same success line appears with no remote warning and the local branch is deleted
- AC3: separate cases for a dirty tracked file outside `.nmg-sdlc/` (`worktree_dirty`), a failing `git switch` injected through `run` (`default_checkout_failed`), and a diverged local `main` (`pull_not_fast_forward`) each output `#42: branch cleanup skipped: <code>`, exit 0, and preserve the local branch and uncommitted changes; a `local_head_mismatch` case injects a differing `rev-parse HEAD` at cleanup time
- AC4: with remote `42-example` advanced to a different commit, the output contains `#42: remote branch cleanup skipped: remote_head_mismatch`, the remote branch still exists, and local cleanup completes
- AC5: an `#42 #43` queue shows #42's cleanup line before #43 starts and #43 starts from `main`; bare re-entry on an already-delivered `42-example` cleans up as in AC1
- Existing assertions on exact stdout for on-branch delivery are updated to include the cleanup line; `cd scripts && npm test` exits 0

### T003: Document post-delivery cleanup

**File(s)**: `README.md`, `workflows/execute/WORKFLOW.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `README.md` "Execute the approved work" describes the post-delivery cleanup sequence, the remote-head guard, that cleanup never changes the delivery result or exit status, and lists every `branch cleanup skipped` and `remote branch cleanup skipped` reason code (FR6)
- `workflows/execute/WORKFLOW.md` states that a finished controller may print the cleanup or warning lines after `#N: MERGED and CLOSED` and that a cleanup warning is not a delivery failure (FR6)

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #523 | 2026-10-25 | Initial feature tasks |
