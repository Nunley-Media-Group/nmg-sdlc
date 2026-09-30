# Verification Report: Recognize already-delivered issues before dispatching START from a non-issue branch

**Date**: 2026-09-30
**Issue**: #447
**Reviewer**: architecture-reviewer (OMP verify worker)
**Scope**: Implementation verification against spec

**Verification head**: 2a5c7e3790e8047d886a33d3cb881b17720337da

---

## Executive Summary

The branch `447-recognize-already-delivered-issues-before-dispatching-start-from-a-non-issue-branch` contains no implementation. Its HEAD `2a5c7e3` is the spec-approval commit (`docs: approve spec for #447 (#450)`), `origin/main..HEAD` is empty, and the worktree is clean. `closedIssueDelivery()` does not exist in `scripts/sdlc-execute.mjs`, and `scripts/__tests__/sdlc-execute.test.mjs` has none of the required regression tests. Every delivery acceptance criterion except the preserved-behavior AC4 is unimplemented.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 1 |
| Architecture (SOLID) | 3 |
| Security | 3 |
| Performance | 3 |
| Testability | 2 |
| Error Handling | 2 |
| **Overall** | 2.3 |

### Implementation Status: Fail
**Total Issues**: 4

---

## Issue Scope

- Active issue: #447
- Spec: `specs/447-recognize-already-delivered-issues-before-dispatching-start-from-a-non-issue-branch`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3]; tasks [T001, T002]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":447,"specPath":"specs/447-recognize-already-delivered-issues-before-dispatching-start-from-a-non-issue-branch","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3"],"tasks":["T001","T002"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Not complete
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 447 --spec specs/447-… --base main --controller-run-id d39b82e3-8fa0-49a3-9153-b7940c91ea9a`
- Artifact: `.omp/sdlc/verification/447.json`
- Identity: head `2a5c7e3790e8047d886a33d3cb881b17720337da`, tree `clean`, spec `sha256:de3af557…e119`, steering `sha256:5ae9b281…68ad`
- Coverage: declared 2, recorded 2, complete `true`, missing/duplicate/unknown none
- Ceiling: **Fail**

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Delivered issue recognized off-branch; prints `#N: MERGED and CLOSED`, no worker, queue continues | Fail | `scripts/sdlc-execute.mjs:484-501`: on a non-issue branch the loop goes straight to `gh issue view N --json number,labels`, the label/dependency/spec admission, and `step = 'start'`. Nothing reads the issue's live state or closing PRs, so a delivered issue is still dispatched to START. `closedIssueDelivery` is absent (grep: no match). |
| AC2 | CLOSED without proof → exit 1 `issue_closed_undelivered: #N`, no worker | Fail | `issue_closed_undelivered` appears nowhere in `scripts/`. A CLOSED issue off-branch either fails with `#N has no spec-created label` or is dispatched to START. |
| AC3 | Ambiguous/unreadable evidence → `merged_pr_ambiguous: #N` / `delivery_evidence_unavailable: #N`, no worker | Fail | These codes appear only in the on-branch `completed()` (`scripts/sdlc-execute.mjs:193,197`), with no `: #N` suffix and only when the issue branch is checked out. The off-branch path never emits them. |
| AC4 | OPEN-issue admission and on-branch recognition preserved | Pass (unchanged code) | `scripts/sdlc-execute.mjs:480-487` is unchanged; existing tests "recognizes an exact-head merged PR and closed issue without a label or new worker" (`scripts/__tests__/sdlc-execute.test.mjs:291`) and "starts an explicit issue from a non-issue branch, then uses its new live branch" (`:300`) pass in `repository.tests`. This holds only because nothing changed; T002's new AC4 test does not exist. |

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Fail | No off-branch live-state or closing-PR read comes before admission |
| FR2 | Fail | No issue-side delivery proof (same-repo, MERGED, `mergedAt`, 40-hex merge commit, closing reference, head-branch parse) |
| FR3 | Fail | Reason codes `issue_closed_undelivered` / `merged_pr_ambiguous` / `delivery_evidence_unavailable` with `: #N` are not produced off-branch |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Correct the root cause in `scripts/sdlc-execute.mjs` | Incomplete | `closedIssueDelivery(cwd, run, issue)` is missing and is not called at the top of `if (!branchIssue && !failure)` |
| T002 | Behavioral regression coverage in `scripts/__tests__/sdlc-execute.test.mjs` | Incomplete | No `gh issue view … closedByPullRequestsReferences` helper and no AC1–AC4 tests |

---

## Architecture Assessment

There is no diff to review. The scores assess the current `runExecute` off-branch path against the approved design.

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 3 | The admission block mixes label, dependency, and spec admission; the design's module-private `closedIssueDelivery` helper would keep delivery proof separate, but it is missing |
| Open/Closed | 3 | The per-issue loop is modified in place; this is acceptable for a script-local controller |
| Liskov Substitution | 3 | N/A for a function-oriented module; the injected `run` keeps substitutability |
| Interface Segregation | 3 | `run(cmd, args, {cwd})` is a narrow seam |
| Dependency Inversion | 3 | `gh` is reached through the injected `run`, which the design reuses |

### Layer Separation

The script layer owns the controller routing, which is correct per structure steering. No boundary violation was found.

### Dependency Flow

Unchanged. The design reuses `succeeded`, `parsed`, `SHA`, and `parseIssueBranch`; none of that exists yet.

---

## Security Assessment

- [x] Authentication: delegated to `gh`
- [x] Authorization: N/A
- [ ] Input validation: the issue-side closing-PR evidence validation required by FR2 (same-repository filter, SHA shape, head-branch parse) is not implemented
- [x] Injection prevention: existing `gh` calls use argument arrays
- [x] Data protection: N/A

---

## Performance Assessment

- [x] Async patterns: N/A (synchronous CLI controller; bounded reads)
- [x] Caching: N/A
- [x] Resource management: no new resources
- [ ] Query optimization: the design's single extra `gh issue view` for OPEN issues is not present; nothing to assess

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | No | No |
| AC2 | Yes (SCN002) | No | No |
| AC3 | Yes (SCN003) | No | No |
| AC4 | Yes (SCN004) | Partial (pre-existing on-branch and OPEN-start tests only) | Yes (pre-existing) |

### Coverage Summary

- Feature files: 4 scenarios in `feature.gherkin`
- Step definitions: Missing (T002 Jest tests not written)
- Unit tests: `cd scripts && npm test -- --runInBand` exit 0 (entire existing suite; no #447 tests)
- Integration tests: none for #447

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Reason** | Skipped: `git diff origin/main...HEAD` is empty, so no plugin change exists under `workflows/`, `agents/`, or `scripts/` to exercise |
| **Recommendation** | After T001/T002 land, run the full gate again, including `repository.nmg-sdlc-smoke` |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (builtin.command `npm test -- --runInBand`, cwd `scripts`) | Pass | Provider summary `command exited 0` at head `2a5c7e37…` |
| `repository.nmg-sdlc-smoke` (project.nmg-sdlc-smoke) | Fail (recorded) | Provider summary `nmg-sdlc-smoke Herdr environment missing`. Cause: the runner was launched from a subprocess without `HERDR_ENV`, `HERDR_SOCKET_PATH`, or `HERDR_PANE_ID` (confirmed unset there and set in the worker pane shell). This is a launch-environment failure of this verification attempt, not a plugin defect. A real smoke experiment was intentionally not repeated: HEAD has no #447 change, so there is no plugin hypothesis to test (steering: Smoke Experiment Scope and Progress). |
| Skill inventory / plugin surface / skill exercise / skill-creator validation | N/A | No changed skill, reference, agent, or plugin-surface files |
| Git hygiene | Pass | Clean worktree; no diff |

**Gate Summary**: 1/2 registered gates passed, 1 failed, 0 incomplete

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None. The publication scope for verify allows writes only to `verification-report.md`, and the missing feature is implementation work, not a local finding. | — | — |

## Remaining Issues

### Critical Issues

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Architecture |
| **Location** | `scripts/sdlc-execute.mjs:484` |
| **Issue** | `closedIssueDelivery(cwd, run, issue)` (T001, design steps 1–8) is not implemented or called first in the off-branch admission block |
| **Impact** | AC1–AC3 / FR1–FR3 fail; an already-delivered issue on a non-issue branch is still dispatched to START and aborts the queue |
| **Reason Not Fixed** | Implementation is the implement stage's responsibility; the verify publication scope is limited to the report |

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Testing |
| **Location** | `scripts/__tests__/sdlc-execute.test.mjs` |
| **Issue** | T002 regression tests (AC1 delivered queue, AC2 undelivered, AC3 ambiguous/unreadable, AC4 OPEN-without-label) are absent |
| **Impact** | No failing-before/passing-after proof |
| **Reason Not Fixed** | Same as above |

### High Priority

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Error Handling |
| **Location** | `scripts/sdlc-execute.mjs:485-486` |
| **Issue** | A failed issue read off-branch reports `issue #N unavailable` rather than the required `delivery_evidence_unavailable: #N` |
| **Impact** | FR3 stable reason codes are missing |
| **Reason Not Fixed** | Part of T001 |

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Testing |
| **Location** | `repository.nmg-sdlc-smoke` |
| **Issue** | No real passing smoke result exists for this head |
| **Impact** | Full-green verification is impossible until the implementation lands and smoke runs in a Herdr-enabled environment |
| **Reason Not Fixed** | No plugin change exists to test; the smoke gate must be rerun after T001/T002 |

---

## Positive Observations

- The approved design is precise (an eight-step algorithm with exact reason codes, reusing the existing helpers) and limited to the off-branch path.
- The existing contract suite is green at the verification head.

---

## Recommendations Summary

### Before PR (Must)
- [ ] Implement T001 `closedIssueDelivery()` and call it first in the off-branch admission block
- [ ] Implement T002 regression tests and confirm AC1–AC3 fail before the fix
- [ ] Rerun the full registered gate (`repository.tests`, then real `repository.nmg-sdlc-smoke` from a Herdr-enabled environment)

### Short Term (Should)
- [ ] None

### Long Term (Could)
- [ ] None

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-execute.mjs` | 2 | Off-branch admission block lacks delivery proof |
| `scripts/__tests__/sdlc-execute.test.mjs` | 1 | Missing #447 regression tests |
| `specs/447-…/{requirements,design,tasks}.md`, `feature.gherkin` | 0 | All Approved, `**Issue**: #447` |

---

## Recommendation

**Major rework needed**

No implementation of #447 exists at the verification head. Return to implementation: complete T001 and T002, then run fresh full-gate verification.
