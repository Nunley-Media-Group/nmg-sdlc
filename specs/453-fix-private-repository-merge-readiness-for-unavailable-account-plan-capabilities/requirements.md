# Requirements: Fix private-repository merge readiness for unavailable account-plan capabilities

**Issue**: #453
**Date**: 2026-10-03
**Status**: Approved
**Author**: RussellBTech
**Related Spec**: specs/407-wait-for-required-ci-before-merging-spec-only-prs/, specs/429-wait-through-stale-unstable-spec-pr-mergeability-after-checks-pass/

## User Story

**As a** developer publishing an approved specification in a private repository
**I want** explicit account-plan capability unavailability distinguished from unreadable applicable policy
**So that** publication evaluates the remaining policy and actual checks without weakening merge readiness.

## Background

In nmg-sdlc 3.26.0, approved-spec publication for `owner/private-consumer` fails with `pr_readiness_failed` after contribution CI passes when branch-rule discovery returns `gh: Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)`. The branch-rules request fails before check evaluation. Classic required-status-check protection discovery is a separate source with the same need for a narrow capability distinction. Implementation delivery queries required and all reported checks separately; it is a regression boundary, not a second reproduced failure.

## Acceptance Criteria

### AC1: Recognize explicit unavailable capability narrowly

**Given** branch-rule or classic required-status-check protection discovery returns HTTP 403 with the explicit diagnostic `Upgrade to GitHub Pro or make this repository public to enable this feature.`
**When** approved-spec publication evaluates readiness
**Then** only that discovery source is treated as unavailable on the account plan, and readiness continues through the remaining policy and check observations instead of failing solely on that diagnostic
**And** the decision does not depend on a repository-name exception.

### AC2: Keep ambiguous and unrelated failures closed

**Given** discovery returns an ordinary permission or authentication failure, a generic HTTP 403, an ambiguous missing-resource response, malformed data, or a network failure without the explicit account-plan capability evidence
**When** readiness evaluates that response
**Then** it does not treat the failure as absence of policy, does not authorize merge, and reports the discovery failure
**And** the existing explicitly identified unprotected-branch behavior remains unchanged.

### AC3: Preserve applicable policy from every available source

**Given** one discovery source explicitly reports unavailable capability while another source supplies applicable required checks or branch protection, or all policy discovery succeeds normally
**When** readiness evaluates the PR
**Then** all applicable requirements remain enforced, including expected checks that have not yet reported and explicit policy blockers
**And** an unavailable source never erases requirements obtained from another source.

### AC4: Preserve check and exact-head merge gates

**Given** capability discovery is unavailable on the account plan but PR checks and identity can still be observed
**When** publication evaluates successive snapshots
**Then** absent or pending checks remain non-passing, terminal failed checks remain failing, and unreadable or unknown check evidence remains fail-closed
**And** head, branch, base, PR state, draft state, and mergeability retain their existing gates
**And** only fresh successful checks and CLEAN readiness at the unchanged head can authorize the existing exact-head merge path.

### AC5: Preserve implementation-delivery readiness

**Given** implementation delivery observes required and all reported PR checks for a private repository, with either readable checks or a check-query failure
**When** its readiness path evaluates the observations
**Then** ordinary successful readiness continues to work and pending, failed, absent, malformed, or unreadable evidence retains its existing non-passing behavior
**And** the capability-discovery exception does not turn a failed check query into an empty successful check set or weaken verification, review, exact-head, or mergeability gates.

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Distinguish the explicit account-plan capability-unavailable response from all other failures in branch-rule and classic protection discovery. | Must |
| FR2 | Limit the exception to the unavailable discovery source; continue to enforce every applicable requirement learned from other sources. | Must |
| FR3 | Preserve required and reported check evaluation, no-check and pending handling, terminal failure handling, exact-head identity, and normal merge gates. | Must |
| FR4 | Keep implementation-delivery readiness and check-query failures fail-closed; do not propagate the discovery exception into unrelated GitHub operations. | Must |

## Out of Scope

- A new feedback command or feedback-management feature.
- Redesigning CI scheduling, check identities, or mergeability polling.
- Adding a repository-name allowlist or a general ignore-403 option.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #453 | 2026-10-03 | Initial feature spec |
