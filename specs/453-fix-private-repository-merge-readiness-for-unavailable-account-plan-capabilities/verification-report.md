# Verification Report: Fix private-repository merge readiness for unavailable account-plan capabilities

**Date**: 2026-10-06
**Issue**: #453
**Reviewer**: architecture-reviewer (nmg-sdlc verify worker)
**Scope**: Implementation verification against spec
**Verification head**: 1f4cefb607c505d8ea56cc7527532ed151d2db1e

---

## Executive Summary

The branch `453-fix-private-repository-merge-readiness-for-unavailable-account-plan-capabilities` has no implementation. `HEAD`, `main`, and `origin/main` all resolve to `1f4cefb607c505d8ea56cc7527532ed151d2db1e` (`docs: approve spec for #453 (#454)`). `git log origin/main..HEAD` is empty, so the scoped diff is empty. The only change since the prior delivery head `23690f5` is the approved spec directory. None of the four tasks was carried out. `scripts/publish-approved-spec.mjs:387` still fails closed through `readJson` on any non-success branch-rules response. The defect reported in #453 therefore remains.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 1 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 2 |
| Error Handling | 2 |
| **Overall** | 2.8 |

The architecture scores apply to the existing, unchanged discovery code. No new code exists to score.

### Implementation Status: Fail
**Total Issues**: 4

---

## Issue Scope

- Active issue: #453
- Spec: `specs/453-fix-private-repository-merge-readiness-for-unavailable-account-plan-capabilities`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":453,"specPath":"specs/453-fix-private-repository-merge-readiness-for-unavailable-account-plan-capabilities","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Not complete
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- `steering/manifest.json` loads with 4 managed modules, 3 snippets, and 1 extension (`project.nmg-sdlc-smoke`). It registers two required, always-applicable validations: `repository.tests` (`builtin.command`) and `repository.nmg-sdlc-smoke` (`project.nmg-sdlc-smoke`).
- `repository.tests` was run directly at the verification head with `npm test -- --runInBand` from `scripts/`. It passed: 49 suites passed, 1 skipped (50 total); 846 tests passed, 2 skipped (848 total); 261.9 s. This only shows that the unchanged baseline is green. It provides no evidence for #453.
- `sdlc-verify-steering.mjs` was not run, and `.omp/sdlc/verification/453.json` was not produced. The runner always runs the smoke gate. Plugin source at this head is byte-identical to the #452 delivery head `23690f5`, apart from `specs/453-*` (`git diff --stat 23690f5 HEAD` shows only the 4 spec files). A smoke run here would replay unchanged smoke with no plugin change or hypothesis to test. Both the verify workflow and steering forbid that. It would also use up a fresh `nmg-sdlc-smoke` issue without producing any diagnostic evidence.
- Coverage ceiling: **Incomplete**, because registered results are missing. The acceptance failures below take precedence, so the overall status is **Fail**.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Recognize the explicit account-plan HTTP 403 narrowly | Fail | No `isAccountPlanCapabilityUnavailable` predicate exists. `scripts/publish-approved-spec.mjs:387` passes the branch-rules result straight to `readJson(..., 'pr_readiness_failed')`, so the reported diagnostic still aborts publication. `scripts/publish-approved-spec.mjs:415-417` accepts only the exit-1 `Branch not protected` case for classic protection. A grep of `scripts/` finds no match for `Upgrade to GitHub Pro` or `make this repository public`. |
| AC2 | Keep ambiguous and unrelated failures closed | Fail | The behavior is fail-closed only because no exception exists. T002 requires parameterized regressions that pass only with T001, and none were added. |
| AC3 | Preserve applicable policy from every available source | Fail | The required source-local skip and union behavior is not implemented. Line 387 fails on the first unavailable source, so no union of sources is ever computed. No mixed-source fixture exists. |
| AC4 | Preserve check and exact-head merge gates | Fail | No tests cover discovery being unavailable (T003 not done). Existing readiness gates are unchanged, but the AC requires those gates to hold while discovery is unavailable, and that path cannot be reached. |
| AC5 | Preserve implementation-delivery readiness | Fail | `scripts/__tests__/sdlc-deliver.test.mjs` has no required-check or all-check query case carrying the account-plan HTTP 403 diagnostic (T004 not done). Delivery production code is unchanged, as the spec requires, but the required regression evidence is missing. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Classify unavailable policy discovery without weakening readiness | Incomplete | `scripts/publish-approved-spec.mjs` is unchanged from `main`. |
| T002 | Prove discovery classification and source-local requirements | Incomplete | `scripts/__tests__/publish-approved-spec.test.mjs` is unchanged. The fake `gh` rules and protection routes have no per-source error controls. |
| T003 | Prove publication check and identity gates under unavailable discovery | Incomplete | No unavailable-discovery snapshot sequences. |
| T004 | Prove implementation-delivery check failures stay closed | Incomplete | `scripts/__tests__/sdlc-deliver.test.mjs` is unchanged. |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | `expectedCheckNames` handles only policy discovery. The design places the new predicate next to it. |
| Open/Closed | 4 | The design changes only the two discovery decisions and leaves `readJson` and the command runner alone. |
| Liskov Substitution | 4 | Not applicable beyond the uniform command-result shape. |
| Interface Segregation | 4 | No public CLI or schema change is planned. |
| Dependency Inversion | 4 | The fake `gh` fixture boundary is used consistently. |

### Layer Separation

The script layer owns readiness classification. The design keeps the exception private to `scripts/publish-approved-spec.mjs` and leaves `scripts/sdlc-deliver.mjs` production code unchanged, which fits the steering layer table. Nothing has been implemented to check against it.

### Dependency Flow

No new dependencies. The existing code depends only on `run('gh', [...])` argument arrays.

---

## Security Assessment

- [x] Authentication: unchanged; GitHub authentication goes through `gh`.
- [x] Authorization: merge is still blocked on discovery failure (fail-closed). Being fail-closed is not the same as being correct here.
- [x] Input validation: the PR URL repository identity is validated by regex at `scripts/publish-approved-spec.mjs:384`.
- [x] Injection prevention: arguments are passed as arrays, and `encodeURIComponent(base)` is applied to the base.
- [x] Data protection: no secrets are handled.

---

## Performance Assessment

- [x] Async patterns: not changed.
- [x] Caching: not applicable.
- [x] Resource management: discovery makes two bounded `gh api` calls per snapshot.
- [x] Query optimization: not changed.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | No | No |
| AC2 | Yes (SCN002) | No | No |
| AC3 | Yes (SCN003) | No | No |
| AC4 | Yes (SCN004) | No | No |
| AC5 | Yes (SCN005) | No | No |

### Coverage Summary

- Feature files: 5 scenarios in `feature.gherkin`.
- Step definitions / Jest regressions: missing for every scenario.
- Full suite at the verification head: 846 passed, 2 skipped, 0 failed (baseline only).

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Reason** | No exercise was run. The diff under `workflows/` and `agents/` is empty, and the scoped change is a script-level fix that has not been implemented. |
| **Recommendation** | After implementation, prove the change with the T002–T004 fake-`gh` CLI fixtures. |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (contract tests) | Pass (direct run; no runner artifact) | `npm test -- --runInBand` exited 0: 49/50 suites passed (1 skipped); 846/848 tests passed (2 skipped). |
| `repository.nmg-sdlc-smoke` | Incomplete | Not run, to avoid an unchanged smoke replay. Plugin source equals the #452 head `23690f5`, so there is no #453 change or hypothesis to test. |
| Skill inventory / plugin surface / skill-creator / skill exercise / prompt quality | Not applicable | No changes under `workflows/`, `references/`, `agents/`, or the plugin surface. |
| Git hygiene | Pass | The scoped diff is empty, so `git diff --check` has nothing to flag. |

**Gate Summary**: 1/2 registered gates passed, 0 failed, 1 incomplete (registered steering artifact not produced)

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None | None. The verify publication scope allows writes only to this report, and the missing work is the full implementation for T001–T004, not a local finding. | — |

## Remaining Issues

### Critical Issues

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Error Handling |
| **Location** | `scripts/publish-approved-spec.mjs:387` |
| **Issue** | A branch-rules HTTP 403 with `Upgrade to GitHub Pro or make this repository public to enable this feature.` still fails publication with `pr_readiness_failed` (AC1, AC3, FR1, FR2). |
| **Impact** | Approved-spec publication still fails in private repositories on plans without the branch-rules capability. |
| **Reason Not Fixed** | Implementation is the job of the implement step (T001). Verify can write only its report. |

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Error Handling |
| **Location** | `scripts/publish-approved-spec.mjs:415-417` |
| **Issue** | Classic required-status-check protection does not recognize the same explicit diagnostic (AC1, FR1). |
| **Impact** | The second discovery source fails the same way. |
| **Reason Not Fixed** | Implementation task T001. |

### High Priority

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Testing |
| **Location** | `scripts/__tests__/publish-approved-spec.test.mjs` |
| **Issue** | No fixtures for unavailable discovery, nonmatching failures, mixed sources, or check and identity gates (AC2–AC4, T002, T003). |
| **Impact** | Nothing proves that the narrow exception is narrow or that it preserves the gates. |
| **Reason Not Fixed** | Implementation tasks T002 and T003. |

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Testing |
| **Location** | `scripts/__tests__/sdlc-deliver.test.mjs` |
| **Issue** | No required-check or all-check query failure cases carrying the account-plan diagnostic (AC5, T004). |
| **Impact** | Nothing guards delivery readiness against inheriting the exception. |
| **Reason Not Fixed** | Implementation task T004. |

### Medium Priority

None.

### Low Priority

None.

---

## Positive Observations

- The baseline suite is fully green, so implementation starts from a clean state.
- The current behavior fails closed, so the defect cannot authorize an unsafe merge.

---

## Recommendations Summary

### Before PR (Must)
- [ ] Implement T001 in `scripts/publish-approved-spec.mjs` as designed: a private exact-diagnostic predicate, a source-local skip, and the union of available sources.
- [ ] Add the T002/T003 publication fixtures and the T004 delivery fixtures.
- [ ] Re-run the full registered gate, including the `repository.nmg-sdlc-smoke` experiment, against the changed head.

### Short Term (Should)
- None.

### Long Term (Could)
- None.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/publish-approved-spec.mjs` | 2 | `expectedCheckNames` lines 383-419 unchanged |
| `scripts/__tests__/publish-approved-spec.test.mjs` | 1 | No #453 cases |
| `scripts/__tests__/sdlc-deliver.test.mjs` | 1 | No #453 cases |
| `steering/manifest.json` | 0 | Valid; 2 required validations |

---

## Recommendation

**Major rework needed**

The spec was approved, but no implementation reached the branch. Send the issue back to implementation for T001–T004, then run the full registered gate on the new head.
