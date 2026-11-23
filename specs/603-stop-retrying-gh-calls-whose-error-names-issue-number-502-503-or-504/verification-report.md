# Verification Report: Stop retrying gh calls whose error names issue number 502, 503 or 504

**Date**: 2026-11-23
**Issue**: #603
**Reviewer**: Claude (nmg-sdlc verify worker, gate phase)
**Scope**: Implementation verification against spec

**Verification head**: e74e8825de7bddbb4bcacd3b072a4a41bfea7fc4

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
**Total Issues**: 0 blocking/major/minor (1 info note)

The change removes the bare `\b50[234]\b` alternative from `TRANSIENT_GH_OUTPUT` in `scripts/sdlc-execute.mjs:231`, so a `gh` failure whose message names issue number 502, 503 or 504 is no longer retried, while real HTTP 5xx, status-phrase, network, timeout and spawn-error failures still retry with the same backoff. The review (passed, full mode) found no defect above `info`; the pre-merge gate passed with complete coverage.

---

## Issue Scope

- Active issue: #603
- Spec: `specs/603-stop-retrying-gh-calls-whose-error-names-issue-number-502-503-or-504`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3]; FR [FR1, FR2]; tasks [T001, T002]; scenarios [SCN001, SCN002, SCN003]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":603,"specPath":"specs/603-stop-retrying-gh-calls-whose-error-names-issue-number-502-503-or-504","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3"],"functionalRequirements":["FR1","FR2"],"tasks":["T001","T002"],"scenarios":["SCN001","SCN002","SCN003"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/603.json` (tier `pre-merge`, base `main`, head `e74e8825de7bddbb4bcacd3b072a4a41bfea7fc4`, clean tree)
- Ceiling: none
- Coverage: `declared: 4`, `recorded: 4`, `complete: true`, no missing/duplicate/unknown results
- Selection: `gate:selection` on `haiku` at `xhigh`, reason `selected`, surfaces `[execute]` (required `[execute]`), 10 tests selected, rejection `null`

---

## Acceptance Criteria Verification

Taken from the passed review record `.nmg-sdlc/verification/603-review.json`. No criterion's tests mock the path under test: every test drives the real exported `retryingRun` with an injected runner and sleep.

| AC | Description | Status | Exercised | Evidence |
|----|-------------|--------|-----------|----------|
| AC1 | An issue number is not a transient failure | Pass | real_entry_point | `@SCN001` in `scripts/__tests__/sdlc-execute-gh-retry.test.mjs:20-30`: messages naming issue 502/503/504 run once, no sleeps; probe confirmed the pre-fix regex matched, so the test fails without the fix |
| AC2 | Real HTTP 5xx failures are still retried | Pass | real_entry_point | `@SCN002` at `sdlc-execute-gh-retry.test.mjs:32-47`: `HTTP 502/503/504` and the three status phrases run 4 times with sleeps `[1000, 2000, 4000]` |
| AC3 | Other transient signals are unchanged | Pass | real_entry_point | `@SCN003` at `sdlc-execute-gh-retry.test.mjs:49-68`: timeout, reset/refused, DNS, TLS, unexpected EOF and an `EPIPE` spawn error each retry 4 times |

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | `scripts/sdlc-execute.mjs:231`: 502-504 match only via `HTTP 5\d\d` or the status phrases |
| FR2 | Pass | Single-line regex diff; `transientGhFailure` and `retryingRun` unchanged; #575 retry tests still pass |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Correct the Root Cause | Complete | One-line regex change in `scripts/sdlc-execute.mjs` |
| T002 | Implement the Regression Scenarios | Complete | `scripts/__tests__/sdlc-execute-gh-retry.test.mjs` cites `@SCN001`-`@SCN003` |

---

## Architecture Assessment

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID Principles | 5 | Classification stays in the single `TRANSIENT_GH_OUTPUT` constant; no new responsibilities |
| Security | 5 | No new input handling, shell use or credentials |
| Performance | 5 | Removes three pointless backoff waits (about 7 s) for non-transient not-found failures |
| Testability | 5 | Deterministic tests with injected runner and sleep; SCN001 is a proven regression test |
| Error Handling | 5 | Non-transient failures surface immediately; transient paths unchanged |

Consumers: `retryingRun` wraps the controller's `gh` evidence reads (`scripts/sdlc-execute.mjs:252-258`); no workflow, reference, agent or hook names the changed identifiers. `CHANGELOG.md` carries a `### Fixed` bullet ending with `(#603)`.

---

## Test Coverage

### Scenario Coverage

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | `@SCN001` | `scripts/__tests__/sdlc-execute-gh-retry.test.mjs` | Implemented |
| AC2 | `@SCN002` | `scripts/__tests__/sdlc-execute-gh-retry.test.mjs` | Implemented |
| AC3 | `@SCN003` | `scripts/__tests__/sdlc-execute-gh-retry.test.mjs` | Implemented |

### Test-Layer Findings

Kept test types: `bdd`.

- Duplicate: none
- Non-kept type: none
- Justified: none

---

## Steering Doc Verification Gates

| Gate | Tier | Selection | Status | Evidence |
|------|------|-----------|--------|----------|
| `repository.tests` | change | `{ provider: claude:haiku, reason: selected, fallbackPath: null, selectedCount: 10 }` | Pass | `npm test -- --runInBand` on the 10 selected suites exited 0: 10 suites, 472 tests passed. Coverage: changed line `scripts/sdlc-execute.mjs:231` hit, 0 uncovered |
| `repository.nmg-sdlc-smoke` | null | surfaces `[execute]` | Pass | Delivered provisioned smoke issue Nunley-Media-Group/nmg-sdlc-smoke#362 via headless `/sdlc-execute #362` (session `78cfaa33-f766-4278-bddc-ab2d37ca9756`); PR #364 `MERGED` at `cdb313de6f0098c8611c731f179fc8fe66d32cf6`, issue `CLOSED`, PR outside the recorded baseline |
| `repository.tests.full` | full | n/a | Skipped (full tier, run by `/sdlc-verify-full`) | not applicable before merge |
| `repository.nmg-sdlc-smoke.full` | full | n/a | Skipped (full tier, run by `/sdlc-verify-full`) | not applicable before merge |

**Gate Summary**: 2/2 applicable gates passed, 0 failed, 0 incomplete

### Smoke provisioning

The previously recorded smoke issue #311 was closed, so a fresh issue was provisioned through the real interactive commands in a detached tmux `claude --plugin-dir` session on a fresh clone: `/sdlc-draft-issue` produced #362 (Add greeting_word_frequency library helper) and `/sdlc-write-spec #362` merged spec PR #363 with `spec-created`. Auto mode in the smoke session initially declined `gh issue create`; the session created the issue on a follow-up prompt through its own permission path. No interactive surface other than `execute` was selected, so no surface records were required. The tmux session and clone were removed.

---

## Fixes Applied

None in this phase.

## Remaining Issues

None blocking. Info note F1: `specs/575-.../design.md:51` still quotes the old regex with the removed `\b50[234]\b` alternative; it is a historical spec that #603 supersedes, so no repair is required.

---

## Recommendation

**Ready for PR**

All acceptance criteria and functional requirements pass with real-entry-point tests, the selected tests cover the only changed executable line, and the live smoke delivery passed at the exact head.
