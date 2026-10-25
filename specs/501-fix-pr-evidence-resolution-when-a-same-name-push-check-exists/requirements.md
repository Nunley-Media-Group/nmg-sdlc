# Defect Report: PR-evidence resolution fails when a same-name push check exists

**Issue**: #501
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/484-fix-first-run-delivery-missing-changelog-md-and-push-event-checks-block-sdlc-execute/

## Reproduction

1. Have a controlled draft PR for an issue whose verification report declares satisfied PR-only evidence `{ kind: "required_check", name: "contract-tests", event: "pull_request" }` at the exact PR head.
2. Have `gh pr checks` (unfiltered) return two `SUCCESS` checks named `contract-tests` at that head: one with `event: "push"` and one with `event: "pull_request"`, each with its own link.
3. Run delivery for the issue so that it collects final-head evidence for the draft PR.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The declared item is resolved only against checks whose `event` equals the declared `event`. The `pull_request` check resolves, the delivery-validation marker records its link, and the draft is readied and merged at the exact head. |
| **Actual** | The bare-name match across both events is ambiguous, `resolveDeclaredCheck` returns `mismatch`, and delivery fails with `verification_not_ready` (`Delivery failed for #N: verification_not_ready`) without readying or merging the draft. |

## Acceptance Criteria

### AC1: Same-name push check no longer blocks pull_request evidence

**Given** a draft PR whose report declares satisfied `pull_request` evidence named `contract-tests`
**And** the observed checks include a `push` check and a `pull_request` check both named `contract-tests`, both `SUCCESS` with distinct links
**When** delivery collects final-head evidence for the draft
**Then** the declared item resolves to the `pull_request` check, and the delivery-validation marker in the PR body records that check's link and not the push check's link
**And** the draft is readied and merged at the exact head

### AC2: A push check is never counted as declared evidence

**Given** a draft PR whose report declares satisfied `pull_request` evidence named `contract-tests`
**And** the only observed check named `contract-tests` has `event: push` and state `SUCCESS`
**When** delivery collects final-head evidence for the draft
**Then** delivery reports `verification_not_ready` with the summary `Draft PR #<n> PR-only checks remain pending`
**And** no delivery-validation marker is written, and the draft is neither readied nor merged

### AC3: A missing declared-event check stays pending

**Given** a draft PR whose report declares satisfied `pull_request` evidence named `contract-tests`
**And** no observed check has `event: pull_request`
**When** delivery collects final-head evidence for the draft
**Then** delivery reports `verification_not_ready` with the summary `Draft PR #<n> PR-only checks remain pending`, not `Delivery failed for #<issue>: verification_not_ready`
**And** the draft is neither readied nor merged

### AC4: Duplicate declared-event checks still fail closed

**Given** a draft PR whose report declares satisfied `pull_request` evidence named `contract-tests`
**And** two observed `pull_request` checks both match the name `contract-tests`
**When** delivery collects final-head evidence for the draft
**Then** delivery fails with `verification_not_ready` and the summary `Delivery failed for #<issue>: verification_not_ready`
**And** the draft is neither readied nor merged

### AC5: Single-event resolution is preserved

**Given** a draft PR whose report declares satisfied `pull_request` evidence
**And** exactly one observed `pull_request` check matches the declaration, by bare name (`contract-tests`) or by qualified name (`CI / contract-tests` against a check with `workflow: CI`)
**When** delivery collects final-head evidence for the draft
**Then** a `SUCCESS` match is recorded and the draft is readied and merged; a `PENDING` match reports `Draft PR #<n> PR-only checks remain pending`; a `FAILURE` match fails with `Delivery failed for #<issue>: verification_not_ready`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `evidenceForHead` resolves each declared `required_check`/`check_run` item only against observed checks whose `event` equals the item's `event` | Must |
| FR2 | A check whose `event` differs from the declared item's `event` is never recorded as evidence | Must |
| FR3 | When no check of the declared event matches, evidence collection stays pending | Must |
| FR4 | More than one matching check of the declared event fails delivery with `verification_not_ready` | Must |
| FR5 | Regression tests for AC1–AC5 live in `scripts/__tests__/sdlc-deliver.test.mjs` | Must |

## Out of Scope

- Changing `resolveDeclaredCheck` matching semantics for its other callers
- Changing `merge_blocking` evidence handling
- Changing how `scripts/pr-delivery-state.mjs` classifies declared PR-only checks in the delivery snapshot

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #501 | 2026-10-25 | Initial defect report |
