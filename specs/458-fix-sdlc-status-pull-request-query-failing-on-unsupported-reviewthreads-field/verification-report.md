# Verification Report: Fix sdlc-status pull-request query failing on unsupported reviewThreads field

**Date**: 2026-10-18
**Issue**: #458
**Reviewer**: architecture-reviewer (OMP verify worker)
**Scope**: Implementation verification against spec (defect fix)
**Verification head**: 25514a5a53d59ff8fe4a2a5837bd64234855c262

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

`collectGithub` in `scripts/sdlc-status.mjs` no longer requests `reviewThreads` from `gh pr view --json`. GitHub CLI 2.97.0 rejects that field with `Unknown JSON field`. The function now reports command failures as `pull request fetch failed: <bounded message>` gaps and invalid JSON as `pull request parse failed: <bounded message>` gaps. The `no pull requests found for branch` outcome stays gap-free. The status and execute test stubs now reject any `pr view --json` field outside the real gh 2.97.0 field set. Both required registered validations passed at the verification head.

---

## Issue Scope

- Active issue: #458
- Spec: `specs/458-fix-sdlc-status-pull-request-query-failing-on-unsupported-reviewthreads-field`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002, T003]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":458,"specPath":"specs/458-fix-sdlc-status-pull-request-query-failing-on-unsupported-reviewthreads-field","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 458 --spec specs/458-… --base main --controller-run-id e906709b-a101-4606-bdf5-41628ed54034`
- Artifact: `.omp/sdlc/verification/458.json`. `ok: true`, `ceiling: null`, head `25514a5a53d59ff8fe4a2a5837bd64234855c262`, tree `clean`
- Coverage: `declared: 2`, `recorded: 2`, `complete: true`, with no missing, duplicate, or unknown results
- Steering manifest: `steering/manifest.json` loaded with 4 modules, 3 snippets, and extension `project.nmg-sdlc-smoke`. No runtime errors.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Status reports the branch's open draft pull request | Pass | At `scripts/sdlc-status.mjs:274-288` the query requests only the 8 supported fields and maps the response into `pullRequest`. The test `reports the open draft pull request when gh rejects unsupported pr view fields` passes on the branch and failed against `origin/main`. Live check with the real gh 2.97.0 on this branch: `gh pr view --json number,reviewThreads` exits 1 with `Unknown JSON field: "reviewThreads"`. `node scripts/sdlc-status.mjs --project . --json` now returns `pullRequest` #460 with `headRefOid` and `baseRefName: main`, and `missingArtifacts` is only `["verification"]`, not `pull request`. |
| AC2 | Execute verify observes the draft pull request | Pass | `routes PR Evidence Pending through draft evidence and back to verification, never early merge` in `scripts/__tests__/sdlc-execute.test.mjs` passes with the strict stub (worker starts `verify, verify, verify, deliver`). With the same test file it failed against `origin/main`'s `sdlc-status.mjs`. |
| AC3 | A failed pull-request query is reported as a gap | Pass | See `scripts/sdlc-status.mjs:289-294`. All 3 `it.each` cases pass: fetch failure, 409-character fetch failure bounded to 240 characters, and parse failure. All 3 failed against `origin/main`. |
| AC4 | A branch without a pull request is unchanged | Pass | `NO_BRANCH_PULL_REQUEST` (`scripts/sdlc-status.mjs:224`) suppresses the gap. `keeps a branch without a pull request gap-free and verified` passes on both `origin/main` and the branch, with stage `verified` and next action `/sdlc-open-pr #42`. |

## Functional Requirements

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | The field list is exactly `number,state,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,closingIssuesReferences`. The real gh 2.97.0 accepts it and returned PR #460 for this branch. |
| FR2 | Pass | One gap is added per failure. Messages pass through the existing `commandFailure` and `boundedMessage` helpers, so each is one line of at most 240 characters. |
| FR3 | Pass | A multiline-anchored regex matches gh's `no pull requests found for branch "<branch>"` stderr. No gap is added. |
| FR4 | Pass | `GH_PR_VIEW_JSON_FIELDS` is identical in both test files. Sorted with `LC_ALL=C`, it equals the 46 fields printed by the real `gh pr view --json` 2.97.0. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Correct the root cause | Complete | Matches the design. The successful-response mapping is unchanged. |
| T002 | Reject unsupported fields in the execute fixture and prove verify turns green | Complete | The helper is at module level. The no-PR stub stderr matches the real gh message. The AC2 test fails before the fix and passes after it. |
| T003 | Add status regression coverage | Complete | The new `describe('sdlc-status branch pull-request evidence')` block contains AC1, 3 AC3 cases, and AC4. AC1 and AC3 fail before the fix, and AC4 passes before and after, as the task requires. |

---

## Architecture Assessment (defect blast radius)

- **Shared callers**: `collectGithub` is called only by status evidence collection. `sdlc-execute.mjs` consumes `pullRequest` through status. It does not consume status `gaps`; its `.gaps` checks read readiness and repair results. A new fetch or parse gap is diagnostic only and does not change stage inference.
- **Public contract**: the `pullRequest` shape is unchanged. The only addition is gap strings for real query failures that were silently dropped before, which the spec requires.
- **Silent data changes**: none. `reviewThreads` was never mapped into `pullRequest`.
- **Minimal change**: the diff (`git diff origin/main...HEAD`) touches only `scripts/sdlc-status.mjs` (+6/−2), the 2 named test files, and one `CHANGELOG.md` `[Unreleased]` line. No workflow, agent, or reference files changed.

| Area | Score | Notes |
|------|-------|-------|
| SOLID | 5 | One function changed. The existing helpers and `adapters.run` injection are reused. |
| Security | 5 | The fixed argument array is unchanged, with no interpolation. Error text is bounded before it is reported. |
| Performance | 5 | The call count is unchanged and the requested payload is smaller. |
| Testability | 5 | The stub reproduces the real CLI's field validation, so tests now fail on unsupported fields. |
| Error handling | 5 | Failure and parse errors are surfaced as named, bounded gaps, and the expected no-PR outcome stays silent. |

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001, `@regression`) | Yes (Jest status test) | Yes |
| AC2 | Yes (SCN002, `@regression`) | Yes (Jest execute test) | Yes |
| AC3 | Yes (SCN003, `@regression`) | Yes (Jest `it.each`, 3 cases) | Yes |
| AC4 | Yes (SCN004, `@regression`) | Yes (Jest status test) | Yes |

### Coverage Summary

- Feature files: 4 `@regression` scenarios
- Focused files (`npm test -- sdlc-status.test.mjs sdlc-execute.test.mjs`): 2 suites, 58 passed, 58 total
- Pre-fix proof: in a detached `origin/main` worktree with the branch test files, 5 tests failed (AC1, the 3 AC3 cases, and AC2) and AC4 passed. 53 of 58 passed.
- Full suite (`repository.tests`): 49 suites passed with 1 skipped; 915 tests passed with 2 skipped (917 total); exit 0

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Reason** | No plugin-surface change: the diff has no `workflows/` or `agents/` changes. The changed path was exercised directly with `node scripts/sdlc-status.mjs --project . --json` against the real gh 2.97.0 (see AC1). |
| **Recommendation** | None |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (contract tests) | Pass | `npm test -- --runInBand` exited 0. 915 passed, 2 skipped. |
| `repository.nmg-sdlc-smoke` (live smoke) | Pass | A fresh issue, smoke #209, was provisioned through `/sdlc-draft-issue` and `/sdlc-write-spec` in a provider-owned Herdr pane. Its spec PR #210 is `MERGED`. After recording the closing-PR baseline, `sdlc-execute run #209` ran. Proof: PR #211 is `MERGED` at `87adc373fe109d48f1f0ff82363c27389adb510b`, and issue #209 is `CLOSED`. |
| Skill inventory | N/A | No skill, reference, or agent surface changed |
| OMP plugin surface | N/A | Plugin surface unchanged |
| Skill creator validation | N/A | No skill-bundled files changed |
| Skill exercise | N/A | No changed skill |
| Prompt quality | N/A | No skill contract changed |
| Git hygiene | Pass | `git diff --check origin/main...HEAD` exited 0 |

**Gate Summary**: 3/3 applicable gates passed, 0 failed, 0 incomplete

---

## Fixes Applied

None. No findings required changes.

## Remaining Issues

None.

---

## Positive Observations

- The stub field set exactly matches the real CLI, so a future unsupported field fails in tests, not in production.
- The fix turns a silently swallowed failure into a named, bounded gap while keeping the common no-PR case quiet.

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-status.mjs` | 0 | Field list and failure classification |
| `scripts/__tests__/sdlc-status.test.mjs` | 0 | New pull-request evidence block |
| `scripts/__tests__/sdlc-execute.test.mjs` | 0 | Strict `pr view` stub |
| `CHANGELOG.md` | 0 | `[Unreleased]` entry present |

## Recommendation

**Ready for PR**

All ACs, FRs, tasks, and scenarios pass. Both required registered validations passed with complete coverage at `25514a5a53d59ff8fe4a2a5837bd64234855c262`.
