# Defect Report: Recover approved-spec start and implementation

**Issue**: #418
**Date**: 2026-09-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/396-investigate-exclusive-implement-failures-instead-of-retrying/

## Reproduction

PennyScan #217 approved spec-only PR #228 was squash-merged into default at a45a1a3 while its old issue branch remained at 060af76. Run 7be03667 began on default a45a1a3. Another worktree owned that issue branch, yielding `branch_checkout_failed`. After its release, managed start passed but a non-destructive merge advanced the issue branch to b6e495f without advancing the controller checkpoint. Implement completed 18 focused tests, then publication rejected two pre-existing upstream-ahead reconciliation commits as `publication_dirty_partial`. After synchronizing those commits, discovery still blocked with `exclusive_implement_publication_unproven` and five in-scope dirty files. No implementation was published.

## Acceptance Criteria

### AC1: Bounded start retry after ownership release
Given a failed `branch_checkout_failed` start on a clean exact checkpoint, a unique run owner, a strict failed handoff, and no worker
When another worktree releases the branch and the controller reproves issue, branch, head, ownership, and unchanged evidence
Then one durable owner-bound recovery archives the failed handoff and dispatches the normal start worker
And a still-owned branch or consumed recovery remains blocked without detaching or deleting any worktree.

### AC2: Reconcile approved default without force
Given an approved spec-only squash merge into default and an old issue branch not ancestral to default
When managed start reuses that issue branch
Then it proves the approved default/source relationship, performs only a safe non-destructive merge, verifies its exact history and allowed scope, synchronizes the exact head upstream without force, and records branch and head in its passed handoff
And missing provenance, unexpected branch movement, conflicts, or unrelated divergence fail closed without claiming success.

### AC3: Advance start-to-implement checkpoint
Given a passed start handoff and an exact synchronized issue branch
When the controller accepts the start result
Then it verifies branch/head against the handoff and upstream and atomically advances `runState.head` to the actual branch head before implementation
And stale, mismatched, or unpushed state cannot dispatch implement.

### AC4: Complete preserved pre-publication implementation
Given the failed implement handoff caused by pre-existing reconciliation commits ahead of upstream, synchronized exact reconciliation commits, no published implementation commit, a unique owner, and nonempty authorized dirty implementation work
When recovery is discovered and consumed once
Then the normal implementation worker resumes its bind/commit/push/handoff path without replaying consumed dispatch or discarding dirty work
And unrelated, ignored, denied, or unowned paths remain blocked.

### AC5: Fail closed on ambiguous evidence
Given a changed head, different issue/branch/source/PR, unknown or conflicting worktree, ambiguous owner, non-exact history, foreign worker, or previously consumed record
When discovery or worker transition inspects recovery
Then it preserves checkpoint, handoff, and evidence, does not force-push or take ownership, and offers no unsafe dispatch.

## Scope

Plugin-owned start, execute controller, bounded recovery/workflow contracts, and behavioral tests. Preserve exact-head PR and at-most-once gates. PennyScan product code and manual controller-state edits are out of scope. Delivery requires focused/full tests, candidate install, registered smoke, review/CI, exact-head PR merge, and installation only from its clean pinned merged head after coordination with issue #417.
