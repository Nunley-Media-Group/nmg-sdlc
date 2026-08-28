# Defect Report: Persist exact-head delivery CAS and isolated session tokens

**Issue**: #293
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/291-enforce-one-controller-writer-and-close-stale-workers/

---

## Reproduction

1. Leave issue A's execute checkpoint in `.omp/sdlc/run.json` and invoke `sdlc-deliver --issue B` without an execute scope.
2. Observe delivery B use canonical `.omp/sdlc` handoff/state paths that belong to A.
3. For B, create or resume PR P at H1, then publish verification/final-report work so the local branch advances to H2.
4. Merge P at an unexpected head or change the live PR head after it was selected, then rerun delivery.
5. Observe `merge_failed` without a durable expected PR/head tuple, allowing selection or creation pressure for another PR and permitting command exit to be mistaken for terminal completion.

### Remediation Observations

1. Resume an existing exact-branch PR at H1 with a clean issue branch.
2. Let delivery persist H1, publish and push its version commit at H2, and then observe the PR.
3. Observe the controller reject its own H1→H2 push as `delivery_reconciliation_required`.
4. Resume a two-issue execute run after the first issue delivered and left the checkout on the default branch.
5. Keep the exact retained non-start worker for the second issue live with ownership bound to its issue branch and head.
6. Observe ownership matching run against the default-branch checkout and falsely stop with `retained_worker_mismatch`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Delivery runs only with the matching execute controller scope or an explicit isolated session token. It CAS-persists one expected issue/PR/head tuple before readiness or merge mutations. Merge uses that tuple, and passed handoff requires that exact PR MERGED at that exact head plus issue CLOSED. Unexpected merge/head identity records one stable reconciliation failure; reruns reproduce it and never open another PR. |
| **Actual** | `sdlc-deliver` needs only an issue number, writes canonical handoffs, rediscovers PR/head from live state, compares merged PR to later local HEAD, and reports generic `merge_failed` without a persistent reconciliation boundary. |

## Acceptance Criteria

### AC1: Exact PR and Head Are CAS-Bound Through Merge

**Given** controller-owned delivery for issue A has CAS-persisted expected PR P and head H
**When** readiness polling and merge run
**Then** every live snapshot must still identify P at H
**And** merge uses `--match-head-commit H`
**And** the deliver handoff passes only after P is MERGED at H and issue A is CLOSED

### AC2: Unexpected Identity Records One Reconciliation Failure

**Given** delivery expects PR P at head H
**When** P is unexpectedly merged at another head or its live head changes outside an authorized delivery transition
**Then** delivery CAS-persists `delivery_reconciliation_required` with the expected and observed identity
**And** it writes one stable failed deliver handoff
**And** subsequent invocations return the same reconciliation failure without creating, selecting, readying, pushing, or merging another PR

### AC3: Standalone Delivery Uses an Isolated Session

**Given** issue A's canonical execute checkpoint exists
**When** standalone `/sdlc-open-pr` for issue B initializes and uses a dedicated session token
**Then** B uses `.omp/sdlc/sessions/<token>/run.json` and its session handoff directory
**And** A's canonical checkpoint and handoff bytes remain unchanged
**And** delivery without a matching execute scope or valid session token is rejected before mutation

### AC4: Normal Delivery Still Completes

**Given** execute-owned or token-isolated delivery whose live PR remains at the expected head
**When** required checks and review evidence pass
**Then** exact-head squash merge, issue closure proof, cleanup, and passed handoff still complete

### AC5: Existing PR Rebinds the Controller-Owned Version Head

**Given** delivery has persisted an existing exact-branch PR at H1
**When** its version publication creates and pushes clean local head H2
**Then** delivery re-reads that exact PR after the push
**And** it CAS-rebinds the expected head to H2 only when the PR remains open on that exact issue branch, the PR number and branch identity still match independently, and its head equals the clean current local head
**And** it never readies or merges the PR at pre-bump H1
**And** a different remote head remains a reconciliation failure

### AC6: Multi-Issue Resume Restores Checkout Before Live Ownership Matching

**Given** an earlier delivered issue left a clean multi-issue execute checkout on the default branch
**And** the next issue has an exact live retained non-start worker bound to its issue branch and head
**When** execute resumes the next issue
**Then** it restores the expected active issue branch before matching retained-worker ownership
**And** it resumes the exact worker without `retained_worker_mismatch`
**And** dirty or foreign checkout work is never overwritten

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Persist delivery issue, PR number, expected head, lifecycle status, and reconciliation evidence through monotonic checkpoint CAS. | Must |
| FR2 | Require exactly one delivery scope: matching execute controller run id or valid isolated session token. | Must |
| FR3 | Namespace isolated run state and handoffs under `.omp/sdlc/sessions/<token>/` and bind them to canonical project, issue, branch, and initial head. | Must |
| FR4 | Stop idempotently on unexpected PR/head identity and never open a follow-up PR from that state. | Must |
| FR5 | Pass delivery only after the persisted PR is MERGED at the persisted expected head and the issue is CLOSED. | Must |
| FR6 | After an existing-PR version push, re-read the persisted PR and authorize its head advance only when it remains open on the exact issue branch, its PR number and branch identity match independently, and its head equals this run's clean current HEAD; otherwise reconcile. | Must |
| FR7 | For non-start steps, restore a clean expected active issue branch before retained-worker ownership matching and fail closed on dirty or foreign work. | Must |

## Out of Scope

- Defining checkpoint identity/CAS primitives owned by issue #290
- Defining the controller lease and worker ownership model owned by issue #291
- Review-base selection owned by issue #292
- Hosted contribution-gate path mapping inside host repositories
- Automatically reconciling or creating a follow-up PR after unexpected merge/head identity

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #293 | 2026-08-27 | Initial defect report |
| #293 | 2026-08-28 | Added version-push head rebinding and multi-issue retained-worker resume remediation |
