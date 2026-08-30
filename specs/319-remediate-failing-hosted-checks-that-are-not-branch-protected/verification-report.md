# Verification Report: Remediate failing hosted checks that are not branch-protected

**Date**: 2026-08-30
**Issue**: #319
**Reviewer**: Codex
**Scope**: Implementation verification against approved defect specification

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **4.8** |

### Implementation Status: Pass

**Total Issues**: 0

The delivery snapshot now always collects unfiltered hosted checks, merges every distinct `name` and `event` identity with the required-check set, and preserves the complete unfiltered set for exact-head evidence. Focused controller and classifier regressions prove that a failed non-required check overrides `UNSTABLE`, emits remediation without sleeping, pending checks still poll, and a successful `CLEAN` head remains merge-ready. Both required steering validations passed with complete coverage.

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.omp/sdlc/verification/319.json`
- Head: `47a30fbbab62ef21d09a5e6b8bde436632fda6d5`
- Coverage: 2 declared, 2 recorded, complete; no missing, duplicate, or unknown results
- Ceiling: none
- Required results: `repository.tests` passed; `repository.nmg-sdlc-smoke` passed

## Issue Scope

- Active issue: #319
- Spec: `specs/319-remediate-failing-hosted-checks-that-are-not-branch-protected`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1]; FR [FR1, FR2]; tasks [T001, T002]; scenarios [SCN001]
- Regression: AC [AC2]; FR [FR3]; scenarios [SCN002]

<!-- nmg-sdlc-issue-scope: {"issueNumber":319,"specPath":"specs/319-remediate-failing-hosted-checks-that-are-not-branch-protected","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1"],"functionalRequirements":["FR1","FR2"],"tasks":["T001","T002"],"scenarios":["SCN001"]},"regression":{"acceptanceCriteria":["AC2"],"functionalRequirements":["FR3"],"scenarios":["SCN002"]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | A failed non-required hosted check produces exit 3 remediation with the failed check and does not remain in the poll loop. | Pass | `scripts/sdlc-deliver.mjs:985-1032`; `scripts/__tests__/sdlc-deliver.test.mjs:713-749`; focused Jest run passed. |
| AC2 | Pending and successful classifications plus human review, `CHANGES_REQUESTED`, required-check failure, empty-required-check, and GraphQL behavior remain intact. | Pass | `scripts/__tests__/sdlc-deliver.test.mjs:751-802`; `scripts/__tests__/pr-delivery-state.test.mjs:66-93`; focused 61-test run and full steering test gate passed. |

## Regression Obligations

- [x] AC2 / FR3 / SCN002: pending non-required checks sleep without merging or remediation, then proceed after success.
- [x] AC2 / FR3 / SCN002: successful exact-head `CLEAN` snapshots remain `merge_ready`.
- [x] AC2 / FR3 / SCN002: the focused controller and classifier suites preserve human-review, `CHANGES_REQUESTED`, required-check-failure, empty-required-check stderr, and GraphQL thread paths.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Include every hosted check in the delivery snapshot | Complete | Required checks remain first; unfiltered checks are always fetched and merged by `name\0event`; `evidenceChecks` remains complete. |
| T002 | Add `UNSTABLE` and non-required-failure regressions | Complete | Controller, pending-path, argument-vector, distinct-event, and classifier regressions are present. |
| T003 | Verify no regressions | Complete | Focused command passed 61/61 tests; deterministic full-suite gate passed. |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Snapshot collection remains in `fetchSnapshot`; classification remains in `classifyPrDeliveryState`. |
| Open/Closed | 4 | Existing normalization and enrichment contracts are reused; one core snapshot path necessarily changed. |
| Liskov Substitution | 5 | No subtype or substitutability contract changed. |
| Interface Segregation | 5 | The snapshot shape gains no new consumer-facing interface; existing check records are populated more completely. |
| Dependency Inversion | 5 | Command execution remains injected through `run`, and fixtures exercise behavior without live GitHub mutation. |

**SOLID score**: 5/5

### Layer Separation

The fix respects the existing boundary: `sdlc-deliver.mjs` collects GitHub evidence and `pr-delivery-state.mjs` classifies it. No new `UNSTABLE` special case was added to the classifier.

### Dependency Flow

The controller continues to depend on normalized snapshot data. Tests inject command results through existing fixtures, so production command execution remains isolated from classification.

## Security Assessment

**Score**: 5/5

- Authentication and authorization: not affected.
- Input validation: issue and PR values continue as argument-array elements.
- Injection prevention: no shell interpolation was introduced.
- Data protection: no secrets or new persisted sensitive data.
- Exact provenance remains fail-closed: checks without `pull_request` event provenance cannot authorize delivery.

## Performance Assessment

**Score**: 4/5

Every snapshot now performs one additional unfiltered `gh pr checks` request. This is the required evidence source for FR1. Results reuse the same run-evidence cache, and merging is bounded linear work over returned checks. The calls remain sequential because the approved contract requires the required-check request first.

## Testability Assessment

**Score**: 5/5

The command runner, sleep behavior, check fixtures, PR views, and GitHub responses remain injectable. Regression tests directly observe exit status, remediation payload, sleep count, merge attempts, command argument vectors, and classifier reason codes.

## Error Handling Assessment

**Score**: 5/5

Both required and unfiltered check responses use the same fail-closed `parseChecksResult` path and event enrichment. Invalid command status, empty JSON, malformed JSON, incomplete provenance, and GraphQL failures remain explicit and machine-classified; no error is swallowed.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 / SCN001 | Yes | Jest behavioral equivalent | Yes |
| AC2 / SCN002 | Yes | Jest behavioral equivalent | Yes |

### Coverage Summary

- Feature files: 1 file, 2 scenarios
- Step definitions: implemented as repository-standard Jest behavioral tests
- Focused tests: 61 passed, 0 failed across 2 suites
- Full repository tests: passed through `repository.tests`
- Git hygiene: `git diff --check` exited 0

No workflow or agent paths changed, so a changed-skill `/sdlc-NAME` exercise was not applicable. The always-required consumer-project exercise ran through the steering provider and passed.

## Real Smoke Lifecycle Evidence

| Field | Evidence |
|-------|----------|
| Provider | `repository.nmg-sdlc-smoke` |
| Repository | `https://github.com/Nunley-Media-Group/nmg-sdlc-smoke` |
| Method | `exercise-omp /sdlc-status --json` with this checkout loaded |
| Status | Passed |
| Observable contract | stdout JSON returned `nextAction.command` as `/sdlc-draft-issue` |
| Artifact | `.omp/sdlc/verification/319.json` result `repository.nmg-sdlc-smoke` |

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` | Pass | Deterministic provider ran `npm test -- --runInBand`; exit 0. |
| `repository.nmg-sdlc-smoke` | Pass | Live smoke clone returned valid `/sdlc-status --json` with `/sdlc-draft-issue` next action. |

**Gate Summary**: 2/2 passed, 0 failed, 0 incomplete

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| None | — | — | No inline verification finding required a fix. | — | — |

## Remaining Issues

None.

## Positive Observations

- The implementation fixes the evidence boundary rather than special-casing `UNSTABLE`.
- The distinct `name\0event` key preserves same-name checks from different GitHub events, which the classifier then rejects safely when provenance is not `pull_request`.
- Regression coverage observes controller behavior, not only helper output.
- Version and changelog artifacts consistently describe the patch release.

## Recommendations Summary

### Before PR (Must)

- [x] No remaining local obligation.

### Short Term (Should)

- [x] No follow-up required for this defect.

### Long Term (Could)

- [x] No architectural follow-up required.

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-deliver.mjs` | 0 | Snapshot evidence collection and merge logic satisfy T001. |
| `scripts/__tests__/sdlc-deliver.test.mjs` | 0 | Controller and pending-path regressions satisfy T002/T003. |
| `scripts/__tests__/pr-delivery-state.test.mjs` | 0 | Classification precedence regression satisfies T002. |
| `scripts/sdlc-execute.mjs` | 0 | Additional review remediation fails closed on unreadable checkpoints. |
| `scripts/__tests__/sdlc-execute.test.mjs` | 0 | Covers the additional checkpoint hardening. |
| `CHANGELOG.md`, `VERSION`, `package.json` | 0 | Patch release artifacts are synchronized. |

---

## Recommendation

**Ready for PR**

All approved delivery and regression obligations pass. Deterministic steering coverage is complete with no ceiling, the full repository gate and live consumer smoke passed, focused regressions passed 61/61 tests, and no unresolved architecture or acceptance finding remains.
