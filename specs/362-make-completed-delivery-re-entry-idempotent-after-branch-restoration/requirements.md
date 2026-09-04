# Defect Report: Make completed delivery re-entry idempotent after branch restoration

**Issue**: #362
**Date**: 2026-09-04
**Status**: Approved
**Author**: NMG

---

## Reproduction

1. Complete delivery through exact-head merge and issue closure.
2. Let the delivery worker restore the default branch.
3. Invoke delivery again from that worker before it settles.
4. Observe `verification_not_ready` because the restored local default branch lacks the merged verification report, despite persisted delivery status `complete` and valid remote terminal proof.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | A completed delivery re-entry validates the persisted PR number, expected head, merged state, and issue closure, then returns a passed handoff without requiring issue-branch files or making mutations. |
| **Actual** | Delivery loads the local approved spec and verification report first, fails before consulting terminal persisted delivery state, and overwrites the successful handoff. |

**Version bump**: patch

## Acceptance Criteria

### AC1: Completed re-entry succeeds from the restored branch

**Given** persisted delivery is complete for pull request P at expected head H
**And** the working tree is on the restored default branch without the issue verification report
**When** delivery is invoked again
**Then** it validates that P is merged at H and the issue is closed
**And** it writes a passed delivery handoff and exits zero

### AC2: Terminal re-entry is read-only

**Given** terminal remote proof is valid
**When** completed delivery re-entry runs
**Then** it performs no commit, push, PR edit, merge, checkout, or issue mutation

### AC3: Identity mismatches fail closed

**Given** the persisted PR number or expected head differs from remote terminal state, or the issue is not closed
**When** completed delivery re-entry runs
**Then** it fails with existing reconciliation or merge-proof classification
**And** it does not report success

### AC4: Mutable smoke receives successful completion

**Given** an owned smoke delivery merges its exact pull request and closes its issue
**When** its delivery worker repeats delivery before settlement
**Then** execute exits zero with invocation-owned delivery proof

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Check persisted terminal delivery before local spec, readiness, or issue-branch requirements unavailable after restoration. | Must |
| FR2 | Preserve exact PR number, expected-head, merge-state, and issue-closure proof. | Must |
| FR3 | Terminal re-entry must be read-only. | Must |
| FR4 | Preserve normal first delivery, open-PR resume, reconciliation, and human-review behavior. | Must |
| FR5 | Add unit regressions for terminal success and every fail-closed boundary. | Must |

## Out of Scope

- Weakening exact-head or issue-closure proof
- Treating incomplete or open delivery as terminal
- Reusing historical smoke issues
- Changing contribution-gate rules

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #362 | 2026-09-04 | Initial defect report |
