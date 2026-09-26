# Defect Report: Continue an explicit execute queue after the previous issue is delivered

**Issue**: #441
**Date**: 2026-09-26
**Status**: Approved
**Author**: NMG

---

## Reproduction

1. From the default branch, run `node scripts/sdlc-execute.mjs run #A #B` for two issues with Approved specs.
2. Let #A deliver: its PR merges at the recorded head and #A closes.
3. Observe the checkout remain on #A's issue branch and the controller exit with `active_issue_conflict` before starting #B.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | After #A is proven MERGED and CLOSED, the controller returns to the repository default branch and processes #B. |
| **Actual** | The per-issue loop treats #A's delivered branch as a conflicting active issue and stops. |

## Acceptance Criteria

### AC1: Queue continues after a delivered issue

**Given** an explicit queue `#A #B` where #A's pull request is MERGED at the checked-out head and #A is CLOSED
**When** the controller reaches #B while the checkout is still on #A's issue branch
**Then** it switches to the repository default branch and processes #B without `active_issue_conflict`

### AC2: Undelivered or dirty foreign branches still fail closed

**Given** the checkout is on another issue's branch that is not proven MERGED and CLOSED at its head, or the worktree has changes outside `.omp/`
**When** a different queued issue is processed
**Then** the controller stops with `active_issue_conflict` and preserves the branch and worktree

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Reuse the existing exact-head `completed` proof for the branch's own issue before leaving it. | Must |
| FR2 | Resolve the default branch from GitHub (`defaultBranchRef`) and switch to it without force; fail closed when unreadable or the switch fails. | Must |

## Out of Scope

- Changing the pre-loop active-branch checks for the first queued issue
- Changing start, implement, verify, or deliver worker behavior

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #441 | 2026-09-26 | Initial defect report |
