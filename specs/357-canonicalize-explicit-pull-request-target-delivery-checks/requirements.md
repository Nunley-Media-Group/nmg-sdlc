# Defect Report: Canonicalize explicit pull_request_target delivery checks

**Issue**: #357
**Date**: 2026-09-03
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/284-resolve-missing-required-check-event-provenance/

---

## Reproduction

1. Observe a successful job-level PR check whose explicit event is `pull_request_target` and whose Actions run head SHA equals the PR head.
2. Build and classify the exact-head delivery snapshot.
3. Observe `evidence_incomplete_or_invalid` even though all checks passed and the PR is clean.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Exact-head `pull_request_target` provenance canonicalizes to the existing `pull_request` identity and remains in the snapshot. |
| **Actual** | Explicit `pull_request_target` is preserved, then rejected by classification's exact `pull_request` event requirement. |

**Version bump**: patch

## Acceptance Criteria

### AC1: Explicit exact-head pull-request-target provenance is canonicalized

**Given** a successful PR check explicitly reports `pull_request_target` and links to an Actions run whose head SHA equals the PR head
**When** delivery builds and classifies the exact-head snapshot
**Then** the check is retained with canonical `pull_request` provenance and does not by itself make delivery evidence invalid

### AC2: Unsafe explicit provenance still fails closed

**Given** a successful check reports `push`, `merge_group`, an unresolved empty event, a mismatched run head, or another non-PR event
**When** delivery builds and classifies the exact-head snapshot
**Then** the check is not canonicalized to `pull_request` and cannot make the snapshot merge-ready

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Resolve the linked Actions run for explicit `pull_request_target` checks and require its head SHA to equal the PR head before canonicalization. | Must |
| FR2 | Retain required and unfiltered review-policy checks in the snapshot. | Must |
| FR3 | Preserve fail-closed handling for push, merge_group, unresolved, malformed, unreadable, head-mismatched, and other non-PR evidence. | Must |
| FR4 | Preserve issue #284 missing-event enrichment behavior and per-run lookup caching. | Must |

## Out of Scope

- Changing consumer workflows or branch protection
- Allowing `pull_request_target` in the default contribution-gate workflow
- Dropping required or unfiltered checks
- Weakening exact-head, review, or merge safeguards

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #357 | 2026-09-03 | Initial defect report |
