# Verification Report: Report closed issues at START as issue_closed instead of issue_unreadable

**Date**: 2026-10-18
**Issue**: #449
**Reviewer**: architecture-reviewer (OMP verify worker)
**Scope**: Implementation verification against spec
**Verification head**: c42d761558362ad1a04ec21ac8dba95433fff352

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
**Total Issues**: 0

The START issue-read guard in `scripts/start-issue.mjs` is now two checks. A failed, unparseable, or number-mismatched read, or a state other than `OPEN` or `CLOSED`, still fails with `issue_unreadable`. A `CLOSED` state now fails with `issue_closed` and the summary `GitHub issue #N is CLOSED`. Both checks run before the dependency read, runtime untracking, and every git command. Both required registered validations passed at the verification head.

---

## Issue Scope

- Active issue: #449
- Spec: `specs/449-report-closed-issues-at-start-as-issue-closed-instead-of-issue-unreadable`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3]; FR [FR1, FR2]; tasks [T001, T002]; scenarios [SCN001, SCN002, SCN003]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":449,"specPath":"specs/449-report-closed-issues-at-start-as-issue-closed-instead-of-issue-unreadable","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3"],"functionalRequirements":["FR1","FR2"],"tasks":["T001","T002"],"scenarios":["SCN001","SCN002","SCN003"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 449 --spec specs/449-… --base main --controller-run-id e906709b-a101-4606-bdf5-41628ed54034`
- Artifact: `.omp/sdlc/verification/449.json`. `ok: true`, `ceiling: null`, head `c42d761558362ad1a04ec21ac8dba95433fff352`, tree `clean`
- Coverage: `declared: 2`, `recorded: 2`, `complete: true`, with no missing, duplicate, or unknown results
- Steering manifest: `steering/manifest.json` loaded with 4 modules, 3 snippets, and extension `project.nmg-sdlc-smoke`. No runtime errors.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | A successful read of a CLOSED issue writes an `issue_closed` failed handoff before any other command | Pass | `scripts/start-issue.mjs:246-252`. The test `writes issue_closed for a CLOSED issue before any other command` checks the full handoff and that `f.calls` contains only the issue view. CLI smoke with a stub `gh` exited 1 and wrote `reasonCode: "issue_closed"` with summary `GitHub issue #42 is CLOSED`, `intervention: true`, `step: "start"`, and `next: null`. The only call recorded was `issue view 42 --json number,title,body,labels,state`. |
| AC2 | Failed, unparseable, mismatched, or unknown-state reads still write `issue_unreadable` | Pass | `scripts/start-issue.mjs:247-249`. An `it.each` test covers 4 cases: failed read, number mismatch, missing state, and unparseable stdout. Each asserts `reasonCode`, `summary`, `intervention`, `next`, and that the issue view is the only call. |
| AC3 | An OPEN issue's START behavior is unchanged | Pass | The OPEN path falls through to the unchanged code at `scripts/start-issue.mjs:254`. The existing dependency, branch-development, spike-label, and fresh-develop tests pass without modification (38/38 in the file). |

## Functional Requirements

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | `issueState` is the upper-cased string or `null`. A mismatched number or a state other than OPEN or CLOSED gives `issue_unreadable`, and CLOSED gives `issue_closed`. The comparison is case-insensitive through `toUpperCase()`. |
| FR2 | Pass | Both `return fail(...)` branches come before `createIssueDependencyClient`, `untrackOmpSdlcRuntime`, and every `git` call. Tests check `f.calls` equality, and the CLI smoke recorded only the issue view. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Correct the root cause | Complete | The guard matches `design.md`'s Fix Strategy exactly |
| T002 | Add behavioral regression coverage | Complete | The AC1 test failed against the `main` controller (received `issue_unreadable`) and passes on the branch. The 4 AC2 cases pass on both. |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | The guard only classifies the issue read |
| Open/Closed | 5 | Only the existing `fail` and `handoffFor` path is used; no new abstraction |
| Liskov Substitution | 5 | N/A |
| Interface Segregation | 5 | The handoff shape is unchanged |
| Dependency Inversion | 5 | The `run` injection is preserved |

### Layer Separation

The change is limited to the `scripts/` controller. No workflow, agent, or reference files changed.

### Dependency Flow

`sdlc-execute.mjs` checks only the shape of START handoffs (`reasonCode` is a string or null) and stops on any failed handoff. It does not match `issue_unreadable`, so the new `issue_closed` code needs no consumer change. Code search confirmed that START has no other consumers of `issue_unreadable`.

## Security Assessment

- [x] Authentication: N/A. The existing `gh` credentials are unchanged.
- [x] Authorization: no new mutations, and a failure path performs no git or GitHub writes
- [x] Input validation: the `typeof` string check prevents coercing a non-string `state`
- [x] Injection prevention: the argument-array `run` call is unchanged
- [x] Data protection: N/A

## Performance Assessment

- [x] Async patterns: N/A (synchronous CLI)
- [x] Caching: no added GitHub call; the field already read is reused
- [x] Resource management: unchanged
- [x] Query optimization: CLOSED issues now exit earlier, with no dependency read

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Yes (Jest controller test) | Yes |
| AC2 | Yes (SCN002) | Yes (Jest `it.each`, 4 cases) | Yes |
| AC3 | Yes (SCN003) | Yes (existing OPEN-path tests) | Yes |

### Coverage Summary

- Feature files: 3 scenarios
- Step definitions: implemented as Jest tests in `scripts/__tests__/start-issue-controller.test.mjs`
- Focused file: 38 passed, 38 total
- Full suite (`repository.tests`): 49 suites passed with 1 skipped; 910 tests passed with 2 skipped (912 total); exit 0
- Pre-fix proof: in a detached `main` worktree with the branch test file, the AC1 test failed (`"reasonCode": "issue_unreadable"` vs expected `"issue_closed"`) and the 4 AC2 cases passed

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Reason** | No plugin-surface change: the diff touches only `scripts/start-issue.mjs`, its test, and `CHANGELOG.md`, with no `workflows/` or `agents/` changes. The CLI smoke above exercised the changed path. |
| **Recommendation** | None |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (contract tests) | Pass | `npm test -- --runInBand` exited 0. 910 passed, 2 skipped. |
| `repository.nmg-sdlc-smoke` (live smoke) | Pass | A fresh issue, smoke #203, was provisioned through `/sdlc-draft-issue` and `/sdlc-write-spec` in a provider-owned Herdr pane. The pre-run closing-PR baseline was empty. `sdlc-execute run #203` reported start, implement, verify, and deliver as passed, then `MERGED and CLOSED`. Proof: PR #205 is `MERGED` at `16b171d7ca86363db2ec2e47ab30160a2f7c6264`, and issue #203 is `CLOSED`. |
| Skill inventory | N/A | No skill, reference, or agent surface changed |
| OMP plugin surface | N/A | Plugin surface unchanged |
| Skill creator validation | N/A | No skill-bundled files changed |
| Skill exercise | N/A | No changed skill |
| Prompt quality | N/A | No skill contract changed |
| Git hygiene | Pass | `git diff --check main...HEAD` exited 0 |

**Gate Summary**: 3/3 applicable gates passed, 0 failed, 0 incomplete

---

## Fixes Applied

None. No findings required changes.

## Remaining Issues

None.

---

## Positive Observations

- The smallest possible fix, matching the approved design exactly.
- The tests assert full command-call equality, which proves FR2 ordering rather than only the reason code.
- The `typeof` check keeps unknown or missing states from being labeled `CLOSED`, which follows the design's rejected-alternative rationale.

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/start-issue.mjs` | 0 | Guard split |
| `scripts/__tests__/start-issue-controller.test.mjs` | 0 | AC1 test plus 4 AC2 cases |
| `CHANGELOG.md` | 0 | `[Unreleased]` entry present |

## Recommendation

**Ready for PR**

All ACs, FRs, tasks, and scenarios pass. Both required registered validations passed with complete coverage at `c42d761558362ad1a04ec21ac8dba95433fff352`.
