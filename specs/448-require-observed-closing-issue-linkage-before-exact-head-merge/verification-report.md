# Verification Report: Require observed closing-issue linkage before exact-head merge

**Date**: 2026-10-06
**Issue**: #448
**Reviewer**: architecture-reviewer (nmg-sdlc verify worker)
**Scope**: Implementation verification against spec
**Verification head**: 22e5c7ca55f5f090cce1017c3ae68bea9843fc18

---

## Executive Summary

The branch `448-require-observed-closing-issue-linkage-before-exact-head-merge` contains no implementation. Its HEAD (`22e5c7ca55f5f090cce1017c3ae68bea9843fc18`) equals `main` and `origin/main`; `git diff --stat main...HEAD` is empty and `git log main..HEAD` lists no commits. The only #448 commit is the approved spec (PR #456, merged). None of `closingLinkObserved`, `requireClosingLinkage` or `closing_linkage_unobserved` appears under `scripts/`, `workflows/` or `references/`. The defect is still present. `scripts/sdlc-deliver.mjs:1459-1466` runs `registeredGate`, then `writeSmokeDeliveryProof`, then `gh pr merge --squash --match-head-commit`, and only after that `reconcilePostMerge`, which is the only code that reads `closingIssuesReferences` (`scripts/sdlc-deliver.mjs:1115-1131`).

Both registered validations passed at this head (`repository.tests`, `repository.nmg-sdlc-smoke`; coverage 2/2 complete). They exercised the unchanged pre-fix code, so they do not prove any #448 acceptance criterion.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 1 |
| Architecture (SOLID) | 3 |
| Security | 3 |
| Performance | 4 |
| Testability | 2 |
| Error Handling | 1 |
| **Overall** | 2.3 |

### Implementation Status: Fail
**Total Issues**: 4

---

## Issue Scope

- Active issue: #448
- Spec: `specs/448-require-observed-closing-issue-linkage-before-exact-head-merge`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3]; tasks [T001, T002, T003]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":448,"specPath":"specs/448-require-observed-closing-issue-linkage-before-exact-head-merge","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3"],"tasks":["T001","T002","T003"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Not complete
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 448 --spec specs/448-… --base main --controller-run-id b754d265-edcb-44ef-97c7-598322f2036c`. It returned `ok: true` and `ceiling: null`.
- Artifact: `.omp/sdlc/verification/448.json`. Identity: head `22e5c7ca55f5f090cce1017c3ae68bea9843fc18`, steering `sha256:8cc2905a…`, spec `sha256:85ed3f87…`, `changedPaths: []`.
- Coverage: declared 2, recorded 2, complete `true`. Nothing is missing, duplicated or unknown.
- The steering artifact sets no ceiling. Status is capped at **Fail** because acceptance criteria and tasks are unimplemented.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Missing linkage blocks the merge (`closing_linkage_unobserved`, no merge, branch and PR intact) | Fail | `scripts/sdlc-deliver.mjs:1459-1462`: the merge is issued with no linkage read beforehand. `closing_linkage_unobserved` does not exist anywhere in `scripts/`, `workflows/` or `references/`. |
| AC2 | Linkage is read after the registered gate and before the merge command | Fail | `fetchSnapshot` and the merge-ready loop never request `closingIssuesReferences` before `gh pr merge`. The only read is in `reconcilePostMerge` (`scripts/sdlc-deliver.mjs:1115`), which runs after the merge. |
| AC3 | Deliver worker waits, re-observes, diagnoses and reruns with no numeric limit | Fail | `workflows/open-pr/WORKFLOW.md` and `workflows/open-pr/references/ci-monitoring.md` have no `closing_linkage_unobserved` guidance. The T003 evidence command (`workerPrompt({ step: 'deliver', issue: 42 })` must include `closing_linkage_unobserved` and `No numeric observation limit`) exited 1. |
| AC4 | Post-merge reconciliation is preserved (`delivery_linkage_unproven`, `Merged PR #P does not link issue #N`) | Partial | The existing behavior is still in place at `scripts/sdlc-deliver.mjs:1128-1131`. However, T001 did not extract the `closingLinkObserved` predicate, and the T002 regression test for AC4 does not exist. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Correct the root cause in `scripts/sdlc-deliver.mjs` | Incomplete | `closingLinkObserved` and `requireClosingLinkage` are absent, and nothing is called between `registeredGate` and `writeSmokeDeliveryProof`. |
| T002 | Behavioral regression coverage in `scripts/__tests__/sdlc-deliver.test.mjs` | Incomplete | There is no `closingReferences` fixture option and no `closing_linkage_unobserved` test (0 matches). |
| T003 | Deliver-worker guidance in the open-pr workflow and `ci-monitoring.md` | Incomplete | Neither paragraph exists, and the prompt-evidence command exits 1. |

---

## Architecture Assessment

The scores below apply to the unchanged delivery path, because no #448 change exists to review.

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 3 | `runDeliverUnlocked` combines discovery, gating, merging and reconciliation. The designed private `requireClosingLinkage` helper would keep the new precondition isolated, but it does not exist. |
| Open/Closed | 3 | Adding the precondition should need one call-site insertion. That has not been done. |
| Liskov Substitution | 4 | Not materially applicable. Handoff shapes stay consistent through `fail`/`writeHandoff`. |
| Interface Segregation | 3 | The `gh pr view` field lists are tailored per call. A pre-merge linkage read is missing. |
| Dependency Inversion | 3 | The injected `run` and `sleep` make the code testable. The linkage predicate is inlined in `reconcilePostMerge` instead of being a shared predicate. |

### Layer Separation

Script and workflow layers are separated correctly. The workflow layer has no worker contract for an unobserved-linkage condition.

### Dependency Flow

The deliver worker prompt inlines `workflows/open-pr/WORKFLOW.md`, so worker behavior for this failure can only change once T003 lands.

---

## Security Assessment

- [x] Authentication: unchanged. Uses the authenticated `gh` CLI.
- [x] Authorization: the exact-head merge uses `--match-head-commit`.
- [ ] Input validation: GitHub linkage state is not validated before an irreversible remote mutation (the merge).
- [x] Injection prevention: argument arrays are used for `gh` and `git`.
- [x] Data protection: no secrets are handled.

---

## Performance Assessment

- [x] Async patterns: bounded synchronous CLI calls.
- [x] Caching: not applicable.
- [x] Resource management: no leaks observed on this path.
- [x] Query optimization: the designed change adds only one `gh pr view` read before the merge. It is not present.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 (SCN001) | Yes | No | No |
| AC2 (SCN002) | Yes | No | No |
| AC3 (SCN003) | Yes | No | No (prompt-evidence command exit 1) |
| AC4 (SCN004) | Yes | No | No dedicated test; the existing behavior is unchanged |

### Coverage Summary

- Feature files: 4 scenarios in `feature.gherkin`
- Step definitions: Missing. The Jest cases specified in T002 are absent from `scripts/__tests__/sdlc-deliver.test.mjs`.
- `repository.tests` (`npm test -- --runInBand` in `scripts/`): passed (exit 0) at the verification head. It proves only the unchanged tree.

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Reason** | Not performed. `git diff main...HEAD` shows no change under `workflows/` or `agents/`, so there is no changed plugin surface to exercise. |
| **Recommendation** | After T003 lands, exercise the deliver worker prompt as specified in T003. |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (builtin.command) | Pass | `npm test -- --runInBand exited 0` at `22e5c7ca55f5f090cce1017c3ae68bea9843fc18` |
| `repository.nmg-sdlc-smoke` (project.nmg-sdlc-smoke) | Pass | Provisioned smoke issue #197 (spec PR #198 MERGED). `sdlc-execute run #197` returned start/implement/verify/deliver passed. PR #199 MERGED at `fa664154602dab9416de5b05b181f88277693ef2`, outside the empty pre-run baseline, and issue #197 CLOSED. |

**Gate Summary**: 2/2 gates passed, 0 failed, 0 incomplete. The gates do not cover the missing #448 implementation.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None | No fixes applied. The verify publication scope permits writes only to this report, and the missing implementation is not a small local verification fix. | — |

## Remaining Issues

### Critical Issues

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Error Handling |
| **Location** | `scripts/sdlc-deliver.mjs:1459-1466` |
| **Issue** | The exact-head merge is issued before closing linkage is observed (T001, AC1, AC2, FR1, FR2). |
| **Impact** | A PR without GitHub-computed closing linkage is merged irreversibly, then fails `delivery_linkage_unproven` with the issue still OPEN. |
| **Reason Not Fixed** | No implementation exists on the branch. This is implementation work outside the verify publication scope and is routed to implementation diagnosis. |

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Testing |
| **Location** | `scripts/__tests__/sdlc-deliver.test.mjs` |
| **Issue** | The T002 regression tests are absent (AC1, AC2, AC4). |
| **Impact** | No test protects the pre-merge linkage gate. |
| **Reason Not Fixed** | Depends on T001. Outside the verify publication scope. |

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Architecture |
| **Location** | `workflows/open-pr/WORKFLOW.md`, `workflows/open-pr/references/ci-monitoring.md` |
| **Issue** | The T003 deliver-worker guidance for `closing_linkage_unobserved` is absent (AC3, FR3). |
| **Impact** | The deliver worker has no non-terminal wait, re-observe, diagnose and rerun contract. |
| **Reason Not Fixed** | The edits are skill-bundled implementation outside the verify publication scope. |

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | SOLID |
| **Location** | `scripts/sdlc-deliver.mjs:1128-1129` |
| **Issue** | The `closingLinkObserved` predicate has not been extracted (part of T001 for AC4). |
| **Impact** | Without a single shared predicate, the pre-merge and post-merge linkage checks could drift apart. |
| **Reason Not Fixed** | Part of T001. |

---

## Positive Observations

- Post-merge reconciliation still fails `delivery_linkage_unproven` correctly when a merged PR lacks linkage.
- The registered gate and live smoke both passed with complete coverage at the exact head, so a correct T001–T003 change starts from a green baseline.

---

## Recommendations Summary

### Before PR (Must)
- [ ] Implement T001 exactly as specified in design.md Fix Strategy.
- [ ] Add the T002 Jest regression cases and run `npm --prefix scripts test -- --runInBand __tests__/sdlc-deliver.test.mjs`.
- [ ] Add the T003 workflow guidance through `skill://skill-creator`, then run the prompt-evidence command, `skill-inventory-audit.mjs --check` and `verify-plugin-surface.mjs`.
- [ ] Rerun the full registered gate at the new head.

### Short Term (Should)
- [ ] None.

### Long Term (Could)
- [ ] None.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-deliver.mjs` | 2 | The merge precedes the linkage read, and the predicate is not extracted. |
| `scripts/__tests__/sdlc-deliver.test.mjs` | 1 | T002 coverage is missing. |
| `workflows/open-pr/WORKFLOW.md` | 1 | T003 guidance is missing. |
| `workflows/open-pr/references/ci-monitoring.md` | 1 | T003 guidance is missing (counted with the item above). |

---

## Recommendation

**Major rework needed**

The branch head is identical to `main` and contains none of the approved T001–T003 changes. All four acceptance criteria are unproven: AC1–AC3 fail and AC4 is partial. The work returns to implementation diagnosis. After the changes land, the full registered gate must be rerun at the new head.
