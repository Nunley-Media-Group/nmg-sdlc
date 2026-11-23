# Verification Report: Commit resolved queue-head merges and retry transient GitHub reads in /sdlc-execute

**Date**: 2026-11-23
**Issue**: #575
**Reviewer**: Claude (nmg-sdlc verify worker, gate phase)
**Scope**: Pre-merge gate at the merge-queue head (default branch integrated, version 4.21.3 prepared)

**Verification head**: 201a0471b51d8c03ce02e57230363d580ac53c0e

---

## Executive Summary

The review phase passed at implementation head `8538e1b45cc20bda6de3be9aedd593a360621d91` with no finding above `info`. The gate was rerun once at the queue head `201a0471`, with the default branch integrated and version 4.21.3 prepared. The supervisor's redispatch guidance asked for mode `all`. The changed lines in `commitIntegrationMerge` and the `commit-merge` CLI routing run only in spawned child processes, and `sleepMilliseconds` is replaced by an injected sleep, so no narrower in-process selection can cover them. The selection therefore answered `all` (`selection_all`) and recorded no rejection.

Every registered pre-merge validation passed:
- `repository.tests` ran the full suite: 80 suites passed and 1 skipped; 1961 tests passed and 2 skipped.
- `repository.nmg-sdlc-smoke` exercised all six interactive surfaces live at this head. It then delivered smoke issue #356 through a real `/sdlc-execute`: PR #360 was merged at `99d4c4d` and the issue is closed.

Overall status: **Pass**.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 4.7 |

### Implementation Status: Pass
**Total Issues**: 1 (an info note from the review). There are no blocking, major or minor findings.

---

## Issue Scope

- Active issue: #575
- Spec: `specs/575-commit-resolved-queue-head-merges-and-retry-transient-github-reads-in-sdlc-execute`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2]; FR [FR1, FR2, FR3, FR4, FR5]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":575,"specPath":"specs/575-commit-resolved-queue-head-merges-and-retry-transient-github-reads-in-sdlc-execute","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass (registered coverage complete, every required result passed)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/575.json`, tier `pre-merge`, base `main`, head `201a0471b51d8c03ce02e57230363d580ac53c0e`
- Ceiling: none (`null`)
- Coverage: declared 4, recorded 4, complete `true`. Nothing is missing, duplicated or unknown.
- Selection: `claude:haiku` at `xhigh`, mode `all`, reason `selection_all`, with supervisor guidance supplied (`guidanceSupplied: true`). All 14 surfaces were selected; the required surface was `[execute]`. Rejection: none.

---

## Acceptance Criteria Verification

The verdicts below come from the passed review record (`.nmg-sdlc/verification/575-review.md`). No criterion's tests mock the path under test.

| AC | Description | Status | Exercised | Evidence |
|----|-------------|--------|-----------|----------|
| AC1 | A resolved merge can be committed | Pass | real entry point | `scripts/sdlc-safe-recoveries.mjs:265-283` (`commitIntegrationMerge`), CLI routing at 1010-1017. `@SCN001` in `sdlc-safe-recoveries.test.mjs` spawns the real CLI on a git fixture: exit 0, `HEAD^2 == origin/main`, `NMG_SDLC_PUBLICATION` with `passed:true` |
| AC2 | Transient GitHub reads are retried | Pass | real entry point | `scripts/sdlc-execute.mjs:228-258` (`retryingRun`) wraps `statusEvidence`. `@SCN002` drives `runExecute` while the first `gh issue view` fails with HTTP 502: it sleeps `[1000]` and the run finishes |

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | `commit-merge` runs `git commit --no-edit` and prints `NMG_SDLC_PUBLICATION` with `passed:true` and the commit |
| FR2 | Pass | Refuses with each named reason, always before `git commit` |
| FR3 | Pass | `workflows/write-code/WORKFLOW.md:88` uses `commit-merge` and forbids raw `git commit` |
| FR4 | Pass | Up to 3 retries after 1 s, 2 s and 4 s, for `gh` only |
| FR5 | Pass | A 404 or authentication failure is not retried, and git commands are never retried |

## Task Completion

| Task | Description | Status |
|------|-------------|--------|
| T001 | Add the commit-merge helper action | Complete |
| T002 | Conclude resolved integration merges in write-code with commit-merge | Complete |
| T003 | Retry transient GitHub reads in controller evidence collection | Complete |
| T004 | Add behavioral regression coverage | Complete |

---

## Architecture Assessment

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID | 5 | `commit-merge` reuses the existing integration, scope and denied-path inspection; retry is isolated in `retryingRun` |
| Security | 5 | Argument-array git and gh calls; no force; a denied path is refused before commit |
| Performance | 5 | Retry is bounded to about 7 s and limited to `gh` evidence reads |
| Testability | 4 | Tests drive the real CLI and `runExecute`. The CLI path runs in a child process, so in-process coverage does not see it. That is why the gate ran the full suite under supervisor guidance |
| Error Handling | 4 | Stable reason codes. Info F1: the `\b50[234]\b` pattern also matches not-found messages for issues #502-504, which causes bounded, harmless retries |

Average: 4.6

---

## Test Coverage

Kept test types: `bdd`.

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | `@SCN001` | `scripts/__tests__/sdlc-safe-recoveries.test.mjs` | Implemented (passing) |
| AC2 | `@SCN002` | `scripts/__tests__/sdlc-execute.test.mjs` | Implemented (passing) |

- Test-layer findings: none
- Test execution: Pass, full suite. 80 of 81 suites passed and 1 was skipped; 1961 of 1963 tests passed and 2 were skipped. The skips are the expected opt-in and platform guards: `exercise-start-issue-backfill` runs only with its exercise flag set, and the Windows junction test runs only on win32.

---

## Steering Doc Verification Gates

| Gate | Tier | Selection | Status | Evidence |
|------|------|-----------|--------|----------|
| `repository.tests` | change | `claude:haiku`, `selection_all` (full suite) | Passed | `npm test -- --runInBand` exited 0; 1961 passed, 2 skipped. Log: `.nmg-sdlc/verification/575/repository.tests.log` |
| `repository.nmg-sdlc-smoke` | (untiered) | all surfaces | Passed | Each surface was exercised live at this head through `claude --plugin-dir` in tmux and has a head-bound record under `.nmg-sdlc/smoke/surfaces/`. `/sdlc-draft-issue` created nmg-sdlc-smoke#358. `/sdlc-write-spec #358` merged spec PR #359. `/sdlc-onboard-project` found the project already initialized and changed nothing. `/sdlc-upgrade-project` produced a report-only plan with every category declined. `/sdlc-steering` applied and validated a one-line snippet edit. `/sdlc-run-retro` rewrote the retrospective files locally. Execute delivered provisioned issue #356 (spec PR #357): the issue is CLOSED and PR #360 is MERGED at `99d4c4d30aba8036c1bc8c564f774cf47396f342`, matching the pre-merge delivery proof |
| `repository.tests.full` | full | n/a | Skipped before merge | `/sdlc-verify-full` runs it |
| `repository.nmg-sdlc-smoke.full` | full | n/a | Skipped before merge | `/sdlc-verify-full` runs it |

**Gate Summary**: 2/2 applicable validations passed. The 2 full-tier validations were skipped before merge, as designed.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| none | none | none | None in this gate run; no source or steering was edited | none | none |

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Info | Error Handling | `scripts/sdlc-execute.mjs` | F1: `\b50[234]\b` matches not-found messages for issues #502-504 | Bounded and harmless; the design prescribed this pattern |
| Info | Smoke observation (outside #575) | `/sdlc-draft-issue` | During discovery the smoke session ran an `ls` command that still contained the literal plugin-root placeholder. The draft completed without it | Outside this issue's scope; recorded for follow-up |
| Info | Smoke evidence | `.nmg-sdlc/smoke/surfaces/*.log` | Claude Code runs in tmux's alternate screen, so `capture-pane -S -` saves only the final screen (about 60 lines), not the full interview | The records still satisfy the provider contract; recorded for follow-up |

## Recommendation

**Ready to merge.** The implementation meets the Approved spec and the full suite passes. The live smoke proves every interactive surface and an exact-head execute delivery at the queue head.
