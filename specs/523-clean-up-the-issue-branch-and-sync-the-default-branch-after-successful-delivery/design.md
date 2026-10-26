# Design: Clean up the issue branch and sync the default branch after successful delivery

**Issue**: #523
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/441-continue-an-explicit-execute-queue-after-the-previous-issue-is-delivered/

## Overview

Add a post-delivery cleanup step to the execute controller in `scripts/sdlc-execute.mjs`. It runs only on the on-branch terminal path, immediately after `completed(cwd, run, issue, current.branch, current.head)` returns true and `#N: MERGED and CLOSED` is pushed to the output. Delivery proof is therefore established before any destructive git operation, and the deliver worker is unchanged.

## Architecture

In the per-issue loop of `runExecute` (the `if (branchIssue && completed(...))` block), after `output.push(`#${issue}: MERGED and CLOSED`)`, call a new helper and push its returned lines before `break`:

`cleanupDeliveredBranch(cwd, run, issue, current) → string[]`

Steps, in order; each local failure returns `[`#${issue}: branch cleanup skipped: ${reasonCode}`]` immediately with no later step run:

1. Worktree status via `git status --porcelain=v1 --untracked-files=all`; any entry outside `.nmg-sdlc/` (or an unreadable status) → `worktree_dirty`. Extract the dirty predicate shared with `leaveDeliveredBranch()` and the start path into one helper (e.g. `dirtyOutsideRuntime(cwd, run)`) rather than duplicating it.
2. Re-read `git rev-parse HEAD` and `git branch --show-current`; if the head differs from the proven `current.head` or the branch differs from `current.branch` → `local_head_mismatch`.
3. Remote: `remoteHead(cwd, run, branch)` (a thrown `upstream_unavailable` becomes warning `remote_head_unreadable`). `null` → nothing to delete, no warning. Equal to `current.head` → `git push origin --delete <branch>`; failure → warning `remote_delete_failed`. Any other SHA → warning `remote_head_mismatch`. Remote warnings are emitted as `#N: remote branch cleanup skipped: <reasonCode>` and local cleanup continues.
4. Default branch via the same `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name` lookup used by `leaveDeliveredBranch()` (extract a shared `defaultBranchName(cwd, run)` helper); empty or failed → `default_branch_unreadable`.
5. `git switch <default>`; failure → `default_checkout_failed`.
6. `git pull --ff-only origin <default>`; failure → `pull_not_fast_forward`.
7. Re-check `git rev-parse refs/heads/<branch>` equals `current.head`, then `git branch -D <branch>`; mismatch or failure → `local_branch_delete_failed`.
8. Success → `#N: branch cleanup: deleted <branch> and fast-forwarded <default>`.

The helper catches every error it raises internally so no cleanup outcome changes the controller's status or the `#N: MERGED and CLOSED` line. After `break`, the next queued issue's loop reads `checkout()` and finds the default (non-issue) branch, so it proceeds through the existing start path from the synced default branch. Bare re-entry on an already-delivered issue branch reaches the same block on its first iteration, so it is cleaned up identically.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `sdlc-execute.mjs run`/`supervise` stdout | on-branch terminal delivery | `#N: MERGED and CLOSED` then `#N: branch cleanup: deleted B and fast-forwarded <default>` | AC1, AC2 |
| same | unsafe local precondition or failed local step | `#N: branch cleanup skipped: <worktree_dirty\|local_head_mismatch\|default_branch_unreadable\|default_checkout_failed\|pull_not_fast_forward\|local_branch_delete_failed>` | AC3; exit status unchanged |
| same | remote head moved, unreadable, or deletion failed | `#N: remote branch cleanup skipped: <remote_head_mismatch\|remote_head_unreadable\|remote_delete_failed>`, then local cleanup result | AC4 |

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Cleanup in the execute controller after `completed()` | Selected | Delivery proof precedes destructive git operations; covers both fresh delivery and bare re-entry |
| Add `--delete-branch` to the deliver worker's `gh pr merge` | Rejected | Runs inside the worker before controller proof and bypasses the remote-head guard |
| Extend `leaveDeliveredBranch()` | Rejected | It runs only when a different issue needs the checkout and must keep throwing on conflicts |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #523 | 2026-10-25 | Initial feature design |
