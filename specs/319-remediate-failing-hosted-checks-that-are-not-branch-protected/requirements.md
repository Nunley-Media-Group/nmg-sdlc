# Defect Report: Remediate failing hosted checks that are not branch-protected

**Issue**: #319
**Date**: 2026-08-29
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/195-move-exact-head-delivery-into-a-controller-with-on-demand-remediation/

---

## Reproduction

1. Deliver an issue whose PR has required checks passing and a non-required hosted check failing (for example `Validate nmg-sdlc contribution evidence`).
2. Run `node scripts/sdlc-deliver.mjs --issue N --session-token T` (or `/sdlc-open-pr` for that issue).
3. Observe GitHub `mergeStateStatus: UNSTABLE` and the failing non-required check.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Delivery classification includes every check `gh pr checks` returns. A failing non-required check produces the same CI remediation packet as a failing required check: process exit 3 and `NMG_SDLC_REMEDIATION` listing that check. |
| **Actual** | The snapshot omits the failing non-required check. Classification is `pending` / `mergeability_pending`. The controller polls every 30 seconds and never remediates or stops. |

**Version bump**: patch

## Acceptance Criteria

### AC1: Bug Is Fixed

**Given** an open delivery PR whose required checks passed and a non-required hosted check failed
**When** the delivery controller observes that PR
**Then** it exits 3 with `NMG_SDLC_REMEDIATION` whose `failingChecks` include that non-required check
**And** it does not remain in the 30-second `mergeability_pending` poll loop

### AC2: No Regression

**Given** a delivery PR whose hosted checks are all pending or all successful
**When** the delivery controller observes that PR
**Then** pending checks still classify as `pending` and successful exact-head `CLEAN` PRs still classify as `merge_ready`
**And** human-review threads, `CHANGES_REQUESTED`, and required-check failures keep their current statuses

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Include every `gh pr checks` result in every delivery snapshot, not only `--required` or declared `check_run` evidence. | Must |
| FR2 | Classify a failing non-required check as remediable `checks_failed` and emit `NMG_SDLC_REMEDIATION`. | Must |
| FR3 | Preserve pending, merge-ready, human-review, and required-check-failure behavior. | Must |

## Out of Scope

- Changing the contribution gate itself
- Execute review-worker observation (separate issue)
- Completing leftover execute queue issue #314

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #319 | 2026-08-29 | Initial defect report |
