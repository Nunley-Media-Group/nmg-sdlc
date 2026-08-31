# Defect Report: Resume exact-head delivery after authorized reconciliation

**Issue**: #333
**Date**: 2026-08-31
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/293-persist-exact-head-delivery-cas-and-isolated-session-tokens/

---

## Reproduction

1. Start execute delivery for an approved-spec issue whose exact-branch PR is open at head H1 and persist `delivery.expectedHead` as H1 with `status: expected`.
2. Let the delivery controller create and push the version/delivery commit so that same PR and issue branch advance to clean local HEAD H2.
3. Observe the controller persist `status: reconciliation_required` with expected H1 and observed H2, then write failed reasonCode `delivery_reconciliation_required`.
4. Leave the checkout on that issue branch at H2, tree clean except `.omp/`, PR still OPEN with required checks complete under ordinary delivery completeness.
5. Rerun the same execute/deliver namespace (`sdlc-deliver` with the matching controller run id or isolated session token).

Live smoke that exhibited this: `Nunley-Media-Group/nmg-sdlc-smoke` issue #35 / PR #37. Run state expected `81f3d0d`; the controller-created delivery commit advanced the same branch/PR to `2680311` with successful Python CI and contribution gate; every rerun exited before re-observation.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The rerun re-observes GitHub by the persisted PR number only. When the observation is the same PR, same issue branch, clean local tree, local HEAD equal to the open PR head, and required checks complete under ordinary delivery completeness, it CAS-persists `status: expected`, `expectedHead` equal to that observed head, and `reconciliation: null` in one write, then resumes ordinary delivery in the same invocation. |
| **Actual** | The rerun hits the `reconciliation_required` guard and returns the stored failure without `gh pr view`, check inspection, or any authorized expectedHead advance. Delivery cannot recover without manually rewriting run state. |

## Acceptance Criteria

### AC1: Bug Is Fixed

**Given** a delivery namespace whose `run.json` `delivery.status` is `reconciliation_required` for issue I, PR P, and expectedHead H1
**And** the current branch belongs to I, the worktree is clean except `.omp/` paths, and `git rev-parse HEAD` is H2
**And** `gh pr view P` shows PR P still `OPEN`, `headRefName` equal to that issue branch, and `headRefOid` equal to H2
**And** required checks for P at H2 are complete under the same rules ordinary delivery already uses (`gh pr checks --required`: empty is allowed only when GitHub reports none required; every returned check state is `SUCCESS`, `NEUTRAL`, or `SKIPPED`)
**When** `runDeliver` runs again in that same execute-owned or isolated-session namespace
**Then** it re-observes GitHub by persisted PR number P only and does not call exact-branch PR list/create
**And** it CAS-persists one delivery object with `status: expected`, `expectedHead: H2`, `pullRequest: P`, and `reconciliation: null`
**And** the same invocation resumes ordinary delivery (readiness, exact-head merge at H2, issue-closure proof)
**And** pending required checks do not take this path; they remain `reconciliation_required` until a later rerun sees complete checks

### AC2: No Regression

**Given** a delivery namespace whose `delivery.status` is already `reconciliation_required`
**When** re-observation shows any of: a different PR number, `CLOSED` or `MERGED` PR state, a dirty tree outside `.omp/`, local HEAD not equal to the open PR head, a foreign PR head, missing or unknown required-check state, pending required checks, or failed required checks
**Then** `delivery.status` remains `reconciliation_required` and `expectedHead` is unchanged
**And** stored reconciliation evidence is not rewritten
**And** the invocation writes failed reasonCode `delivery_reconciliation_required`
**And** it does not create, list-select, ready, push, or merge a pull request

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Replace the unconditional `reconciliation_required` early return with a fail-closed re-observation of the persisted PR number, current issue branch, clean local tree, local HEAD, open PR head, and ordinary required-check completeness. | Must |
| FR2 | On a fully authorized observation, atomically CAS-advance `expectedHead`, set `status` to `expected`, clear `reconciliation`, and continue ordinary delivery in the same invocation for both execute-owned and isolated-session namespaces. | Must |
| FR3 | Keep unauthorized identity and check outcomes immutable: no PR discovery/create, no push/ready/merge, no expectedHead change, no rewritten reconciliation evidence. | Must |
| FR4 | Do not poll for pending checks while status is `reconciliation_required`; a later rerun may recover after checks complete. | Must |

## Out of Scope

- Auto-creating or selecting a follow-up PR after unexpected identity
- Recovering when the live PR number is not the persisted PR
- Treating `MERGED` or `CLOSED` as an authorized recovery from `reconciliation_required`
- Polling for pending checks without first leaving `reconciliation_required`
- Changing the in-run H1→H2 rebind that already runs while `status` is `expected` (that path must keep authorizing a clean same-PR head advance without requiring checks, because CI has not run yet)

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #333 | 2026-08-31 | Initial defect report |
