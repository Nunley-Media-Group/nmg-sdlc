# Defect Report: Fix final-head evidence hang on workflow-qualified check names

**Issue**: #336
**Date**: 2026-08-31
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/319-remediate-failing-hosted-checks-that-are-not-branch-protected/

---

## Reproduction

1. Produce PR-dependent verification that declares workflow-qualified check identities (workflow name, space-slash-space, job name), such as `Python CI / verify` and `nmg-sdlc contribution gate / Validate nmg-sdlc contribution evidence`.
2. Open or resume the controlled draft and advance from H1 to H2.
3. Observe GitHub pull-request checks for that H2 as successful, with GitHub exposing bare job names `verify` and `Validate nmg-sdlc contribution evidence` plus workflow metadata `Python CI` and `nmg-sdlc contribution gate`.
4. Run final-head evidence collection for the declared identities.

Live reproduction: nmg-sdlc-smoke issue #35, PR #37, head `97e1daa`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Collection completes once every declared check identity uniquely matches a successful pull-request check on the exact H2, using one canonical identity shared by verification output, readiness parsing, snapshot collection, final-head matching, delivery-validation markers, and hosted evidence. |
| **Actual** | Successful H2 checks never satisfy workflow-qualified declarations. Collection polls indefinitely. |

**User Confirmed**: Yes

**Version bump**: patch

## Acceptance Criteria

### AC1: Qualified declarations complete H1-to-H2 collection

**Given** verification declared `Python CI / verify` and `nmg-sdlc contribution gate / Validate nmg-sdlc contribution evidence` as pull-request check identities
**And** H2 GitHub checks report those jobs as bare names `verify` and `Validate nmg-sdlc contribution evidence` with workflows `Python CI` and `nmg-sdlc contribution gate`, both `SUCCESS` on the exact H2 with evidence URLs
**When** final-head evidence collection runs
**Then** collection completes with one satisfied evidence item per declaration
**And** it does not keep polling after those successful checks are visible

### AC2: Same job name from different workflows fails closed

**Given** two successful pull-request checks that share job name `verify` and have different workflow names
**When** evidence collection matches a declaration that does not uniquely select one workflow
**Then** collection fails closed immediately
**And** it does not treat either check as the other by suffix or trailing-name matching

### AC3: Unique bare names still match

**Given** a declaration whose check identity is the bare unique name `contract-tests`
**And** GitHub reports one pull-request check named `contract-tests` with empty workflow metadata, successful, with a URL, on the exact head
**When** evidence collection runs
**Then** that declaration is satisfied
**And** existing unique bare-name delivery still reaches final-head validation

### AC4: Pending stays pending; terminal mismatch does not hang

**Given** a declared check identity that has not appeared yet, or whose matching check is still pending
**When** collection observes that state
**Then** it keeps waiting
**Given** pull-request checks for that head are already successful, skipped, or failed and the declared identity still cannot be uniquely resolved
**When** collection observes that state
**Then** it fails closed immediately rather than polling forever
**And** missing URL, wrong event, or wrong head on an otherwise named check is also a failure, not a wait

### AC5: Canonical identity is shared and fail-closed

**Given** verifier production, readiness parsing, snapshot collection, final-head matching, delivery-validation markers, and hosted evidence
**When** they record or match a required check or check run
**Then** they use the same canonical identity
**And** that identity is the GitHub workflow plus job when workflow metadata is present, or the unique bare job name when workflow is empty
**And** collisions, wrong workflow, wrong event, wrong head, missing URL, and matched pending or failing checks are rejected

### AC6: No regression on current exact-name fixtures

**Given** current controlled-draft delivery where declaration names already equal GitHub check names
**When** H1-to-H2 collection and merge proof run
**Then** delivery still succeeds without requiring workflow metadata

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | One canonical check identity is used by verifier production, readiness parsing, snapshot collection, final-head matching, delivery-validation markers, and hosted evidence. | Must |
| FR2 | Workflow-qualified declarations match GitHub bare job names when authoritative workflow and job metadata reconstruct the same identity. | Must |
| FR3 | Matching must not use suffix or trailing-name comparison. | Must |
| FR4 | Unique bare names with empty workflow metadata continue to match. | Must |
| FR5 | Same job name from different workflows fails closed unless the declaration uniquely selects one workflow. | Must |
| FR6 | Final-head collection completes for AC1 and fails closed for AC2/AC4 without an unbounded wait. | Must |
| FR7 | Exact event and head binding stay required; success still needs an evidence URL. | Must |

## Out of Scope

- Adding a wall-clock deadline to the H2 poll loop
- Bumping PR-readiness `schemaVersion` or adding a new marker field such as `workflow`
- Treating GitHub UI strings as parseable suffixes without workflow/job metadata

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #336 | 2026-08-31 | Initial defect report |
