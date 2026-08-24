# Defect Report: Make execute resume active issue state safely

**Issue**: #249
**Date**: 2026-08-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/241-wait-for-retained-active-workers-instead-of-exiting-execute/

---

## Reproduction

1. Run `/sdlc-execute` with at least two serial issues, where the first issue completes delivery and the second reaches implementation.
2. Allow the second issue's implementation worker to be transiently observed as idle before its handoff is written, then allow the worker to resume and write a valid passed handoff.
3. Observe the controller stop with `missing_handoff` while leaving the implementation worker open.
4. Rerun the same issue queue after the valid implementation handoff exists.
5. Observe the controller re-finalize the earlier delivered issue, check out `main`, skip the later issue's completed start and implementation steps, and launch `review1` from `main`.
6. Observe review report `No changes between main and main` and fail to produce the expected review handoff.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Worker completion is determined by a validated handoff or an explicit failed, blocked, intervention, or stalled outcome—not by an idle observation alone. Resuming a queue restores and validates the active issue branch before launching its next incomplete step, including when earlier queue items are already delivered. Review compares the active issue branch against the repository default branch. |
| **Actual** | The retained-worker path treats `idle` or `done` without an already-written handoff as immediate `missing_handoff`. On resume, `syncAndDeleteIssueBranch` checks out the default branch for earlier delivered issues, then `nextStep` launches `review1` from that branch. `reviewBranchSelectionKeys` selects `main` with no current-versus-base guard. |

## Acceptance Criteria

### AC1: Transient Idle Does Not End a Worker Step

**Given** an active or retained worker is transiently reported idle without a handoff and subsequently resumes
**When** the controller observes that worker
**Then** it continues observing the same worker without starting a duplicate, closing its pane, or recording `missing_handoff`
**And** it accepts the worker's eventual validated handoff

### AC2: Explicit Unsafe Outcomes Still Fail Closed

**Given** a worker produces a failed, blocked, intervention, malformed, mismatched, or genuinely stalled outcome
**When** the controller evaluates the worker and its handoff
**Then** it stops the queue, preserves the relevant pane, records the specific failure reason, and does not advance to a later step or issue

### AC3: Resume Restores the Active Issue Branch

**Given** an earlier queue issue is fully delivered and a later issue has completed a prefix of its lifecycle
**When** `/sdlc-execute` resumes the persisted queue
**Then** it identifies, restores, and validates the later issue's branch before launching its next incomplete worker, regardless of branch changes caused by finalizing the earlier issue

### AC4: Review Cannot Compare Main Against Main

**Given** the next incomplete step is `review1` or `review2`
**When** the controller prepares the review
**Then** the current branch is the active issue branch and the selected base is the repository default branch
**And** an unresolved or unsafe mismatch stops before review starts rather than producing a no-change review

### AC5: Serial Resume Remains Non-Destructive

**Given** a clean resumable queue or a dirty worktree already on the active issue branch under the existing safety contract
**When** branch recovery and worker settlement run
**Then** the controller preserves user work, does not stash, reset, or discard changes, does not duplicate workers, and continues issues in persisted serial order

### AC6: Regression Coverage Exercises the Combined Failure

**Given** controller fixtures model a transient idle worker followed by a valid handoff and a completed earlier issue followed by a partially completed later issue
**When** the focused controller tests run
**Then** they prove the queue reaches review and delivery from the correct issue branch without manual intervention
**And** they preserve existing failed, blocked, intervention, and dirty-worktree safeguards

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Treat validated handoffs and explicit terminal outcomes as authoritative over transient idle observations | Must |
| FR2 | Reconcile the expected active issue branch before every resumed incomplete step after start | Must |
| FR3 | Prevent review from running when the current branch and selected base are the same | Must |
| FR4 | Preserve fail-closed handoff validation, retained-pane, serial-order, and user-work protections | Must |

## Out of Scope

- Changing the handoff schema or accepting unvalidated handoffs
- Relaxing failed, blocked, intervention, dependency, specification, authentication, or dirty-worktree gates
- Changing `/review` findings or remediation semantics beyond deterministic active-branch and base selection
- Automatically stashing, resetting, discarding, or overwriting user changes
- Changing `/sdlc-execute` issue selection or the write-spec picker (spec 238)

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #249 | 2026-08-24 | Initial defect report |
