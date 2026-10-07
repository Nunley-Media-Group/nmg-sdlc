# Verification Report: Require observed closing-issue linkage before exact-head merge

**Date**: 2026-10-06
**Issue**: #448
**Reviewer**: architecture-reviewer (nmg-sdlc verify worker)
**Scope**: Implementation verification against spec
**Verification head**: fd1975c6a734f002851bf066e2aa4408eaffb98e

---

## Executive Summary

Commit `fd1975c` implements T001–T003 as the approved design specifies. Ordinary delivery now reads the PR's live `closingIssuesReferences` after `registeredGate` and before `writeSmokeDeliveryProof` and `gh pr merge`. If no entry matches the issue number and the same-repository issue URL, delivery returns `closing_linkage_unobserved` without merging. Post-merge reconciliation uses the same extracted predicate and behaves as before. The open-pr workflow and `ci-monitoring.md` direct the deliver worker to wait, re-observe, diagnose and rerun, with no numeric limit.

Both registered validations passed at the exact head with complete coverage (2/2). The live smoke run delivered smoke issue #200 through `sdlc-execute`, and that run went through the new pre-merge linkage gate. With the pre-fix `sdlc-deliver.mjs`, the new regression tests fail with exactly the defect: the PR merges, then delivery fails `delivery_linkage_unproven`. With the fix they pass. One low-severity observation is outside the approved change set.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | 4.7 |

### Implementation Status: Pass
**Total Issues**: 1 (Low; outside approved scope)

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

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 448 --spec specs/448-require-observed-closing-issue-linkage-before-exact-head-merge --base main --controller-run-id b754d265-edcb-44ef-97c7-598322f2036c`. It returned `ok: true` and `ceiling: null`.
- Artifact: `.omp/sdlc/verification/448.json`. Identity: head `fd1975c6a734f002851bf066e2aa4408eaffb98e`, clean tree, steering `sha256:8cc2905a…`, spec `sha256:85ed3f87…`.
- Changed paths: `CHANGELOG.md`, `scripts/__tests__/sdlc-deliver.test.mjs`, `scripts/sdlc-deliver.mjs`, `workflows/open-pr/WORKFLOW.md`, `workflows/open-pr/references/ci-monitoring.md`, and this report.
- Coverage: declared 2, recorded 2, complete `true`. Nothing is missing, duplicated or unknown.
- No ceiling applies.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Missing linkage blocks the merge | Pass | `requireClosingLinkage` (`scripts/sdlc-deliver.mjs:1114-1129`) is called at `:1481`, between `registeredGate` (`:1480`) and `writeSmokeDeliveryProof`/`gh pr merge` (`:1482-1484`). If the link is absent, it calls `abortDelivery(fail(context, 'closing_linkage_unobserved', 'PR #P does not link issue #N; exact-head merge not attempted', null, [pr.url]))`. Jest `test.each` covers three cases: empty references, a cross-repository #42, and a same-repository #41. Each returns status 1 with that handoff and makes 0 merge calls. The PR and issue stay `OPEN`, and the branch `feature/42-delivery` remains both locally and at `origin`. |
| AC2 | Linkage is read after the gate and before the merge, then the merge proceeds | Pass | The same test sets the linked reference and reruns: status 0, a passed handoff, exactly one merge containing the current head, and the issue `CLOSED`. The last `gh pr view` before the merge requests `closingIssuesReferences`. Live: the `repository.nmg-sdlc-smoke` run went through this code path and merged smoke PR #202 at `f0f60219bf87444c9a28f3d4624762ff5750296f`, closing smoke issue #200. |
| AC3 | Worker waits and diagnoses with no fixed limit | Pass | The paragraph from the `workflows/open-pr/WORKFLOW.md` design was inserted verbatim, and the reference-reading sentence was extended. The `ci-monitoring.md` paragraph was inserted verbatim (checked against the quoted strings in design.md). The T003 prompt command exited 0 (`deliver worker prompt carries linkage guidance`). An OMP RPC dry-run exercise of the rendered deliver worker prompt treated the condition as non-terminal and made no numeric limit. It refused a direct merge, a force-push and handoff synthesis. On persistent failure it keeps the branch and PR and reports the gap (see Exercise Test Results). |
| AC4 | Post-merge reconciliation is preserved | Pass | `reconcilePostMerge` now calls `closingLinkObserved(pr, issue, issueData.url)`, which is the same predicate as before (`:1150`). The already-MERGED paths (`:1281`, `:1373`, `:1435`) do not call `requireClosingLinkage`. Jest: a delivered PR with references cleared fails `delivery_linkage_unproven` / `Merged PR #77 does not link issue #42`, and the merge count stays 1. The existing lost-acknowledgment test passes unchanged. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Correct the root cause | Complete | Both helpers match the design Fix Strategy exactly. The new code does not call `reconciliationFailure`, sleep, poll or count observations. |
| T002 | Behavioral regression coverage | Complete | Adds the `closingReferences` fixture option and setter, the AC1/AC2 `test.each` and the AC4 test. Fail-before is proven: in an isolated copy with `main:scripts/sdlc-deliver.mjs`, the 3 AC1/AC2 cases fail (received `delivery_linkage_unproven`) and AC4 passes. |
| T003 | Deliver-worker guidance | Complete | Both paragraphs are present. The prompt-evidence command, `skill-inventory-audit.mjs --check` and `verify-plugin-surface.mjs` all exit 0. |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | The new precondition is a private helper, and the call site adds one line. `runDeliverUnlocked` was already large. |
| Open/Closed | 4 | The precondition was added without changing the classifier or the shared snapshot. |
| Liskov Substitution | 5 | The handoff shapes still come from the shared `fail`/`writeHandoff`. |
| Interface Segregation | 4 | A dedicated minimal `--json` field list for the pre-merge read. |
| Dependency Inversion | 4 | The injected `run` keeps the helper testable. A single predicate is shared by the pre-merge and post-merge checks. |

### Layer Separation

The script enforces the precondition. The workflow layer gives the worker its behavior, and the classifier and execute controller are unchanged, which matches the Blast Radius in design.md.

### Dependency Flow

The deliver worker prompt inlines `workflows/open-pr/WORKFLOW.md` through `workerPrompt`. The new text reaches workers without any controller change.

---

## Security Assessment

- [x] Authentication: unchanged. Uses the authenticated `gh` CLI.
- [x] Authorization: the merge is still `--match-head-commit`. The pre-merge read also checks PR number, head and `OPEN` state.
- [x] Input validation: the PR URL and repository URL are validated with the same patterns as `reconcilePostMerge`. A cross-repository reference with the same number is rejected (tested).
- [x] Injection prevention: argument arrays are used for every `gh`/`git` call.
- [x] Data protection: no secrets are handled.

---

## Performance Assessment

- [x] Async patterns: one bounded synchronous `gh pr view` per merge attempt.
- [x] Caching: not applicable.
- [x] Resource management: no new processes or files on the failure path. No smoke proof is written before the abort.
- [x] Query optimization: minimal field list.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 (SCN001) | Yes | Yes (Jest `test.each`, 3 cases) | Yes |
| AC2 (SCN002) | Yes | Yes (same test, linked rerun) | Yes |
| AC3 (SCN003) | Yes | Runtime evidence: prompt-evidence command plus OMP exercise | Yes |
| AC4 (SCN004) | Yes | Yes (`a merged PR without closing linkage…`) | Yes |

### Coverage Summary

- Feature files: 4 scenarios
- Step definitions: Implemented in Jest (`scripts/__tests__/sdlc-deliver.test.mjs`)
- Focused suite: `npm --prefix scripts test -- --runInBand __tests__/sdlc-deliver.test.mjs` passed 27/27.
- Full suite: `repository.tests` (`npm test -- --runInBand` in `scripts/`) exited 0 at the verification head.

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | open-pr, as the rendered deliver worker prompt from `workerPrompt({ step: 'deliver', issue: 42 })` |
| **Test Project** | Disposable `nmg-sdlc-exercise-448-*` temp git project (removed afterwards) |
| **Exercise Method** | `node scripts/exercise-omp.mjs --cwd <project> -- <dry-run prompt + rendered deliver worker prompt>` (OMP RPC harness, this checkout loaded) |
| **Interactive gate handling** | N/A (automated worker) |
| **Duration** | 30 s, exit 0 |

### Captured Output Summary

The prompt gave the worker a failed `closing_linkage_unobserved` handoff for PR #77 and asked for its next actions under the dry-run contract. The worker classified the condition as non-terminal. It planned to wait with `gh pr checks 77` until nothing was pending, re-observe with `gh pr view 77 --json closingIssuesReferences,baseRefName,body,…`, and diagnose three causes: base branch versus default branch, a missing `Closes #42`, and an issue in another repository. It would rerun `sdlc-deliver.mjs --issue 42` only after linkage was observed or a diagnosed cause changed. It stated there is no numeric observation limit. It refused a direct `gh pr merge`, a force-push and handoff synthesis. If linkage could not be established, it would keep the branch and PR, leave the delivery-written failed handoff, and report the exact gap.

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC3 | Worker waits and diagnoses with no fixed limit | Pass | The answers to questions (1)–(5) in the exercise output match FR3 point by point. |

### Notes

GitHub operations were evaluated as a dry run, and the exercise made no remote mutation. The live merge path (AC2) is proven separately by the registered smoke run. `/sdlc-open-pr` was not run as a file command because `commands/sdlc-open-pr.md` is outside the approved change set (see Remaining Issues). The deliver worker receives the changed `WORKFLOW.md` through `workerPrompt`.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (builtin.command) | Pass | `npm test -- --runInBand exited 0` at `fd1975c6a734f002851bf066e2aa4408eaffb98e`, clean tree |
| `repository.nmg-sdlc-smoke` (project.nmg-sdlc-smoke) | Pass | Provisioned smoke issue #200 (spec PR #201 MERGED). The closing-PR baseline was empty. `sdlc-execute run #200` reported start, implement, verify and deliver as passed. The closing-PR proof shows PR #202 `MERGED` at `f0f60219bf87444c9a28f3d4624762ff5750296f`, outside the baseline, and issue #200 `CLOSED`. |
| Skill inventory | Pass | `skill-inventory-audit.mjs --check`: clean (90 items mapped) |
| OMP plugin surface | Pass | `verify-plugin-surface.mjs --root . --label repository` passed |
| Skill exercise | Pass | OMP RPC dry-run exercise (above) |
| Git hygiene | Pass | `git diff --check main...HEAD` exited 0 |

**Gate Summary**: 6/6 gates passed, 0 failed, 0 incomplete. Registered coverage: 2/2, complete.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None | No fixes were needed within the verify publication scope. | — |

## Remaining Issues

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Architecture |
| **Location** | `commands/sdlc-open-pr.md` |
| **Issue** | The standalone `/sdlc-open-pr` file command is a separately maintained summary of the open-pr workflow, and it has no `closing_linkage_unobserved` paragraph. It still points to `references/ci-monitoring.md` when checks fail, and that file now carries the guidance. |
| **Impact** | A manually invoked `/sdlc-open-pr` session gets less direct guidance for this condition. Delivery itself still fails closed and never merges. The execute deliver worker is unaffected because it inlines `WORKFLOW.md`. |
| **Reason Not Fixed** | The file is outside the approved Changes table and outside the verify publication scope, which allows writes only to this report. Recommend a follow-up issue. |

Note: the undefined `reconciliationFailure` call sites already existed and are explicitly out of scope in requirements.md. The new code does not use them.

---

## Positive Observations

- The design was implemented exactly, using a single shared predicate. Pre-merge and post-merge linkage checks cannot drift apart.
- The abort happens before `writeSmokeDeliveryProof`, so no pre-merge smoke receipt is written for an unmerged PR.
- The regression tests demonstrably fail on the pre-fix code and cover both cross-repository and wrong-issue references.
- The live smoke run exercised the new gate end to end, from linkage observed to exact-head merge to issue `CLOSED`.

---

## Recommendations Summary

### Before PR (Must)
- [ ] None.

### Short Term (Should)
- [ ] None.

### Long Term (Could)
- [ ] File a follow-up issue to add the `closing_linkage_unobserved` guidance to `commands/sdlc-open-pr.md`.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-deliver.mjs` | 0 | Helpers and call site match the design |
| `scripts/__tests__/sdlc-deliver.test.mjs` | 0 | T002 coverage is complete, with fail-before proven |
| `workflows/open-pr/WORKFLOW.md` | 0 | Design paragraph is verbatim |
| `workflows/open-pr/references/ci-monitoring.md` | 0 | Design paragraph is verbatim |
| `CHANGELOG.md` | 0 | `[Unreleased]` entry is accurate |
| `commands/sdlc-open-pr.md` | 1 | Not changed. Low, outside scope |

---

## Recommendation

**Ready for PR**

All four acceptance criteria, all three tasks and both registered validations pass at `fd1975c6a734f002851bf066e2aa4408eaffb98e`. Coverage is complete, and there is live smoke delivery proof. The only remaining item is a low-severity documentation gap outside the approved scope.
