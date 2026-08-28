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

### AC4: Successful Review Prompt Requires Its Handoff

**Given** the single review/finalization prompt exits successfully
**When** execute starts review1 or review2
**Then** execute accepts completion only from the validated artifact-backed handoff
**And** it does not wait for a new future `working` transition or submit another workflow prompt

### AC5: Exact Pasted Prompt Recovery Sends One Enter

**Given** the single review/finalization prompt returns `agent_prompt_stalled`
**When** that exact prompt is visibly pasted and no handoff exists
**Then** execute sends one Enter and observes the owned worker and handoff
**And** it does not resend the review prompt or require working-state detection

### AC6: Direct Review Failure Fails Closed

**Given** the direct review request returns a failure other than `agent_prompt_stalled`
**When** execute starts review
**Then** it stops with `review_failed`
**And** it does not attempt prompt recovery or a second settlement wait

### AC7: Skipped State Detection Cannot End an Active Review

**Given** the single controller-owned review prompt returns `agent_prompt_stalled` after about 13 seconds
**And** Herdr detection omits both the pasted prompt and a working state while the sibling OMP worker remains registered
**When** the worker continues the host review
**Then** execute waits for the actual review handoff or confirmed worker disappearance
**And** it does not close the pane, submit a second workflow prompt, or require a future working transition

### AC8: One Prompt Finalizes Review Evidence

**Given** a controller-owned sibling review reports findings or no findings
**When** its resolved-base host review completes
**Then** that same prompt writes the canonical review artifact and validated review handoff
**And** execute advances only when a passed handoff names the existing non-empty review artifact
**And** prompt failure, worker disappearance without a handoff, or invalid review evidence fails closed

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Resolve the GitHub default name to `refs/heads/<name>` first, then `refs/remotes/origin/<name>`, using exact git ref checks. | Must |
| FR2 | Submit one sibling `--kind omp` prompt that runs the host review against the resolved base and finalizes its artifact and handoff; do not invoke or parse the interactive `/review` picker. | Must |
| FR3 | Wait for a validated review handoff while the exact owned worker remains registered; state detection, idle guesses, and a second future working transition must not control review completion. | Must |
| FR4 | Only `agent_prompt_stalled` may continue observing the owned worker without detection text or use the existing one-Enter pasted-prompt recovery; every other prompt error fails closed with `review_failed` and skips recovery. | Must |
| FR5 | Accept a passed review handoff only when it names an existing non-empty canonical review artifact; fail closed on direct prompt failure, invalid evidence, or confirmed worker disappearance. | Must |

## Out of Scope

- Controller leases and worker cleanup owned by issue #291
- Checkpoint CAS owned by issue #290
- Delivery merge/CAS behavior owned by issue #293
- Changing review findings, scoring, file assignment, or remediation contracts except to supply the resolved base ref
- Guessing a non-default branch when GitHub/default-ref evidence is missing
- Avoiding regressions in controller lease and exact worker-ownership policy owned by issue #291; deterministic base selection and review-completion pane lifecycle remain in scope for #292

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #292 | 2026-08-27 | Initial defect report |
| #292 | 2026-08-28 | Accept successful waited reviews exactly once and confine recovery to actual prompt stalls |
| #292 | 2026-08-28 | Replace the two-prompt/state-detection lifecycle with one handoff-driven sibling review protocol |
