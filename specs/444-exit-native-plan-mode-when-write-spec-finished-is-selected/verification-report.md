# Verification Report: Exit native plan mode when write-spec Finished is selected

**Date**: 2026-09-27
**Issue**: #444
**Reviewer**: architecture-reviewer (OMP verify worker)
**Scope**: Implementation verification against spec
**Verification head**: 6fda468bf921de74e226d20c1264fcd001e4eae2

---

## Executive Summary

The primary defect is fixed at `6fda468`. A live OMP TUI session loaded this checkout. The user selected `Finished — stop without writing a spec`, and the session went `plan` → `plan_paused` → `none` with no user command. The host's forced decision continuation was aborted, and the TUI printed `Plan mode disabled.`

Overall status is still **Fail**. The required `repository.nmg-sdlc-smoke` validation failed with `nmg-sdlc-smoke terminal head advancement rejected`. The cause is a defect in the smoke provider's provisioning recovery: it reuses the already-delivered, provisioned smoke issue #181 that was recorded for the previous verification head `3789e93`. That sends the run into the terminal-head-advancement path, which is allowlisted only for issue #379.

A second finding: the new trigger exits on a non-terminal `agent_end` (`willContinue: true`), and AC4's non-terminal clause forbids that. The approved spec needs to be amended to match the behavior the host requires.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 3 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 3 |
| **Overall** | 3.7 |

### Implementation Status: Fail
**Total Issues**: 2

---

## Issue Scope

- Active issue: #444
- Spec: `specs/444-exit-native-plan-mode-when-write-spec-finished-is-selected`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9]; tasks [T001, T002, T003, T004, T005, T006, T007]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008, SCN009, SCN010]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":444,"specPath":"specs/444-exit-native-plan-mode-when-write-spec-finished-is-selected","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9"],"tasks":["T001","T002","T003","T004","T005","T006","T007"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Not complete (required `repository.nmg-sdlc-smoke` failed)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 444 --spec specs/444-… --base main --controller-run-id 41cdfc97-f527-4223-bfee-db3675a75fb2` → `ok: false`, `ceiling: Fail`, exit 1
- Artifact: `.omp/sdlc/verification/444.json`, identity `headSha 6fda468bf921de74e226d20c1264fcd001e4eae2`, `steeringHash sha256:c36e776f…`, `specHash sha256:f98cb197…`, tree `clean`
- Coverage: `declared 2`, `recorded 2`, `complete true`, no missing, duplicate, or unknown results
- `repository.tests` (builtin.command, required): `passed`
- `repository.nmg-sdlc-smoke` (project.nmg-sdlc-smoke, required): `failed`, `nmg-sdlc-smoke terminal head advancement rejected`. The retained smoke clone listed in the evidence is `/var/folders/…/nmg-sdlc-smoke-SEwk82`; that is the clonePath recorded in the prior run's terminal state.
- `steering/manifest.json` loaded: 4 managed modules, 3 snippets, and 1 extension (`project.nmg-sdlc-smoke`). Ceiling: **Fail**.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Continue-loop Finished exits plan mode fully | Pass | `planDecisionContinuation` plus the `agent_end` exit path in `src/extension.ts`. The SCN001 host fixture models the forced decision continuation: `ends: ['continued','aborted']`, modes `plan → plan_paused → none`, exactly two `/plan`, and one continuation prompt. The live mechanism is shared with AC2. |
| AC2 | Initial-picker Finished exits plan mode fully | Pass | Live TUI exercise (below). Session entries after the Finished `ask` result: assistant `stop` (text only), host reminder `Plan mode turn ended without a required tool call…`, assistant `aborted`, `mode_change plan_paused`, `mode_change none`. The screen showed `Stopped without writing a spec…` and `Plan mode disabled.` No Discovery ran and nothing was re-asked. |
| AC3 | Non-Finished selections keep plan mode | Pass | Exact-label `writeSpecFinishedSelection` and the `writeSpec.active` gate. The SCN003 fixture covers issue row, Continue, custom `#12`/`abc`, errored, a later ask, another command, and no session: all `kept`. |
| AC4 | Undispatchable exit fails safe | Partial | The draft, no-UI, unfocused, throwing-submit, and declined-confirmation cases keep the draft, warn once, and do not retry (fixture). The spec's clause "non-terminal `agent_end` (`willContinue: true`) → dispatches nothing" no longer holds for the plan-mode decision continuation: the exit is dispatched there by design, which is what makes AC1 and AC2 work live. Tool-call and error continuations still wait (`waitingNonterminal`). The approved spec has not been amended to match. |
| AC5 | Post-publication continuation is preserved | Pass | `agent_end` checks `writeSpec.pending` before the exit on a terminal end, and the `willContinue` path returns when pending. `continuationWins` and `restarted` fixtures pass. |
| AC6 | Smoke gate self-provisions without an explicit queue | Fail | This run did not provision: `resolveQueue` → `provision`, but the recovery state `c617990…json` (`phase terminal`, `provisioned {issue:181,published:true}`, head `3789e93`) supplied `issues=[181]` (`nmg-sdlc-smoke.mjs:1049-1051`). The provider then took the changed-identity terminal path (`:1078-1092`) and was rejected. Delivering this issue at this head was not proven. |
| AC7 | Every provisioning gate is answered automatically | Pass (fixture) | The SCN007 fixture asserts the key-only sequence and bare `/sdlc-write-spec 179`. Not re-exercised live in this run because provisioning was skipped. |
| AC8 | Provisioning completion is proven from GitHub | Pass (fixture) | `publishedSpec` checks the label plus the exact merged title. SCN008 passes. |
| AC9 | Provisioning failures fail closed; no duplicates | Fail | Reuse is specified for a retry of the *same* outer verification identity. Here the identity changed (`3789e93` → `6fda468`), and the provider still reused a delivered issue, contrary to the steering rule "Delivered issues are terminal and must not be reused". The result is a permanent failure for every later head. |
| AC10 | Explicit queues keep priority | Pass | The SCN010 fixtures (valid and invalid) pass under `repository.tests`. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Detect Finished selections | Complete | `WRITE_SPEC_FINISHED_LABELS`, `writeSpecFinishedSelection` |
| T002 | Exit plan mode after Finished turn | Complete | Trigger moved to the plan-decision continuation (`6fda468`); proven live |
| T003 | Align write-spec contracts | Complete | `publish.md`, `interactive-gates.md`, and CHANGELOG describe the decision-continuation exit |
| T004 | Regression coverage for the Finished exit | Complete | The fixture now models the host's forced continuation and abort |
| T005 | Smoke self-provisioning | Incomplete | Recovery reuses a delivered provisioned issue across verification identities |
| T006 | Steering registration | Complete | `config.provision.need` registered; snippets updated |
| T007 | Smoke regressions and docs | Incomplete | No regression covers a changed-identity retry after a terminal provisioned delivery |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | `planDecisionContinuation` is a narrow predicate. The smoke module is over 1,600 lines. |
| Open/Closed | 4 | The explicit-queue path is unchanged. |
| Liskov Substitution | 4 | The Herdr adapter can be injected. |
| Interface Segregation | 4 | Minimal `AgentEnd` structural type. |
| Dependency Inversion | 4 | Host events are read structurally, with no `@oh-my-pi` dependency. |

### Layer Separation

The exit path dispatches only builtin `/plan` through the focused editor and calls no git or GitHub. Smoke mutations go only through the real workflows.

### Dependency Flow

Unchanged: `steering/extensions` loads `src`/`scripts` through a guarded dynamic import.

---

## Security Assessment

- [x] Authentication: `gh auth` precheck
- [x] Authorization: the smoke origin is allowlisted, and only owned panes are closed
- [x] Input validation: exact labels; `stopReason` error/aborted excluded from the exit trigger
- [x] Injection prevention: argument arrays throughout
- [x] Data protection: no secrets in evidence

---

## Performance Assessment

- [x] Async patterns: `exitPlanMode` is now `async` and each toggle is awaited, with no detached inner IIFE
- [x] Resource management: exercise pane closed and clone removed
- [x] Bounded scans: `findLast` over the turn's messages only

---

## Error Handling Assessment

The Finished exit's fallbacks behave as specified. The smoke provider's recovery turns a normal head change into a permanent `failed` result (`terminal head advancement rejected`) instead of provisioning a fresh issue, so no recovery is possible without deleting the state by hand.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | SCN001 | Yes | Yes |
| AC2 | SCN002 | Yes | Yes (fixture + live) |
| AC3 | SCN003 | Yes | Yes |
| AC4 | SCN004 | Yes | Yes (fixture; spec clause diverges) |
| AC5 | SCN005 | Yes | Yes |
| AC6 | SCN006 | Yes | Fixture yes / live **No** |
| AC7 | SCN007 | Yes | Yes (fixture) |
| AC8 | SCN008 | Yes | Yes (fixture) |
| AC9 | SCN009 | Yes | Fixture yes / live **No** (changed-identity reuse) |
| AC10 | SCN010 | Yes | Yes |

### Coverage Summary

- Feature files: 10 scenarios (SCN001–SCN010)
- `npm test -- --runInBand` (registered `repository.tests`): passed
- Gap: no fixture covers a provisioning-mode state in `terminal` phase under a changed outer identity

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `write-spec` (bare `/sdlc-write-spec`, initial-picker Finished) |
| **Test Project** | Disposable clone of `Nunley-Media-Group/nmg-sdlc-smoke` in a platform temp dir (removed after capture) |
| **Exercise Method** | Real OMP TUI in an owned Herdr pane: `herdr agent start ex444v --kind omp -- --no-extensions --no-skills --extension <checkout>/src/extension.ts --plugin-dir <checkout> --add-dir <checkout>`, then `herdr agent prompt ex444v /sdlc-write-spec`, then `down` + `enter` on Finished. `exercise-omp.mjs` (RPC/print) cannot enter native plan mode because interactive commands fail closed without a UI, so the TUI is the evidence surface. |
| **Interactive gate handling** | Key presses only; read-only picker; no GitHub mutation |
| **Duration** | ~1 minute |

### Captured Output Summary

Session JSONL (copy at `/tmp/nmg-sdlc-444-verify-finished-exit-session.jsonl`), in order: `mode_change plan` → workflow prompt → `bash` (missing-spec-created) → `ask` → toolResult (`Finished — stop without writing a spec`) → assistant `stop` [text] → developer `Plan mode turn ended without a required tool call…` → assistant `aborted` → `mode_change plan_paused` → `mode_change none`. Screen: `Stopped without writing a spec. I didn't run discovery, and nothing was proposed, written or published.` and `Plan mode disabled.`

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC2 | Initial-picker Finished exits plan mode | Pass | Final mode `none`; no re-ask; no user command |
| AC4 | Fail-safe warning | N/A (live) | The exit succeeded, so no warning was expected or shown |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (registered) | Pass | `npm test -- --runInBand` passed at `6fda468` |
| `repository.nmg-sdlc-smoke` (registered) | **Fail** | `nmg-sdlc-smoke terminal head advancement rejected`; recovery state `phase terminal`, `provisioned #181`, head `3789e93` |
| Skill inventory | Pass | `clean (90 items mapped)` |
| OMP plugin surface | Pass | `Plugin surface validation passed: repository` |
| Skill exercise (deterministic) | Pass | `write-spec`: 14 pass, 0 fail |
| Live skill proof | Pass | TUI exercise above |
| Prompt quality | Pass | Finished branches are executable now that the extension exits at the decision continuation |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |

**Gate Summary**: 7/8 gates passed, 1 failed, 0 incomplete

---

## Fixes Applied

None. The verify publication scope permits writes only to `verification-report.md`. Both findings need changes to `steering/extensions/nmg-sdlc-smoke.mjs` and its tests, or to the approved spec.

## Remaining Issues

### High Priority

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Error Handling / Spec Compliance (AC6, AC9) |
| **Location** | `steering/extensions/nmg-sdlc-smoke.mjs:1049-1092` (provision-queue recovery → `validateTerminalHeadAdvance`) |
| **Issue** | In provisioning mode, a stored state with `provisioned.issue` always supplies the queue, even when the state is `terminal` (already delivered) and belongs to a different outer verification identity. The changed-identity branch then requires the #379-only terminal head advancement and rejects the run. |
| **Impact** | After one successful smoke delivery, every later implementation head of the same issue fails the required smoke gate permanently. It also violates "Delivered issues are terminal and must not be reused". |
| **Reason Not Fixed** | Outside this worker's writable scope. Suggested fix: when `queue.kind === "provision"` and the state is `terminal`/`cleanup_pending` for a different outer request, supersede it and provision a fresh issue. Reuse `provisioned` only for the same identity or for a not-yet-delivered issue. Add a SCN009 regression for this case. |

### Medium Priority

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Spec Compliance (AC4, design `agent_end`) |
| **Location** | `src/extension.ts` `planDecisionContinuation` / `agent_end`; spec `requirements.md` AC4 "But Given", `design.md` Fix Strategy |
| **Issue** | The implementation exits on the plan-mode decision continuation (`willContinue: true`), but the approved AC4 says a non-terminal `agent_end` dispatches nothing. AC1 and AC2 also say "after that turn ends terminally". |
| **Impact** | The approved contract and the shipped behavior disagree. The behavior is correct and required by the host (proven live); the spec is stale. |
| **Reason Not Fixed** | Spec files are read-only in the verify scope. The spec needs an amendment limiting AC4's non-terminal clause to non-decision continuations. |

## Recommendation

Needs fixes. Fix the smoke provider's changed-identity reuse of a delivered provisioned issue and add a regression for it. Amend AC4 and the design to describe the decision-continuation trigger. Then rerun the full registered gate at the new head.
