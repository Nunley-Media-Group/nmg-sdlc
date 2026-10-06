# Tasks: Fix private-repository merge readiness for unavailable account-plan capabilities

**Issue**: #453
**Date**: 2026-10-03
**Status**: Approved
**Author**: RussellBTech
**Related Spec**: specs/407-wait-for-required-ci-before-merging-spec-only-prs/, specs/429-wait-through-stale-unstable-spec-pr-mergeability-after-checks-pass/

## Implementation Tasks

### T001: Classify unavailable policy discovery without weakening readiness

**File(s)**: `scripts/publish-approved-spec.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC1/FR1: implement the private diagnostic predicate and use it only for branch-rules and classic required-status-check protection results, as specified in design.md.
- AC2/FR1: preserve failure reporting for every nonmatching response and the existing explicitly unprotected-branch case.
- AC3/FR2: skip only the unavailable source's contribution; retain the union of every available source's requirements.
- AC4/FR3 and AC5/FR4: do not alter reported-check parsing, readiness identity or mergeability gates, or implementation-delivery production behavior.

### T002: Prove discovery classification and source-local requirements

**File(s)**: `scripts/__tests__/publish-approved-spec.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC1: add parameterized real-CLI fixture regressions for the explicit HTTP 403 diagnostic at branch rules, classic protection, and both sources; fresh successful checks and CLEAN readiness reach the existing exact-head merge path. The original branch-rules case fails without T001.
- AC2: parameterize each source over ordinary permission/authentication failure, generic 403, ambiguous 404, malformed successful data, and network failure; none authorizes merge. The explicit diagnostic with non-403 status also remains failing. Preserve the explicit unprotected-branch success case.
- AC3: exercise both directions of one unavailable source and an available source requiring an unreported check; no merge occurs until that required check passes. Include normal discovery and explicit merge-policy blocker controls.
- Evidence: run `npm --prefix scripts test -- --runInBand __tests__/publish-approved-spec.test.mjs` from the repository root; assert result reason codes, check observations, and absence or exact-head ordering of merge calls.

### T003: Prove publication check and identity gates under unavailable discovery

**File(s)**: `scripts/__tests__/publish-approved-spec.test.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- AC4: with unavailable policy discovery, cover empty and pending observations before fresh success, terminal failed checks, unknown states, malformed data, and unreadable required/all check queries. Assert none can authorize an early merge.
- AC4: cover changed head, head branch, base, PR number/state, draft state, and non-CLEAN mergeability; preserve existing rejection/wait outcomes and two fresh successful unchanged-head snapshots.
- AC4/FR3: successful fixture merge uses the exact observed unchanged head; preserve existing stale-UNSTABLE and delayed-check behavior rather than modifying polling or retry policy.
- Evidence: run `npm --prefix scripts test -- --runInBand __tests__/publish-approved-spec.test.mjs`; use existing sequenced fixture responses and command logs for observable transitions.

### T004: Prove implementation-delivery check failures stay closed

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC5/FR4: retain ordinary successful delivery-readiness fixtures and cover independently controlled pending, failed, malformed, and unreadable required/all-check responses. Prove absent configured/declared checks stay non-passing with existing `scripts/__tests__/pr-delivery-state.test.mjs` coverage; do not redefine no-check semantics. Reuse adequate cases rather than duplicating them.
- AC5: add separate required-check and all-check query failures containing the exact account-plan HTTP 403 diagnostic; neither authorizes merge or becomes an empty successful check set.
- AC5: existing verification, automated-review, changed-head, and mergeability tests retain their current non-passing boundaries; no delivery production-code change is needed.
- Evidence: run `npm --prefix scripts test -- --runInBand __tests__/sdlc-deliver.test.mjs __tests__/pr-delivery-state.test.mjs`; assert actual readiness results and no merge for failing cases.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #453 | 2026-10-03 | Initial feature tasks |
