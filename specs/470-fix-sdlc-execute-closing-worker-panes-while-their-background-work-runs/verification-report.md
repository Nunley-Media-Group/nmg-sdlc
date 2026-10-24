# Verification Report: Fix sdlc-execute closing worker panes while their background work runs

**Date**: 2026-10-24
**Issue**: #470
**Reviewer**: Claude Code (manual verification at the owner's request; not an nmg-sdlc verify worker)
**Scope**: Implementation verification against spec

---

## Executive Summary

The fix meets all five acceptance criteria and all four functional requirements, and tasks T001–T005 are complete. Every new or changed regression test fails against the pre-fix `scripts/sdlc-execute.mjs` and passes with the fix. A live Herdr trace confirms the premise of the fix. A real Claude Code worker settles `done` while its background command is still running, and it returns to `working` when that command finishes.

**The registered live smoke gate (`repository.nmg-sdlc-smoke`) was not run.** It drives `/sdlc-execute` in the smoke repository, and the owner asked for this fix to be delivered without nmg-sdlc.

### Implementation Status: Pass
**Total Issues**: 0 blocking; 1 gate not run (live smoke, see Test Results)

---

## Issue Scope

- Active issue: #470
- Spec: `specs/470-fix-sdlc-execute-closing-worker-panes-while-their-background-work-runs`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002, T003, T004, T005]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":470,"specPath":"specs/470-fix-sdlc-execute-closing-worker-panes-while-their-background-work-runs","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003","T004","T005"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | A worker waiting on background work keeps its pane | Pass | `awaitWorkerHandoff` in `scripts/sdlc-execute.mjs`. The test `keeps the pane of a worker waiting on its background gate and processes the later handoff` asserts that no pane is closed before the resumed turn's handoff and that the `--timeout 60000` poll ran. It fails before the fix |
| AC2 | An idle worker without a handoff or marker gets one reminder | Pass | The tests `removes a stale waiting marker and reminds a settled worker once before it counts as stopped` and `retries verify, not an implement repair, after a verify worker stops without a handoff` each send exactly one reminder that names both paths. The second test then records `missing_handoff` |
| AC3 | Process loss and blocked workers are unchanged | Pass | `closes a worker reported as "" / "blocked" without a reminder or resume wait` sends no reminder and runs no timeout poll, and records `process_lost` / `missing_handoff` |
| AC4 | A branch with no commits goes to implement | Pass | `branchCommits` plus the implemented-head guard. The start-path tests now expect `start, implement, verify, deliver`. `verifies a branch with no commits once this invocation implemented it at that head` proves the guard prevents a loop |
| AC5 | A lost verify handoff re-runs verify | Pass | `retries verify, not an implement repair, after a verify worker stops without a handoff` expects `verify, verify, deliver`. Before the fix it dispatched `implement` |

## Functional Requirements

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | The `WORKER_HEADER` line in `src/sdlc-prompt-snippets.mjs` is pinned by `renders the exact worker header` |
| FR2 | Pass | `rmSync` of `<handoff>.waiting` runs before dispatch and on resumption. The stale-marker test would hang on its bounded-wait guard without it |
| FR3 | Pass | The poll uses `RESUME_POLL_MS = 60_000` with no overall deadline. Process loss ends it on the next poll |
| FR4 | Pass | `submits prompts and waits through the agent surface without extra submit keys` asserts `['agent', 'wait', 'w', '--until', 'working', '--timeout', '60000']` |

## Task Completion

| Task | Status | Notes |
|------|--------|-------|
| T001 | Complete | `scripts/sdlc-execute.mjs` |
| T002 | Complete | `scripts/sdlc-execute.mjs` |
| T003 | Complete | `src/sdlc-prompt-snippets.mjs` |
| T004 | Complete | `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-prompt-snippets.test.mjs` |
| T005 | Complete | `README.md`, `CHANGELOG.md` |

## Live Herdr Trace

A `--kind claude --model haiku` agent in a sibling Herdr pane was told to run `sleep 75` with `run_in_background`, write the waiting marker, end its turn, and write a handoff when notified. The controller's own calls observed the following:

| Time | Observation |
|------|-------------|
| +6s | `herdr agent wait` returned and `agent_status` was `done`. The marker was present; the handoff and the background output were not. The pre-fix controller closes the pane at this point |
| +66s | `agent wait --until working --timeout 60000` timed out with the status still `done` |
| +79s | The background command finished and the status changed to `working` |
| +83s | The status settled again with the handoff `{"ok":true}` written |

## Test Results

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests (`repository.tests`) | Pass | `cd scripts && CI=1 npm test -- --runInBand` exited 0: 50 suites passed and 1 skipped; 1051 tests passed and 2 skipped (387 s) |
| Pre-fix proof | Pass | With the `main` `scripts/sdlc-execute.mjs`, `sdlc-execute.test.mjs` fails all 9 new or changed tests |
| Hooks module (`claude plugin test .`) | Pass | 20 passed, 0 failed |
| Plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository --claude-validate` exited 0 |
| Current specs | Pass | `node scripts/verify-current-specs.mjs` exited 0 (97 genuine issue specs) |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: clean |
| Git hygiene | Pass | `git diff --check main...HEAD` exited 0 |
| Live smoke (`repository.nmg-sdlc-smoke`) | Not run | Owner-directed delivery without nmg-sdlc |

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Medium | Verification | `repository.nmg-sdlc-smoke` | Live smoke not run | Owner-directed manual delivery |

## Recommendation

Ready to merge on CI evidence. The next `/sdlc-execute` run of a long gate exercises this end to end.
