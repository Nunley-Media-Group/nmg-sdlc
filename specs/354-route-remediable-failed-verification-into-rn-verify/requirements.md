# Defect Report: Route remediable failed verification into rN-verify

**Issue**: #354
**Date**: 2026-09-02
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/259-add-controller-owned-fresh-session-remediation-loops/

---

## Reproduction

1. Install nmg-sdlc `3.20.4` in a Herdr OMP execute session.
2. Run `/sdlc-execute` through implement, review1, fix1, review2, and fix2 for an approved issue.
3. Let verify-code produce Implementation Status Fail or Partial because a required local steering gate failed (full repository tests and/or BDD).
4. Observe `sdlc-finalize-verification` write `.omp/sdlc/handoffs/<N>-verify.json`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | A Fail or Partial verification ceiling writes a failed verify handoff with `intervention: false`. Execute persists that evidence, closes `s<N>-verify`, and starts `r<N>-verify` to diagnose, fix, and rerun the verify contract. Incomplete verification, `spec_not_approved`, `verification_publish_failed`, lease failures, and unverifiable reports still stop with `intervention: true` (or an equivalent missing/invalid handoff) and do not start rem. |
| **Actual** | Fail and Partial write `status: failed`, `intervention: true`, `reasonCode: verification_not_ready`. Execute stops (`Stopped on #N verify`) and never starts `rN-verify`. Rerunning execute re-verifies the same non-pass instead of remediating. |

## Acceptance Criteria

### AC1: Fail or Partial verification is remediable

**Given** an approved issue whose verify-code report has Implementation Status Fail or Partial because a required local steering gate failed
**When** verification finalization writes the verify handoff and execute evaluates that idle or done worker
**Then** the handoff is `status: failed` and `intervention: false` for step `verify`
**And** execute closes `s<N>-verify` after persisting the failure evidence
**And** execute starts exactly one fresh rem session named `r<N>-verify`
**And** that rem session reruns the verify contract and writes `.omp/sdlc/handoffs/<N>-verify.json` with step `verify`

### AC2: Incomplete and controller blockers stay intervention

**Given** verification is Incomplete, `spec_not_approved`, `verification_publish_failed`, lease-held, or otherwise unverifiable
**When** execute evaluates that verify outcome
**Then** the handoff is `intervention: true`, or lease-held still writes no verify handoff
**And** execute does not start `r<N>-verify`
**And** it stops fail-closed with the relevant pane preserved

### AC3: Passed verification still advances

**Given** a passed or PR-evidence-pending/satisfied verify handoff with `intervention: false`
**When** execute consumes it
**Then** it still closes the verify worker and continues to deliver
**And** it does not start a rem session

### AC4: No rem identity leak

**Given** `r<N>-verify` later writes a valid passed non-intervention verify handoff
**When** execute consumes it
**Then** later steps use the original verify step identity, not a leftover rem identity
**And** no second `s<N>-verify` worker exists for that issue

### AC5: Owned smoke verification does not recurse

**Given** the required mutable smoke provider starts an execute controller with `NMG_SDLC_SMOKE_OWNED=1`
**When** that controller starts its verify and deliver workers
**Then** both workers receive the ownership marker
**And** the nested smoke provider returns Pass without cloning or starting another execute controller
**And** the enclosing provider remains responsible for exact pre-merge delivery proof, merged PR, and issue closure

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Fail and Partial verification ceilings produce a remediable failed verify handoff (`intervention: false`). | Must |
| FR2 | Execute starts the existing `#259` `r<N>-verify` loop for that remediable failed verify handoff and reruns verify, not implement. | Must |
| FR3 | Incomplete verification, `spec_not_approved`, publish/lease failures, and unverifiable reports remain `intervention: true` (lease-held may still omit the handoff) and do not start rem. | Must |
| FR4 | Passed verify still advances to deliver without rem. | Must |
| FR5 | A smoke-owned controller forwards `NMG_SDLC_SMOKE_OWNED` only to verify and deliver workers; nested verification passes without recursion while the enclosing provider retains delivery-proof authority. | Must |

## Out of Scope

- Host-project test migration such as pennyscan `#132` T009
- Auto-remediating Incomplete, publish, lease, or spec-not-approved outcomes
- Rewinding completed steps to implement
- Changing review, fix, start, or deliver intervention mapping
- Adding an attempt cap to `#259` rem retries
- Changing `inspectVerificationReadiness` so Fail/Partial/Incomplete stop sharing `blocked` / `implementation_non_pass`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #354 | 2026-09-02 | Initial defect report |
| #354 | 2026-09-03 | Verification remediation: prevent nested mutable-smoke recursion while preserving enclosing delivery proof ownership |
