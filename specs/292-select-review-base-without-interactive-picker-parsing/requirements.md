# Defect Report: Select review base without interactive picker parsing

**Issue**: #292
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/291-enforce-one-controller-writer-and-close-stale-workers/

---

## Reproduction

1. Clone a repository whose GitHub default branch exists only as `origin/<name>`, or open a review worker in a narrow Herdr pane with many long branch names.
2. Run `/sdlc-execute` until `review1` or `review2`.
3. Observe `reviewBranchSelection()` reject the remote-only default, or observe `completeInteractiveReview()` fail to parse and drive the wrapped `/review` picker.
4. Execute stops with `review_failed` or leaves the worker waiting on the picker.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Execute resolves the GitHub default branch to the local ref when present or `origin/<default>` otherwise, starts the existing review contract against that ref without opening or parsing a picker, and waits for the worker handoff. Terminal width and branch-name wrapping have no effect. |
| **Actual** | The controller requires the exact local branch name, submits `/review`, parses rendered picker text, and sends navigation keys. Remote-only clones and wrapped picker output fail. |

## Acceptance Criteria

### AC1: Remote-Only Default Branch Reviews Noninteractively

**Given** the GitHub default branch is `main` and only `refs/remotes/origin/main` exists locally
**When** execute reaches review1 or review2
**Then** it starts the review contract against `origin/main`
**And** it does not submit `/review`, parse picker output, or send picker navigation keys
**And** narrow terminal width and long wrapped branch names do not affect the result

### AC2: Local Default Branch Behavior Is Preserved

**Given** the GitHub default branch is `main` and `refs/heads/main` exists locally
**When** execute reaches review1 or review2
**Then** it reviews against `main`
**And** it still waits for the review result and the controller-owned handoff before advancing

### AC3: Missing Default Ref Fails Closed

**Given** GitHub reports a default branch whose local and `origin/` refs are both absent
**When** execute reaches review
**Then** it stops with `review_failed` before submitting a review prompt
**And** it does not guess another branch

### AC4: Successful Waited Review Settles Exactly Once

**Given** `herdr agent prompt <review-worker> <review-request> --wait` exits successfully
**When** execute starts review1 or review2
**Then** execute accepts that result as the completed host review
**And** it does not wait for a new future `working` transition before submitting the controller-owned workflow prompt

### AC5: Stalled Review Recovery Observes Existing Work

**Given** the direct review request returns `agent_prompt_stalled`
**When** the exact request is visibly pasted or the worker is visibly working
**Then** execute uses the existing bounded pasted-prompt recovery or settlement observation
**And** it does not resend the review request or accept an unknown completion

### AC6: Direct Review Failure Fails Closed

**Given** the direct review request returns a failure other than `agent_prompt_stalled`
**When** execute starts review
**Then** it stops with `review_failed`
**And** it does not attempt prompt recovery or a second settlement wait

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Resolve the GitHub default name to `refs/heads/<name>` first, then `refs/remotes/origin/<name>`, using exact git ref checks. | Must |
| FR2 | Submit the existing review contract with the resolved base ref directly; do not invoke or parse the interactive `/review` picker. | Must |
| FR3 | Preserve review settlement, artifact, handoff, and fail-closed behavior. | Must |
| FR4 | Treat a successful waited direct-review prompt as settled exactly once; only `agent_prompt_stalled` may enter existing pasted-prompt recovery or visible-working observation. | Must |

## Out of Scope

- Controller leases and worker cleanup owned by issue #291
- Checkpoint CAS owned by issue #290
- Delivery merge/CAS behavior owned by issue #293
- Changing review findings, scoring, file assignment, or remediation contracts except to supply the resolved base ref
- Guessing a non-default branch when GitHub/default-ref evidence is missing
- Changing controller ownership, deterministic base selection, or pane cleanup

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #292 | 2026-08-27 | Initial defect report |
| #292 | 2026-08-28 | Accept successful waited reviews exactly once and confine recovery to actual prompt stalls |
