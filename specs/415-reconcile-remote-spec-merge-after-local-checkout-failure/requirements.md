# Defect Report: Reconcile remote spec merge after local checkout failure

**Issue**: #415
**Date**: 2026-09-23
**Status**: Approved
**Author**: NMG

---

## Reproduction

An exact-head approved spec PR is squash-merged remotely, but `gh pr merge --delete-branch` exits nonzero because its local checkout of the default branch conflicts with another worktree. `publish-approved-spec.mjs merge` currently reports `pr_merge_failed` without the PR or `merged: true`, despite the irreversible remote merge. Retrying can create another PR or replay a merge, and the issue is left without `spec-created`.

## Expected vs Actual

| | Behavior |
|---|---|
| **Expected** | Independently prove the same PR is MERGED at the expected head and base; report publication, resume safe bookkeeping, and preserve the worktrees. |
| **Actual** | A local CLI failure is classified as a pre-merge failure without remote inspection. |

## Acceptance Criteria

### AC1: Classify a remote merge independently

**Given** the exact-head spec-only PR passed publication readiness and the merge CLI exits nonzero after a remote merge
**When** the helper reads that PR again
**Then** it reports `merged: true` and its numeric PR only if the PR is `MERGED` at the expected head, head branch, and base branch
**And** it retains the original CLI failure evidence without another merge attempt.

### AC2: Fail closed on unproven publication

**Given** the merge CLI exits nonzero and the same PR remains open, cannot be read, or has contradictory head, head branch, or base branch
**When** the helper classifies the failure
**Then** it returns a pre-merge failure without `merged: true`, label mutation, or assumed publication.

### AC3: Worktree-safe bookkeeping

**Given** an independently proven remote merge and a default branch checked out in a different local worktree
**When** post-merge checkout fails
**Then** the helper reports `default_checkout_failed` with `merged: true` and the PR, preserves both worktrees, and completes safe independent bookkeeping where possible
**And** it does not force checkout, reset, remove a worktree, or replay the merge.

### AC4: Idempotent re-entry

**Given** the same spec PR is already independently proven merged
**When** the merge helper is invoked again from the spec branch
**Then** it returns the same publication classification, performs only outstanding safe bookkeeping, and neither creates another PR nor invokes merge again.

## Out of Scope

Changing the exact-head readiness policy, branch-protection checks, approval rules, or issue closure behavior.
