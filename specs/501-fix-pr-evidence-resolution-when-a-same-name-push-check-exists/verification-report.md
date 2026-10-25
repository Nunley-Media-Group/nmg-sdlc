# Verification Report: PR-evidence resolution fails when a same-name push check exists

**Date**: 2026-10-25
**Issue**: #501
**Reviewer**: Claude Code (architecture-reviewer, verify worker)
**Scope**: Implementation verification against spec
**Verification head**: 4720679314756b894fa9a460ff1fdec57e8ba819

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | 5.0 |

### Implementation Status: Pass
**Total Issues**: 1 (low, outside verify write scope)

`evidenceForHead` now gives `resolveDeclaredCheck` only the observed checks whose `event` equals the declared item's `event`. A same-name `push` check can no longer make a `pull_request` declaration ambiguous, and it can never be recorded as evidence. The new regression tests reproduce the defect: on the pre-fix `scripts/sdlc-deliver.mjs`, AC1 and AC2 fail with `Delivery failed for #42: verification_not_ready`. With the fix, all 38 tests in `sdlc-deliver.test.mjs` pass. Both registered steering validations passed at the verification head.

---

## Issue Scope

- Active issue: #501
- Spec: `specs/501-fix-pr-evidence-resolution-when-a-same-name-push-check-exists`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5]; FR [FR1, FR2, FR3, FR4, FR5]; tasks [T001, T002]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":501,"specPath":"specs/501-fix-pr-evidence-resolution-when-a-same-name-push-check-exists","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5"],"tasks":["T001","T002"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

Runner: `sdlc-verify-steering.mjs --project . --issue 501 --spec specs/501-… --base main --controller-run-id 3c3fdbe4-1f43-47cd-a47c-73040c5b9a32`, exit 0, `ok: true`, `ceiling: null`.

| Field | Value |
|-------|-------|
| Artifact | `.nmg-sdlc/verification/501.json` |
| Head | `4720679314756b894fa9a460ff1fdec57e8ba819` (tree clean) |
| Steering hash | `sha256:d2c85d617a232d52b6ff3d3e362c89ca935fec3c0d431a2c8b845b6c63616b8f` |
| Spec hash | `sha256:256ef41d73ee38548807a26e55c53be77cdc2ed5cbc05808262912b3f290c630` |
| Coverage | declared 2, recorded 2, complete `true`; no missing, duplicate or unknown results |

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Same-name push check no longer blocks pull_request evidence | Pass | `scripts/sdlc-deliver.mjs:743-746` filters by `item.event` before resolving; test `AC1 a same-name push check does not block pull_request evidence` (status 0, one ready, one merge, the PR body has the pull_request link and not the push link). Fails on the pre-fix code. |
| AC2 | A push check is never counted as declared evidence | Pass | A push-only candidate set is filtered to empty → `resolveDeclaredCheck` returns `pending` → `return null`; test `AC2 …` expects `Draft PR #77 PR-only checks remain pending`, no ready/merge/marker. Fails on the pre-fix code. |
| AC3 | A missing declared-event check stays pending | Pass | Same pending branch; test `AC3 a missing pull_request check stays pending` |
| AC4 | Duplicate declared-event checks still fail closed | Pass | Two `pull_request` matches → `mismatch` → `throw new Error('verification_not_ready')` (`scripts/sdlc-deliver.mjs:748`); test `AC4 …` expects `Delivery failed for #42: verification_not_ready` |
| AC5 | Single-event resolution is preserved | Pass | `test.each` for bare `contract-tests` and qualified `CI / contract-tests` SUCCESS (merge), PENDING (pending summary), FAILURE (unresolved summary) |

### Functional Requirements

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | Event filter passed to `resolveDeclaredCheck` (`scripts/sdlc-deliver.mjs:745`) |
| FR2 | Pass | A check with a different event never reaches `result.push`; AC1/AC2 tests |
| FR3 | Pass | An empty filtered set → `pending` → `null`; AC2/AC3 tests |
| FR4 | Pass | `mismatch` still throws `verification_not_ready`; AC4 test |
| FR5 | Pass | `describe('draft PR-only evidence resolution')` in `scripts/__tests__/sdlc-deliver.test.mjs` |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Scope declared evidence resolution to the declared event | Complete | Filter added. The unreachable post-match `check.event !== item.event` guard is removed. `merge_blocking` branch unchanged. |
| T002 | Add draft-evidence regression coverage | Complete | `publishSatisfiedDraftEvidence(f, { name })` helper extracted. The original `a draft becomes mergeable only after …` test now uses it and passes. AC1–AC5 cases added. Red/green confirmed in a separate scratch worktree: pre-fix 2 failed (AC1, AC2) / 6 passed; post-fix 38/38. |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | The event scoping stays in `evidenceForHead`; `resolveDeclaredCheck` keeps one job: name resolution |
| Open/Closed | 5 | The shared resolver's interface is unchanged for its other callers (`pr-delivery-state.mjs`) |
| Liskov Substitution | 5 | N/A; there is no polymorphic surface |
| Interface Segregation | 5 | No new parameters on the shared resolver |
| Dependency Inversion | 5 | Uses the same pattern as `pr-delivery-state.mjs` (`checks.filter((check) => check.event === …)`) |

### Layer Separation

The change stays inside the delivery script layer. No workflow, reference, agent, or hooks-module change.

### Dependency Flow

Unchanged: `sdlc-deliver.mjs` → `verification-readiness.mjs#resolveDeclaredCheck`.

---

## Security Assessment

- [x] Authentication: unchanged (`gh` CLI)
- [x] Authorization: the fix narrows what counts as evidence. A push-event check can no longer satisfy `pull_request` provenance, which is a stricter fail-closed posture
- [x] Input validation: checks with a missing or unknown `event` (after `enrichMissingCheckEvents`) are filtered out and stay pending; they are never accepted
- [x] Injection prevention: no new command construction
- [x] Data protection: N/A

---

## Performance Assessment

- [x] Async patterns: N/A (synchronous CLI)
- [x] Caching: unchanged run-evidence cache
- [x] Resource management: one bounded array filter per declared item
- [x] Query optimization: no additional `gh` calls

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Yes (Jest) | Yes |
| AC2 | Yes (SCN002) | Yes (Jest) | Yes |
| AC3 | Yes (SCN003) | Yes (Jest) | Yes |
| AC4 | Yes (SCN004) | Yes (Jest) | Yes |
| AC5 | Yes (SCN005, 4 examples) | Yes (Jest `test.each`) | Yes |

### Coverage Summary

- Feature files: 5 scenarios (one outline with 4 examples)
- Step definitions: Implemented as Jest contract tests in `scripts/__tests__/sdlc-deliver.test.mjs`
- Unit tests: 8 new cases; full suite green via `repository.tests`
- Integration tests: live smoke delivery (below)

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Reason** | Not applicable: `git diff main...HEAD` touches no `workflows/` or `agents/` files. The change is limited to `scripts/sdlc-deliver.mjs`, its tests, and version and changelog artifacts. |
| **Recommendation** | None. The live smoke delivery covers the real execute → deliver path. |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (contract tests) | Pass | `npm test -- --runInBand` in `scripts/` exited 0 at head `4720679…` |
| `repository.nmg-sdlc-smoke` (live smoke) | Pass | Provisioned fresh smoke issue #263 (baseline: no closing PRs). `sdlc-execute run #263`: start, implement, verify and deliver all passed. Closing PR #265 is `MERGED` at `a932c42a062b0d597edf44047def627e95271eaa`, matching the pre-merge delivery proof, and issue #263 is `CLOSED`. |
| Skill inventory / plugin surface / skill-creator / skill exercise / prompt quality | N/A | No skill, reference, agent, or plugin-surface files changed |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |

**Gate Summary**: 3/3 applicable passed, 0 failed, 0 incomplete

---

## Fixes Applied

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| — | — | — | None required | — | — |

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Low | Docs | `CHANGELOG.md` `[4.4.7]` | The defect fix is filed under `### Changed`, but the preceding bug-fix release `[4.4.6]` uses `### Fixed` | The verify publication scope only allows writing `verification-report.md`. This is cosmetic and does not affect any AC. |

## Recommendation

Ready for PR.
