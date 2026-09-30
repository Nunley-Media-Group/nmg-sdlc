# Verification Report: Recognize already-delivered issues before dispatching START from a non-issue branch

**Date**: 2026-09-30
**Issue**: #447
**Reviewer**: architecture-reviewer (OMP verify worker)
**Scope**: Implementation verification against spec

**Verification head**: 892ce4ec160000b7e13a469c86ea9ffabbe55e0e

---

## Executive Summary

Commit `892ce4e` implements the approved design. It adds a module-private `closedIssueDelivery(cwd, run, issue)` directly after `completed()` in `scripts/sdlc-execute.mjs` and calls it as the first statement of the off-branch admission block. A delivered issue prints `#N: MERGED and CLOSED` and breaks to the next queued issue. `issue_closed_undelivered`, `merged_pr_ambiguous`, and `delivery_evidence_unavailable` reach the existing `fail()` path as `<reasonCode>: #N` with no worker. The nine new regression tests pass at HEAD. All eight AC1–AC3 tests fail against the pre-fix `main` controller. Both registered validations passed at the exact head, including a real `repository.nmg-sdlc-smoke` delivery of smoke issue #191 by this checkout's execute controller.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | 4.5 |

### Implementation Status: Pass
**Total Issues**: 1 (Low, non-blocking)

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

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 447 --spec specs/447-… --base main --controller-run-id d39b82e3-8fa0-49a3-9153-b7940c91ea9a` (exit 0, `ok: true`)
- Artifact: `.omp/sdlc/verification/447.json`, generated `2026-09-30T16:43:55.483Z`
- Identity: head `892ce4ec160000b7e13a469c86ea9ffabbe55e0e`, tree `clean`, spec `sha256:de3af557…e119`, steering `sha256:5ae9b281…68ad`
- Changed paths vs `main`: `CHANGELOG.md`, `README.md`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/sdlc-execute.mjs`, and this report
- Coverage: declared 2, recorded 2, complete `true`, missing/duplicate/unknown none
- Ceiling: none. Both required validations report `passed` with evidence.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Delivered issue recognized off-branch; prints `#N: MERGED and CLOSED`, no worker, queue continues | Pass | `scripts/sdlc-execute.mjs:520-524` calls `closedIssueDelivery` first in `if (!branchIssue && !failure)` and breaks on `'delivered'`. Proof in `:208-241` covers same-repo filtering (`:223-225`), MERGED selection, `mergedAt`, 40-hex `SHA` merge commit, closing reference, and `parseIssueBranch(headRefName)`. Test "recognizes delivered issues off-branch without a worker and continues the queue": `#42 #43` returns status 0, stdout `#42: MERGED and CLOSED\n#43: MERGED and CLOSED\n`, and `starts: []`. The branch stays `main`, and the unreadable cross-repo reference #77 is never read. |
| AC2 | CLOSED without proof exits 1 with `issue_closed_undelivered: #N` and no worker | Pass | `:233` covers zero merged PRs, and `:238-239` covers a missing closing reference or an issue-branch mismatch. Tests cover "no closing pull request" and "only an open closing pull request": stderr `issue_closed_undelivered: #42\n`, status 1, `starts: []`. |
| AC3 | Ambiguous or unreadable evidence exits 1 with `merged_pr_ambiguous: #N` or `delivery_evidence_unavailable: #N` and no worker | Pass | `:234` handles ambiguity. `:212-214`, `:216-219`, `:220-222`, `:229-230`, and `:236-237` handle unavailable evidence. Tests cover two merged PRs, a failed issue read, missing `closedByPullRequestsReferences`, a failed PR read, and a merged PR missing `mergedAt`. Each returns the exact stderr, status 1, and `starts: []`. |
| AC4 | OPEN-issue admission and on-branch recognition preserved | Pass | `:215` returns `'open'`, and the unchanged label, dependency, and spec admission at `:525-532` follows. The on-branch `completed()` path at `:516-519` is untouched. Test "keeps spec-created label admission for an open off-branch issue" gives stderr `#42 has no spec-created label\n` with no starts. The pre-existing tests "starts an explicit issue from a non-issue branch, then uses its new live branch" and "recognizes an exact-head merged PR and closed issue without a label or new worker" pass. Live smoke also exercised the OPEN off-branch path: `#191: start passed … MERGED and CLOSED`. |

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | Live state and closing PRs are read before the `number,labels` admission read. A CLOSED issue decision needs no local branch or label (`:520-524`). |
| FR2 | Pass | Same repo (case-insensitive `nameWithOwner`), `state === 'MERGED'`, string `mergedAt`, `SHA.test(mergeCommit.oid)`, a closing reference containing the issue, and a head branch that parses to the issue (`:223-239`) |
| FR3 | Pass | Three stable reason codes with `: #N`. Thrown errors reach the existing catch→`fail()` before any pane, git, or GitHub mutation. Tests assert `starts: []`. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Correct the root cause in `scripts/sdlc-execute.mjs` | Complete | Implements the eight-step algorithm and reuses `succeeded`, `parsed`, `SHA`, and `parseIssueBranch`. It is the first statement of the off-branch block. |
| T002 | Behavioral regression coverage | Complete | Adds the `issueDeliveryRun` helper and nine tests covering AC1–AC4. Focused run: 32/32 pass. Pre-fix check: `main`'s controller with the HEAD test file in a disposable worktree gave 8 failed (all AC1–AC3 tests) and 24 passed. |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | One focused function owns issue-side delivery proof. `sdlc-execute.mjs` is already a large controller module (779 lines), a pre-existing condition. |
| Open/Closed | 4 | The existing on-branch `completed()` is unchanged. The new proof is additive. |
| Liskov Substitution | 4 | The injected `run` seam keeps fake and real `gh` interchangeable |
| Interface Segregation | 4 | Narrow `(cwd, run, issue)` signature with a two-value return |
| Dependency Inversion | 4 | All GitHub access goes through the injected `run`, with no direct process spawning |

### Layer Separation

Routing logic stays in the scripts layer, consistent with structure steering. No workflow, agent, or reference files changed.

### Dependency Flow

The change reuses existing module helpers and `parseIssueBranch` from `sdlc-status.mjs`. It introduces no new imports or dependencies.

---

## Security Assessment

- [x] Authentication: delegated to the `gh` CLI
- [x] Authorization: read-only `gh` reads; no mutation on any failure path
- [x] Input validation: every GitHub value is shape-checked (number identity, state enum, reference shape, repo slug regex, SHA regex, head-branch parse). Cross-repository references are ignored and never read.
- [x] Injection prevention: argument arrays only; the issue and PR numbers are safe integers passed as `String(n)`
- [x] Data protection: errors expose only the reason code and issue number

---

## Performance Assessment

- [x] Async patterns: synchronous CLI controller, consistent with the module
- [x] Caching: N/A
- [x] Resource management: reads are bounded by the de-duplicated same-repo closing references
- [x] Query optimization: an OPEN issue costs one extra `gh issue view`, as the design accepts. A CLOSED issue costs one repo read plus one PR read per same-repo reference.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Yes (Jest) | Yes |
| AC2 | Yes (SCN002) | Yes (Jest, 2 cases) | Yes |
| AC3 | Yes (SCN003) | Yes (Jest, 5 cases) | Yes |
| AC4 | Yes (SCN004) | Yes (new OPEN test + 2 pre-existing tests) | Yes |

### Coverage Summary

- Feature files: 4 scenarios in `feature.gherkin`
- Step definitions: Implemented as Jest tests in `scripts/__tests__/sdlc-execute.test.mjs`
- Unit tests: `npm test -- --runInBand sdlc-execute.test.mjs` gave 32/32 pass. The full suite gave 49 suites passed, 1 skipped; 843 tests passed, 2 skipped (845 total).
- Skips: pre-existing opt-in `RUN_EXERCISE_TESTS` exercise suite and a Windows-only junction test. No unexpected skips.
- Integration tests: live smoke (below)

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Reason** | Not applicable. The diff touches no `workflows/`, `agents/`, `references/`, `src/`, or plugin-manifest files, so no skill exercise fixture applies. The changed controller path was exercised live by `repository.nmg-sdlc-smoke`. |
| **Recommendation** | None |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (builtin.command `npm test -- --runInBand`, cwd `scripts`) | Pass | `command exited 0` at head `892ce4ec…`: 49 suites passed and 1 skipped; 843 tests passed and 2 skipped |
| `repository.nmg-sdlc-smoke` (project.nmg-sdlc-smoke) | Pass | `nmg-sdlc-smoke delivered #191`. Provisioned smoke issue #191 through real `/sdlc-draft-issue` and `/sdlc-write-spec` in a provider-owned Herdr pane (spec PR #192 MERGED). Pre-run closing-PR baseline was empty. `sdlc-execute run #191` gave `start passed / implement passed / verify passed / deliver passed / MERGED and CLOSED`. Proof: issue #191 CLOSED; PR #193 MERGED with `headRefOid` `565633da4eee36440e75418de0aef4c57fab211f` |
| Skill inventory / plugin surface / skill exercise / skill-creator validation | N/A | No skill, reference, agent, or plugin-surface files changed |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |

**Gate Summary**: 2/2 registered gates passed, 0 failed, 0 incomplete

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None required | — | — |

## Remaining Issues

### Critical Issues
None.

### High Priority
None.

### Medium Priority
None.

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Testing |
| **Location** | `scripts/__tests__/sdlc-execute.test.mjs` |
| **Issue** | Some implemented `closedIssueDelivery` branches have no dedicated test: a merged PR whose head branch belongs to another issue, a merged PR without a closing reference to the issue, only cross-repository references, and a failed `gh repo view`. |
| **Impact** | A future regression in those branches would not be caught. The code is correct by inspection (`:220-225`, `:238-239`). |
| **Reason Not Fixed** | Not required by T002's acceptance list. The verify publication scope allows writes only to this report. |

---

## Positive Observations

- The design is followed step for step. Helper reuse avoids a second delivery-proof convention.
- The fail-closed ordering is sound: every malformed or unreadable read stops before admission, with no pane or mutation.
- The pre-fix/post-fix regression proof is exact: 8 targeted failures on `main` and 32/32 at HEAD.
- README and CHANGELOG `[Unreleased]` document the new stop codes.

---

## Recommendations Summary

### Before PR (Must)
- [x] None

### Short Term (Should)
- [ ] Optionally add tests for the head-branch mismatch, missing closing reference, cross-repo-only, and repo-read-failure branches

### Long Term (Could)
- [ ] None

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-execute.mjs` | 0 | `closedIssueDelivery` and its call site |
| `scripts/__tests__/sdlc-execute.test.mjs` | 1 (Low) | Nine new regression tests |
| `README.md`, `CHANGELOG.md` | 0 | User-facing behavior documented |
| `specs/447-…/{requirements,design,tasks}.md`, `feature.gherkin` | 0 | All `**Status**: Approved`, `**Issue**: #447` |

---

## Recommendation

**Ready for PR**

Every delivery AC, FR, task, and scenario passes with code and test evidence. Coverage is complete. Both required registered validations, including a real smoke delivery, passed at the exact head `892ce4ec160000b7e13a469c86ea9ffabbe55e0e`.
