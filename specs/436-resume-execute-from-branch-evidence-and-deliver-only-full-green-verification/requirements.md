# Requirements: Resume execute from branch evidence and deliver only full-green verification

**Issue**: #436
**Date**: 2026-09-25
**Status**: Approved
**Author**: NMG

## User Story

**As a** maintainer running `/sdlc-execute`
**I want** execution to resume from the current issue branch and live Git/GitHub evidence and to repair every non-green verification until it is full-green
**So that** stale tracking files and one-use allowances never block or falsely advance delivery.

## Acceptance Criteria

### AC1: Branch-first resume
**Given** an issue branch with an approved spec and stale or malformed `.omp/sdlc/run.json` or `safe-recoveries.json`
**When** `/sdlc-execute` runs bare or with the matching `#N`
**Then** it selects that issue from the branch without a picker or checkpoint blocker, verifies clean existing work, implements dirty partial work, and preserves partial files.

### AC2: Continuous cause-based repair
**Given** repeated distinct failed implementations or verifications
**When** each repair changes the source
**Then** execute reruns full registered verification on the new head with no fixed attempt ceiling, passing prior failure evidence to the next worker and never replaying an unchanged smoke or push.

### AC3: Full-green delivery only
**Given** registered steering validations, including the required smoke provider
**When** verification finalizes and delivery runs
**Then** only a complete passing exact-source-head registered gate permits PR ready/merge; PR-only evidence uses a controlled draft; the PR merges at its exact head and the linked issue is CLOSED.

### AC4: Invocation-bound smoke proof
**Given** the registered `repository.nmg-sdlc-smoke` provider
**When** a nested smoke execution delivers its fixture
**Then** its pre-merge receipt carries the outer invocation id, and success requires an exact-head MERGED PR not already merged at baseline plus a CLOSED issue.

### AC5: Owned cancellation
**Given** a cancelled or lost execute controller
**When** the supervisor cleans up
**Then** it closes only panes this invocation reported owning, honors `--retain-worker`, preserves foreign panes and leases, and releases only its own lease.

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Execute derives the issue and stage from the branch, HEAD, worktree, singular Approved spec, and live PR/issue evidence using four stages: start, implement, verify, deliver. | Must |
| FR2 | Runtime checkpoints, recovery ledgers, and old handoffs never select a stage, grant publication, or veto work; the controller lease is only a live mutex. | Must |
| FR3 | Failed or non-green verification routes to an implementation repair with prior evidence and no attempt ceiling. | Must |
| FR4 | Finalization and delivery require complete passing manifest-registered results at the exact source head, with report-only source-parent reuse. | Must |
| FR5 | Smoke delivery proof is bound to the outer invocation and exact-head merge; cancellation affects only invocation-owned panes. | Must |

## Out of Scope

- Changing consumer steering policy or removing the required smoke gate.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #436 | 2026-09-25 | Initial feature spec |
