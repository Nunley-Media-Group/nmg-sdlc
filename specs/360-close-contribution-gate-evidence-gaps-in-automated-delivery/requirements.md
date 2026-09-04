# Defect Report: Close contribution-gate evidence gaps in automated delivery

**Issue**: #360
**Date**: 2026-09-04
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/125-add-github-actions-contribution-gates-to-project-setup/

---

## Reproduction

1. Complete automated verification for an approved issue whose final delivery diff includes implementation, tests, and delivery version files.
2. Run automated delivery so it creates the pull request from the current body generator.
3. Observe the managed contribution gate on that pull request and the delivery handoff.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Local contribution evidence against the exact pull-request title, body, head, and changed-path set passes before the pull request is created or its body is updated. The resulting body satisfies the existing contribution-gate steering, path-mapping, and verification rules. If the remote contribution gate later fails only because pull-request evidence is incomplete and the head is unchanged, delivery repairs that body in place without a git commit and without human review, then continues observing the remote gate. |
| **Actual** | The pull request fails the contribution gate for missing steering evidence and unmatched changed paths. Delivery stops with `reasonCode: human_review` even though no human reviewer requested changes. |

**Version bump**: patch

## Acceptance Criteria

### AC1: Generated evidence satisfies the existing gate

**Given** a verified issue whose final delivery diff includes implementation, tests, and delivery version files
**When** automated delivery creates or updates the pull request
**Then** local contribution evaluation against that exact title, body, head, and changed-path set reports no missing steering evidence and no unmatched relevant paths
**And** the existing contribution-gate steering, path-mapping, and verification rules are unchanged

### AC2: Local evaluation precedes mutation

**Given** contribution evidence is incomplete for the exact final diff
**When** delivery would create a pull request or update its body
**Then** it does not perform that mutation
**And** it reports the incomplete evidence categories

### AC3: Body-only remote failures are not human review

**Given** an open delivery pull request whose head is unchanged and whose only failing check is incomplete contribution evidence that can be repaired in the pull-request body
**When** delivery remediates that failure
**Then** it updates the pull-request body without a git commit
**And** it does not write `reasonCode: human_review`
**And** it continues observing the remote contribution gate

### AC4: No regression for true human review

**Given** a human reviewer requested changes, or an automated review thread has no actionable path
**When** delivery classifies the pull request
**Then** it still stops with `reasonCode: human_review` and does not merge

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Delivery pull-request evidence includes the closing issue, spec identity, steering alignment, mapped relevant changed paths, and specific verification. | Must |
| FR2 | Local contribution evaluation must pass before a pull request is created or its body is updated. | Must |
| FR3 | Pull-request-body-only contribution-gate failures are repaired in place without a git commit and without human review. | Must |
| FR4 | The remote contribution gate is still observed after local evaluation and after any body repair. | Must |
| FR5 | Human-requested changes and pathless automated review threads still stop as human review. | Must |

## Out of Scope

- Weakening or bypassing the contribution-gate steering, path-mapping, or verification rules
- Empty commits used only to retrigger CI
- Consumer-repository product changes, including pennyscan
- Changing required-check, merge-proof, or exact-head merge rules

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #360 | 2026-09-04 | Initial defect report |
