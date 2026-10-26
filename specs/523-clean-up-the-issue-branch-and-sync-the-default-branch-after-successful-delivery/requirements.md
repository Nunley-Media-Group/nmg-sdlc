# Requirements: Clean up the issue branch and sync the default branch after successful delivery

**Issue**: #523
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/441-continue-an-explicit-execute-queue-after-the-previous-issue-is-delivered/

## User Story

**As a** developer running `/sdlc-execute`
**I want** the delivered issue's branch to be removed and the default branch checked out and fast-forwarded once delivery is proven
**So that** my checkout is ready for the next piece of work without manual git housekeeping

## Background

When the execute controller proves an issue delivered on its checked-out issue branch (exact-head merged pull request plus issue `CLOSED`), it records `#N: MERGED and CLOSED` and leaves the checkout on the merged issue branch. The local issue branch, the remote issue branch, and a stale local default branch remain. `leaveDeliveredBranch()` only switches to the default branch when a different queued issue needs the checkout, and neither pulls nor deletes branches. The deliver stage merges with `gh pr merge --squash --match-head-commit <head>` without deleting the remote branch.

## Acceptance Criteria

### AC1: Delivered branch is cleaned up and the default branch is synced

**Given** the controller has proven issue #N delivered on local issue branch `B` at head `H` (merged PR head equals `H`, issue `CLOSED`), the worktree is clean outside `.nmg-sdlc/`, and remote branch `B` points at `H`
**When** the controller records the terminal delivery for #N
**Then** remote branch `B` is deleted, the default branch is checked out and fast-forwarded to `origin/<default>`, local branch `B` is deleted, the output contains `#N: MERGED and CLOSED` followed by `#N: branch cleanup: deleted B and fast-forwarded <default>`, and the controller exits 0

### AC2: Remote branch already absent

**Given** the AC1 preconditions except that remote branch `B` no longer exists
**When** the controller records the terminal delivery for #N
**Then** remote deletion is skipped without a warning, and the checkout, fast-forward pull, local branch deletion, and `#N: branch cleanup: deleted B and fast-forwarded <default>` line complete as in AC1

### AC3: Unsafe cleanup is skipped with a warning, not a failure

**Given** issue #N is proven delivered, but one of these holds: the worktree has changes outside `.nmg-sdlc/`, the local head differs from the merged PR head, the default-branch checkout fails, or the pull is not a fast-forward
**When** the controller records the terminal delivery for #N
**Then** the output still contains `#N: MERGED and CLOSED`, a warning line `#N: branch cleanup skipped: <reasonCode>` names the specific condition (`worktree_dirty`, `local_head_mismatch`, `default_checkout_failed`, or `pull_not_fast_forward`), no cleanup step runs after the failed check (the local branch and any uncommitted changes are preserved), and the controller exits 0

### AC4: Remote branch moved after merge

**Given** issue #N is proven delivered at `H` but remote branch `B` points at a commit other than `H`
**When** the controller records the terminal delivery for #N
**Then** remote branch `B` is not deleted, the output contains `#N: remote branch cleanup skipped: remote_head_mismatch`, and local cleanup (checkout, fast-forward pull, local branch deletion) still proceeds and reports `#N: branch cleanup: deleted B and fast-forwarded <default>`

### AC5: Cleanup runs per issue in a queue and on re-entry

**Given** `/sdlc-execute #A #B` delivers #A on its issue branch, or a bare `/sdlc-execute` starts on an issue branch whose issue is already proven delivered
**When** the controller records that issue's terminal delivery
**Then** cleanup for that issue runs before the next queued issue starts, and the next issue starts from the synced default branch

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | After on-branch terminal delivery proof, delete the remote issue branch only when its head equals the merged PR head; treat an absent remote branch as already cleaned; on a moved or unreadable remote head, or a failed deletion, warn with `#N: remote branch cleanup skipped: <reasonCode>` (`remote_head_mismatch`, `remote_head_unreadable`, `remote_delete_failed`) and continue local cleanup | Must |
| FR2 | Switch to the repository default branch and run `git pull --ff-only origin <default>` | Must |
| FR3 | Delete the local issue branch with `git branch -D` only after the checkout leaves it and only when its head equals the proven merged head | Must |
| FR4 | Refuse cleanup when the worktree is dirty outside `.nmg-sdlc/`; on any refused or failed local step, stop the remaining steps, preserve state, and emit `#N: branch cleanup skipped: <reasonCode>` with a distinct reason code per condition (`worktree_dirty`, `local_head_mismatch`, `default_branch_unreadable`, `default_checkout_failed`, `pull_not_fast_forward`, `local_branch_delete_failed`) | Must |
| FR5 | Cleanup outcomes never change the delivery result or exit status: terminal delivery remains `#N: MERGED and CLOSED` with exit 0 | Must |
| FR6 | Document the post-delivery cleanup behavior and its warning reason codes in `README.md` and `workflows/execute/WORKFLOW.md` | Must |

## Out of Scope

- Cleaning up branches of issues delivered in earlier runs that are not currently checked out, including the off-branch `closedIssueDelivery()` recognition path
- Changing spec-publication cleanup in `scripts/publish-approved-spec.mjs`
- Changing the repository `deleteBranchOnMerge` setting or adding `--delete-branch` to the deliver merge
- Removing `.nmg-sdlc/` runtime state

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #523 | 2026-10-25 | Initial feature spec |
