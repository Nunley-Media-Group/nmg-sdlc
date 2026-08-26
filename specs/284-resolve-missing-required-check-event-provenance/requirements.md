# Defect Report: Resolve missing required-check event provenance

**Issue**: #284
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/195-move-exact-head-delivery-into-a-controller-with-on-demand-remediation/

---

## User Story

**As a** developer using exact-head delivery
**I want** missing aggregate-check event fields resolved from authoritative Actions runs
**So that** valid PR checks do not deadlock and push checks cannot masquerade as PR evidence

## Background

`gh pr checks --required` can return a successful aggregate check with an empty `event`. Delivery currently rejects it. Accepting the empty field would weaken provenance, so the controller must resolve the linked Actions run and bind its exact event and head SHA.

**Version bump**: patch

## Acceptance Criteria

### AC1: Missing event is resolved authoritatively

**Given** a required check has an empty event and an Actions run link
**When** delivery fetches the PR snapshot
**Then** it resolves that exact run
**And** requires the run head SHA to equal the PR head
**And** canonicalizes an exact `pull_request` or `pull_request_target` event to the existing `pull_request` check provenance

### AC2: Pull-request runs may pass

**Given** the resolved run event is `pull_request` or `pull_request_target`
**And** the run head equals the PR head
**When** delivery classifies the successful required check
**Then** the check may satisfy the existing provenance gate

### AC3: Unsafe resolutions fail closed

**Given** the link is malformed, the run is unreadable, the head differs, or the event is push, merge_group, empty, or unknown
**When** delivery classifies the check
**Then** provenance remains unresolved or non-PR
**And** delivery cannot merge

### AC4: Existing explicit provenance is unchanged

**Given** `gh pr checks` already returns a non-empty event
**When** delivery normalizes the check
**Then** it does not replace that event from another source

### AC5: Existing delivery safeguards remain

**Given** event enrichment completes
**When** delivery continues
**Then** duplicate identities, required configuration, readiness evidence, human review, exact-head merge, and issue-closure proof remain unchanged

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Enrich only missing events from links matching the repository Actions-run URL shape. | Must |
| FR2 | Fetch run `event` and `headSha` through argument-array GitHub CLI calls. | Must |
| FR3 | Accept and canonicalize only `pull_request` or `pull_request_target` enrichment for an exact PR-head match. | Must |
| FR4 | Leave malformed, unreadable, mismatched, or unsupported evidence fail-closed. | Must |
| FR5 | Cache one run lookup per run id within a snapshot. | Must |
| FR6 | Add stack-agnostic controller regressions. | Must |

## Out of Scope

- Accepting empty event fields directly.
- PennyScan-specific check names.
- Changing branch protection or workflow configuration.
- Weakening exact-head or review requirements.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #284 | 2026-08-26 | Approved amendment: exact-head `pull_request_target` is PR-scoped evidence and canonicalizes to the existing identity |
| #284 | 2026-08-26 | Initial approved bug-fix spec |
