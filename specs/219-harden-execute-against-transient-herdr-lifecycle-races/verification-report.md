# Verification Report: Harden execute against transient Herdr lifecycle races

**Date**: 2026-08-22
**Issue**: #219
**Reviewer**: Codex
**Scope**: Implementation verification against approved spec

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **4.67** |

### Implementation Status: Pass

**Total Issues**: 0

All five acceptance criteria pass. The controller regression suites pass 63/63 tests, the full contract suite passes 365 tests with one declared opt-in exercise suite skipped, plugin-surface validation passes, and the disposable Herdr exercise completed every queue step after the wrapper injected exactly one first-start failure. Smoke PR #10 merged, smoke issue #9 closed, the disposable repository returned to a clean `main`, and no `s9-*` worker remains.

---

## Issue Scope

- Active issue: #219
- Spec: `specs/219-harden-execute-against-transient-herdr-lifecycle-races`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5]; FR []; tasks [T001, T002, T003, T004, T005]; scenarios [SCN007]
- Regression: AC []; FR []; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN008]

<!-- nmg-sdlc-issue-scope: {"issueNumber":219,"specPath":"specs/219-harden-execute-against-transient-herdr-lifecycle-races","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":[],"tasks":["T001","T002","T003","T004","T005"],"scenarios":["SCN007"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN008"]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Recover only an expected full prompt or all three previews; require Enter → working → settled before handoff evaluation | Pass | `scripts/sdlc-execute.mjs:503-529,698-711,827-853`; focused tests cover full prompts, all three previews, unrelated text, early idle, retained prompts, and failed settlement |
| AC2 | Preserve authoritative passed handoffs and active workers while failing closed on unsafe states | Pass | `scripts/sdlc-execute.mjs:691-751,827-874`; tests cover passed handoffs after prompt failure, active-worker settlement, invalid/missing/failed handoffs, retained busy workers, and pane retention |
| AC3 | Drive `/review`, Review Mode, and literal `main` as distinct observed transitions | Pass | `scripts/sdlc-execute.mjs:787-825`; staged-menu tests prove pasted-command submission, already-visible Review Mode without resubmission, mode selection, and literal `main` selection |
| AC4 | Retry the same worker start exactly once after one second and retain the pane after a second failure | Pass | `scripts/sdlc-execute.mjs:426-429,775-784`; tests assert identical name/pane/kind on both calls and `agent_start_failed` with no close after two failures |
| AC5 | Complete the disposable full queue with one injected first-start failure | Pass | `/tmp/nmg-sdlc-219-herdr-start-failed` records the injected failure; `/tmp/nmg-sdlc-219-smoke/.omp/sdlc/run.json` records all eight steps complete with no failure; PR #10 is merged and issue #9 is closed |

---

## Regression Obligations

| Scenario | Status | Evidence |
|----------|--------|----------|
| SCN001 | Pass | `recovers one pasted stalled prompt without a timeout` proves Enter → working → settled |
| SCN002 | Pass | New- and retained-worker tests reject unrelated detection text without sending Enter |
| SCN003 | Pass | Working-worker settlement and failed-settlement tests preserve fail-closed behavior |
| SCN004 | Pass | Staged review-menu tests separately observe composer, Review Mode, and base branch |
| SCN005 | Pass | Fixture proves one failed start followed by one successful identical retry; disposable exercise confirms the complete queue |
| SCN006 | Pass | Fixture proves two failures stop with `agent_start_failed` and retain the pane |
| SCN008 | Pass | Three-preview conjunction test authorizes recovery only with every required preview |

Regression evidence is listed separately and does not substitute for AC5's successful delivery exercise.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Recover deterministic worker prompts safely | Complete | stderr diagnostics, narrow prompt detection, explicit lifecycle transitions, active settlement, and fail-closed handoff validation implemented |
| T002 | Separate interactive review transitions | Complete | `/review`, Review Mode, and literal `main` selection are separately observed and driven |
| T003 | Retry transient worker startup once | Complete | bounded one-second delay and exactly one same-pane retry implemented; second failure preserves the pane |
| T004 | Add behavioral regression coverage | Complete | focused execute/start controller suites pass 63/63 tests |
| T005 | Prove end-to-end delivery | Complete | disposable issue #9 completed start, implement, review1, fix1, review2, fix2, verify, and deliver; PR #10 merged and issue #9 closed |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Prompt detection and recovery are focused helpers; `runExecute` remains intentionally centralized for synchronous queue invariants |
| Open/Closed | 4 | Injected `run` and Herdr adapters preserve fixture extensibility without introducing a generic retry framework |
| Liskov Substitution | 4 | Test adapters honor realistic production envelopes and the same method contracts |
| Interface Segregation | 4 | The controller consumes narrow Herdr operations; no broad interface was added |
| Dependency Inversion | 4 | Commands and Herdr behavior remain injected; only the approved bounded wait uses a direct runtime primitive |

**SOLID score**: 4/5.

Layer separation matches `steering/structure.md`: deterministic lifecycle orchestration remains in `scripts/`; Herdr remains the worker-isolation boundary. No workflow, agent, extension, or shared-reference responsibility moved into the controller.

### Security Assessment — 5/5

- External programs continue to receive explicit argument arrays; no shell interpolation was added.
- Prompt recovery sends Enter only for the complete deterministic prompt or the conjunction of all three required previews.
- Retry targets the same bound agent name and pane and cannot create a second controller pane.
- Ambiguous, invalid, failed, intervention, and non-settled outcomes stop safely and retain inspection state.
- No secrets, credentials, dependency changes, or expanded deletion boundaries were introduced.

### Performance Assessment — 4/5

- Startup retry is exactly once and waits exactly 1,000 ms.
- Detection polling is bounded, and prompt recovery adds no unbounded allocation or scan.
- Synchronous worker waits are deliberate because issue and step ordering is a correctness invariant.
- Blocking `Atomics.wait` is acceptable for this synchronous CLI boundary and is not used in a repeated hot path.

### Testability Assessment — 5/5

- `run` and every Herdr operation are injectable.
- Fixtures expose prompt envelopes, stderr diagnostics, states, keys, waits, handoffs, notifications, and pane closure.
- Tests cover both success and fail-closed boundaries, including retained workers and interactive review transitions.
- SCN007 adds real Herdr lifecycle and remote-delivery evidence beyond mocks.

### Error Handling Assessment — 5/5

- Stable reason codes and persisted run state remain machine-readable.
- Recovery requires successful Enter, explicit `working`, and settlement before trusting a handoff.
- A failed second startup preserves the pane and reports `agent_start_failed`.
- Handoffs are authoritative only with matching issue/step, `passed`, no intervention, and final idle/done state.
- The live fault-injected exercise reaches terminal delivery without weakening the fail-closed branches.

**Architecture average**: 4.6/5.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Executable Coverage | Passes |
|---------------------|-------------|-------------------------|--------|
| AC1 | Yes: SCN001, SCN002, SCN008 | Jest controller tests | Yes |
| AC2 | Yes: SCN003 | Jest controller tests | Yes |
| AC3 | Yes: SCN004 | Jest controller tests | Yes |
| AC4 | Yes: SCN005, SCN006 | Jest controller tests plus live fault injection | Yes |
| AC5 | Yes: SCN007 | Disposable Herdr/GitHub exercise | Yes |

### Coverage Summary

- Feature scenarios: 8
- Behavioral scenario outcomes: 8 passed
- Focused execution: 2 suites passed; 63 tests passed; 0 failed
- Full execution: 37 suites passed; 365 tests passed; 0 failed; 1 declared opt-in exercise suite skipped
- The skipped suite is guarded by `RUN_EXERCISE_TESTS !== 1`; it is not an unexpected skip.

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `/sdlc-execute #9` |
| **Test Project** | `/tmp/nmg-sdlc-219-smoke`, backed by `Nunley-Media-Group/nmg-sdlc-smoke-20260820001416` |
| **Exercise Method** | `node scripts/exercise-omp.mjs --cwd /tmp/nmg-sdlc-219-smoke --timeout-ms 300000 -- /sdlc-execute #9` |
| **Fault Injection** | PATH-prepended wrapper failed exactly the first `herdr agent start`, created `/tmp/nmg-sdlc-219-herdr-start-failed`, then delegated all calls to real Herdr |
| **Final Run Start** | `2026-08-23T02:13:01.096Z` |

### Captured Output Summary

The disposable run completed `start`, `implement`, `review1`, `fix1`, `review2`, `fix2`, `verify`, and `deliver`. `.omp/sdlc/run.json` has `currentIssue: null`, `currentStep: null`, `failed: null`, and the complete ordered step list. Deliver handoff reports PR #10 merged, issue #9 closed, and branch cleanup. Independent checks confirm PR #10 is `MERGED` at `2026-08-23T02:28:10Z`, issue #9 is `CLOSED`, the disposable worktree is clean on `main`, and `herdr agent list` contains no `s9-*` worker.

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC4 | Recover exactly one injected first-start failure | Pass | Fault marker exists; all eight controller steps subsequently completed |
| AC5 | Complete full queue, merge PR, close issue, and close worker panes | Pass | Run state, deliver handoff, GitHub issue/PR state, clean worktree, and live agent list all satisfy the contract |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `npm test -- --runInBand`: 37 suites passed, 365 tests passed, one declared opt-in suite skipped |
| Skill inventory | Not applicable | No `workflows/`, root `references/`, or `agents/` path changed in `main...HEAD` |
| OMP plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository` passed |
| Skill creator validation | Not applicable | No skill-bundled path was edited during implementation or verification |
| Skill exercise | Pass | Explicit SCN007 disposable execute exercise completed through merge and issue closure |
| Prompt quality | Not applicable | No workflow or agent contract changed |
| Git hygiene | Pass | `git diff --check main...HEAD` exited 0 |

**Gate Summary**: 4/4 applicable gates passed, 0 failed, 0 incomplete; 3 gates not applicable.

---

## Fixes Applied

None during this verification pass. No safe local fix was required.

## Remaining Issues

None.

---

## Positive Observations

- Recovery authorization is narrow and explicitly tested against unrelated visible text.
- Valid handoffs never override an unsafe final lifecycle state.
- Review menus are modeled as distinct observed transitions instead of timing assumptions.
- The exact-startup fault passed both deterministic regression coverage and a complete real Herdr delivery.

---

## Recommendations Summary

### Before PR (Must)

- [x] No remaining local or exercise obligations.

### Short Term (Should)

None.

### Long Term (Could)

None.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-execute.mjs` | 0 | Bounded lifecycle recovery satisfies AC1-AC4 and completed the AC5 smoke queue |
| `scripts/__tests__/sdlc-execute.test.mjs` | 0 | Comprehensive state, prompt, review-menu, retry, and retained-worker coverage |
| `CHANGELOG.md` | 0 | Unreleased defect summary matches user-visible behavior |
| `specs/219-harden-execute-against-transient-herdr-lifecycle-races/requirements.md` | 0 | Approved and fully traced |
| `specs/219-harden-execute-against-transient-herdr-lifecycle-races/design.md` | 0 | Implementation preserves bounded synchronous recovery |
| `specs/219-harden-execute-against-transient-herdr-lifecycle-races/tasks.md` | 0 | T001-T005 complete |
| `specs/219-harden-execute-against-transient-herdr-lifecycle-races/feature.gherkin` | 0 | SCN001-SCN008 have passing evidence |

---

## Recommendation

Ready for PR. All acceptance criteria, applicable local gates, and the required fault-injected end-to-end exercise pass.
