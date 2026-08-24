# Verification Report: Wait for retained active workers instead of exiting execute

**Date**: 2026-08-23
**Issue**: #241
**Reviewer**: Codex
**Scope**: Implementation verification against the approved issue specification

---

## Executive Summary

The implementation removes the retained-worker success exit, reuses Herdr's blocking settlement paths without a new timeout or poll loop, re-reads worker state, and falls through to the existing validated-handoff continuation logic. Mismatched workers, unknown panes, and settlement failures now persist actionable failures through `stopResult`. Focused and complete Jest suites passed. No actionable architecture, security, performance, testability, or error-handling findings remain.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **4.8** |

### Implementation Status: Pass

**Total Issues**: 0

---

## Issue Scope

- Active issue: #241
- Spec: `specs/241-wait-for-retained-active-workers-instead-of-exiting-execute`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC10]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002, T003]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN010]
- Regression: AC [AC5, AC6, AC7, AC8, AC9]; FR [FR5, FR6]; scenarios [SCN005, SCN006, SCN007, SCN008, SCN009]

<!-- nmg-sdlc-issue-scope: {"issueNumber":241,"specPath":"specs/241-wait-for-retained-active-workers-instead-of-exiting-execute","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC10"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN010"]},"regression":{"acceptanceCriteria":["AC5","AC6","AC7","AC8","AC9"],"functionalRequirements":["FR5","FR6"],"scenarios":["SCN005","SCN006","SCN007","SCN008","SCN009"]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Retained worker is reused without duplication | Pass | `scripts/sdlc-execute.mjs:780-815`; `scripts/__tests__/sdlc-execute.test.mjs:1279-1309` |
| AC2 | Active worker does not end the command prematurely | Pass | `scripts/sdlc-execute.mjs:803-814`; focused retained-working test passes at `scripts/__tests__/sdlc-execute.test.mjs:1292-1310` |
| AC3 | Settlement uses blocking Herdr wait without busy-spin or shorter timeout | Pass | Bare `agentWait({ name })` and existing `waitForWorkerSettlement` at `scripts/sdlc-execute.mjs:803-806`; no polling or timeout added; test asserts no `timeout` at `scripts/__tests__/sdlc-execute.test.mjs:1306-1307` |
| AC4 | Passed handoff advances automatically | Pass | State is re-read and existing validation/continuation is reused at `scripts/sdlc-execute.mjs:813-895`; test starts `s42-implement` without a second `s42-start` at `scripts/__tests__/sdlc-execute.test.mjs:1304-1309` |
| AC5 | Queue continues through delivery | Pass | Existing eight-step queue remains intact at `scripts/__tests__/sdlc-execute.test.mjs:945-982`; retained resume completes through deliver at `scripts/__tests__/sdlc-execute.test.mjs:1345-1368` |
| AC6 | Selected issues remain serial until merge and close | Pass | Controller fixture returns merged/closed evidence at `scripts/__tests__/sdlc-execute.test.mjs:622-627`; later-issue ordering remains covered at `scripts/__tests__/sdlc-execute.test.mjs:1480-1506` |
| AC7 | Failed and unsettled outcomes remain fail-closed | Pass | `stopResult` routes mismatch, unknown pane, wait failure, post-wait state, and handoff failure at `scripts/sdlc-execute.mjs:784-900`; dedicated tests at `scripts/__tests__/sdlc-execute.test.mjs:1279-1339` and existing missing/invalid/intervention coverage passed |
| AC8 | Interrupted execution remains resumable | Pass | Existing run-state and retained idle/done continuation are preserved at `scripts/sdlc-execute.mjs:777-895`; realistic retained-worker resume tests pass at `scripts/__tests__/sdlc-execute.test.mjs:1342-1368` |
| AC9 | Existing safety gates remain intact | Pass | Diff is limited to retained-worker handling and controller tests; environment and integration fail-closed tests remain at `scripts/__tests__/sdlc-execute.test.mjs:831-843`; full suite passes |
| AC10 | Focused tests prove retained wait/continue and fail-closed behavior | Pass | `npm test -- --runInBand __tests__/sdlc-execute.test.mjs`: 1 suite passed, 87 tests passed, 0 failed |

---

## Regression Obligations

| Obligation | Status | Evidence |
|------------|--------|----------|
| AC5 / FR5 / SCN005: complete all eight delivery steps | Pass | Eight-worker queue-order test passed; retained resume completes `start` through `deliver` |
| AC6 / SCN006: preserve serial issue ordering | Pass | Later-issue fixture does not reach `s43-start` until #42 records all eight completed steps |
| AC7 / FR6 / SCN007: preserve fail-closed handoff outcomes | Pass | Mismatch, blocked wait failure, unknown pane, failed verification, missing/invalid handoff, stalled prompt, and intervention tests passed |
| AC8 / SCN008: preserve persisted resume behavior | Pass | Retained idle/done and failed-verification remediation tests passed without duplicate workers |
| AC9 / SCN009: preserve preflight and mutation boundaries | Pass | Diff does not alter preflight, review-menu, handoff schema, `validateHandoff`, or merge/close code; complete contract suite passed |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Replace the live-worker status-0 return | Complete | Implemented in `scripts/sdlc-execute.mjs:784-900`; successful `no second worker started` path removed |
| T002 | Rewrite and add retained-worker regression tests | Complete | Added mismatch, retained working continuation, blocked settlement failure, unknown pane, and active failed-verification assertions in `scripts/__tests__/sdlc-execute.test.mjs` |
| T003 | Verify no regressions | Complete | Focused suite: 87/87 passed; complete suite: 445 passed, one intentional opt-in exercise suite skipped |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | The change stays within retained-worker orchestration, though `runExecute` remains an existing large controller. |
| Open/Closed | 4 | Existing `stopResult`, `waitForWorkerSettlement`, injected Herdr API, and handoff logic are reused rather than duplicated. |
| Liskov Substitution | 5 | The injected Herdr adapter contract remains unchanged; fixture implementations remain substitutable. |
| Interface Segregation | 5 | No interface growth or new exported helper was introduced. |
| Dependency Inversion | 5 | High-level orchestration continues to depend on the injected `herdrApi` and `run` adapters. |

### Layer Separation

The implementation remains in the deterministic controller layer. It does not move lifecycle decisions into workflow Markdown, mutate product code, or broaden the Herdr worker contract.

### Dependency Flow

`runExecute` calls existing adapter methods and validation functions. No new dependency or reverse coupling was introduced.

---

## Security Assessment

**Score: 5/5.** No new external input or command construction was introduced. Worker names are checked against the exact persisted issue/step identity before waiting. Unknown pane identity fails closed. Herdr calls use object arguments rather than shell interpolation. Existing authentication, authorization, and repository preflight gates are unchanged.

- Authentication: Not applicable to changed branch; existing `gh auth` preflight preserved
- Authorization: Not applicable to changed branch
- Input validation: Pass — exact retained worker name and pane identity checks
- Injection prevention: Pass — no shell execution or interpolated command added
- Data protection: Pass — no secrets or sensitive payloads introduced

---

## Performance Assessment

**Score: 5/5.** The implementation deliberately blocks on Herdr's existing settlement primitive. It adds no poll loop, timer, shorter timeout, repeated scan, or unbounded allocation. Idle/done workers skip the wait. Working workers make one bare wait call; other unsettled states reuse the existing bounded settlement sequence.

---

## Testability Assessment

**Score: 5/5.** Existing dependency injection permits deterministic Herdr state transitions and wait failures. Tests assert observable status, starts, waits, pane preservation, persisted failure codes, and queue continuation. The BDD scenarios map directly to executable controller tests.

---

## Error Handling Assessment

**Score: 5/5.** Every newly handled unsafe state routes through `stopResult`, preserving the worker pane, persisting a stable `reasonCode`, notifying through the existing path, and returning failure. Wait success is followed by an explicit state re-read; invalid or non-passed handoffs still use existing validation and failure handling.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criteria | Has Scenario | Has Executable Test | Passes |
|---------------------|-------------|---------------------|--------|
| AC1-AC10 | Yes — SCN001-SCN010 | Yes — focused controller tests and existing regression suite | Yes |

### Test Results

| Command | Result | Evidence |
|---------|--------|----------|
| `cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs` | Pass | 1 suite, 87 tests passed, 0 failed, 0 skipped |
| `cd scripts && npm test -- --runInBand` | Pass | 40 suites passed, 445 tests passed, 0 failed; one intentionally opt-in exercise suite skipped unless `RUN_EXERCISE_TESTS=1` |
| `git diff --check main...HEAD` | Pass | Exit 0; no output |

Plugin exercise was not applicable: `git diff --name-only main...HEAD` contains only `scripts/sdlc-execute.mjs` and `scripts/__tests__/sdlc-execute.test.mjs`, with no changes under `workflows/` or `agents/`.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | Complete Jest suite: 445 passed, 0 failed |
| Skill inventory | Not applicable | No skill, reference, agent, or workflow surface changed |
| OMP plugin surface | Not applicable | No plugin manifest, extension, workflow, reference, or agent file changed |
| Skill creator validation | Not applicable | No skill-bundled file changed |
| Skill exercise | Not applicable | No changed skill or agent detected in scoped diff |
| Prompt quality | Not applicable | No skill contract changed |
| Git hygiene | Pass | `git diff --check main...HEAD` exited 0 |

**Gate Summary**: 2/2 applicable gates passed, 0 failed, 0 incomplete; 5 not applicable

---

## Fixes Applied

No verification-time fixes were required.

---

## Remaining Issues

None.

---

## Positive Observations

- Minimal source change confined to the defective retained-worker branch.
- Existing handoff validation and remediation logic is reused rather than copied.
- Regression tests cover both progress and fail-closed outcomes, including exact wait arguments and pane preservation.
- Complete suite confirms unrelated preflight, review-menu, serial delivery, and handoff behavior remains intact.

---

## Recommendations Summary

### Before PR (Must)

- [x] No unresolved local obligations.

### Short Term (Should)

- [x] No follow-up required for issue #241.

### Long Term (Could)

- Existing `runExecute` size may merit separate refactoring only under a dedicated specification; no refactor is warranted in this defect fix.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-execute.mjs` | 0 | Correct branch order, blocking wait reuse, state re-read, fail-closed continuation |
| `scripts/__tests__/sdlc-execute.test.mjs` | 0 | Delivery and regression contract covered |
| `specs/241-wait-for-retained-active-workers-instead-of-exiting-execute/requirements.md` | 0 | Approved, issue identity matches |
| `specs/241-wait-for-retained-active-workers-instead-of-exiting-execute/design.md` | 0 | Approved, implementation matches prescribed strategy |
| `specs/241-wait-for-retained-active-workers-instead-of-exiting-execute/tasks.md` | 0 | Approved, all task outputs present |
| `specs/241-wait-for-retained-active-workers-instead-of-exiting-execute/feature.gherkin` | 0 | Approved, SCN001-SCN010 mapped to tests |

---

## Recommendation

**Ready for PR**

All local acceptance criteria, regression obligations, applicable steering gates, focused tests, and complete contract tests pass. No PR-only evidence is required by this specification.
