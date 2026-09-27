# Verification Report: Exit native plan mode when write-spec Finished is selected

**Date**: 2026-09-27
**Issue**: #444
**Reviewer**: architecture-reviewer (OMP verify worker)
**Scope**: Implementation verification against spec
**Verification head**: 3789e938bea04e221de611fe361314d0d6a724be

---

## Executive Summary

Both registered validations passed at `3789e93`: `repository.tests` and `repository.nmg-sdlc-smoke`. The smoke gate delivered its self-provisioned issue **#181** through PR **#183** (`MERGED` at `1120143d…`, issue `CLOSED`). The smoke provisioning half of this issue (AC6–AC10) is therefore proven.

The live TUI exercise of the write-spec Finished exit **failed**, and that is the primary defect of this issue. A real OMP TUI session loaded this checkout's extension. After `Finished — stop without writing a spec` was selected, the session never left native plan mode. The host's plan-mode enforcement ends every non-`ask`/non-`propose` turn with a developer reminder (`Plan mode turn ended without a required tool call. You MUST choose exactly one next action now…`). The resulting `agent_end` is non-terminal, so the extension waits, as designed. The model then calls `ask` again, and a terminal `agent_end` never arrives. The session looped through three Finished confirmations with `mode_change` still `plan`. The host-fixture regressions pass because the fixture does not model this host behavior.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 2 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 3 |
| **Overall** | 3.3 |

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

- Local verification: Not complete
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 444 --spec specs/444-… --base main --controller-run-id 41cdfc97-f527-4223-bfee-db3675a75fb2` → `ok: true`, `ceiling: null`
- Artifact: `.omp/sdlc/verification/444.json`, identity `headSha 3789e938bea04e221de611fe361314d0d6a724be`, `steeringHash sha256:c36e776f…`, `specHash sha256:f98cb197…`, tree `clean`
- Coverage: `declared 2`, `recorded 2`, `complete true`, no missing, duplicate, or unknown results
- `steering/manifest.json` loaded: 4 managed modules, 3 snippets, and 1 extension (`project.nmg-sdlc-smoke`). The steering ceiling does not constrain the status. The status is capped at **Fail** by the failed live acceptance evidence below.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Continue-loop Finished exits plan mode fully | **Fail** | Same mechanism as AC2. `exitPlanMode` runs only on a terminal `agent_end` (`src/extension.ts:194-205`). Live native plan mode never produces that terminal end after Finished (see AC2). Covered only by the host fixture (`extension-commands.test.mjs:280`), which ends the turn terminally by fiat. |
| AC2 | Initial-picker Finished exits plan mode fully | **Fail** | Live TUI exercise (below): Finished was selected three times. Each text-only turn received the host reminder `Plan mode turn ended without a required tool call…`, and the agent called `ask` again. The session's `mode_change` entries stayed `['plan']`, and no `/plan` was dispatched. |
| AC3 | Non-Finished selections keep plan mode | Pass | `writeSpecFinishedSelection` exact-label match (`src/sdlc-commands.mjs`); `tool_result` gate on `writeSpec.active`; SCN003 host-fixture cases (`kept` expectation) pass. |
| AC4 | Undispatchable exit fails safe | Partial | The draft, no-UI, unfocused, throwing, and declined cases pass in the fixture. Waiting on `willContinue: true` is implemented as specified, but that behavior is what defeats AC1/AC2 live. When no terminal end arrives, the warning never shows, so the user gets neither the exit nor the fallback notice. |
| AC5 | Post-publication continuation is preserved | Pass | `submitContinuation` is unchanged apart from `focusedEditor` extraction and `active = true`; the continuation wins over the exit (`agent_end` checks `pending` first); `continuationWins` and continuation tests pass. |
| AC6 | Smoke gate self-provisions without an explicit queue | Pass | Live: the provider drafted smoke #181 (created 05:26:58Z under `df5e33e`, whose provisioning code is identical to HEAD's) and published spec PR #182 (`docs: approve spec for #181`, `MERGED`, label `spec-created`). This run delivered #181 via PR #183 `MERGED` at `1120143d60f33f86a52e83f36d9ae15e41395472`, issue `CLOSED`. |
| AC7 | Every provisioning gate is answered automatically | Pass | `askDecision` / `planGateVisible` send only `enter`. The #181 provisioning completed without operator input. SCN007 fixture asserts the exact key sequence and bare `/sdlc-write-spec 179`. |
| AC8 | Provisioning completion is proven from GitHub | Pass | `publishedSpec` checks the `spec-created` label plus the merged PR by exact title, and `finally` closes the owned pane; SCN008 tests pass. |
| AC9 | Provisioning failures fail closed; no duplicates | Pass | Live recovery reuse: smoke recovery state records `provisioned {"issue":181,"published":true}`, and this run reused #181 with no second draft. SCN009 tests cover zero or multiple issues, unknown or free-form gates, stalls, and the interrupted-provisioning fail-closed path. |
| AC10 | Explicit queues keep priority | Pass | `resolveQueue` checks `config.issues` and a non-blank env value first; SCN010 tests (valid and invalid) pass. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Detect Finished selections | Complete | `WRITE_SPEC_FINISHED_LABELS`, `writeSpecFinishedSelection` |
| T002 | Exit plan mode after terminal Finished turn | Complete (ineffective live) | Built as designed, but the terminal-`agent_end` trigger is never reached under native plan-mode enforcement |
| T003 | Align write-spec contracts | Complete | WORKFLOW.md step 7 and Continue-loop, publish.md, interactive-gates.md, README |
| T004 | Regression coverage for the Finished exit | Complete | Fixture passes, but it does not model the host's plan-mode reminder loop |
| T005 | Smoke self-provisioning | Complete | Proven live (#181/#182/#183) |
| T006 | Steering registration | Complete | manifest `config.provision.need`; snippets updated |
| T007 | Smoke regressions and docs | Complete | SCN006–SCN010; README and CHANGELOG |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Classification lives in `sdlc-commands.mjs`, dispatch in `extension.ts`, and provisioning in its own `provisionSmokeIssue`. The smoke module grows past 1,600 lines. |
| Open/Closed | 4 | The explicit-queue path is unchanged; provisioning is additive via `resolveQueue`. |
| Liskov Substitution | 4 | The injected `herdr` adapter matches `createHerdrAdapter`. |
| Interface Segregation | 4 | `HostEditor` gains only `onSubmit`. |
| Dependency Inversion | 4 | Herdr, gh, sleep, and poll interval are injectable; plugin modules load through a guarded dynamic import that fails closed. |

### Layer Separation

The extension keeps git and GitHub out of the exit path, and only builtin `/plan` is dispatched. The steering provider stays within its validation-provider role, and all smoke mutations go through the real workflows in an owned pane.

### Dependency Flow

`steering/extensions` → `src`/`scripts` via dynamic import. The documented fallback (`nmg-sdlc-smoke plugin modules unavailable`) keeps the staged-copy validation working.

---

## Security Assessment

- [x] Authentication: `gh auth` precheck before provisioning; no credentials requested or logged
- [x] Authorization: mutations are limited to the allowlisted `Nunley-Media-Group/nmg-sdlc-smoke` origin; only the owned pane is closed
- [x] Input validation: exact Finished labels; issue-row regex; recommended index bounds-checked
- [x] Injection prevention: Herdr and gh commands are argument arrays; the prompt text is a single argv element
- [x] Data protection: the screen snapshot is `bounded`; the provisioning clone is retained only on failure

---

## Performance Assessment

- [x] Async patterns: `/plan` toggles are awaited serially; the provisioning poll uses a fixed interval with no wall-clock deadline
- [x] Caching: N/A
- [x] Resource management: pane is closed in `finally`; clone removed on success
- [x] Query optimization: `gh issue list --limit 20` bounded; session JSONL read per blocked poll only

---

## Error Handling Assessment

The Finished exit's fallback warning (AC4) fires only on a terminal `agent_end`. In the live failure mode, no terminal end ever happens, so the user gets neither the exit nor the warning. They stay in a re-ask loop, which is the original defect. Provisioning errors map cleanly to `failed` or `incomplete` with evidence.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | SCN001 | Yes (host fixture) | Yes (fixture) / **No (live)** |
| AC2 | SCN002 | Yes (host fixture) | Yes (fixture) / **No (live)** |
| AC3 | SCN003 | Yes | Yes |
| AC4 | SCN004 | Yes | Yes (fixture) |
| AC5 | SCN005 | Yes | Yes |
| AC6 | SCN006 | Yes | Yes (fixture + live) |
| AC7 | SCN007 | Yes | Yes (fixture + live) |
| AC8 | SCN008 | Yes | Yes |
| AC9 | SCN009 | Yes | Yes (fixture + live reuse) |
| AC10 | SCN010 | Yes | Yes |

### Coverage Summary

- Feature files: 10 scenarios (SCN001–SCN010)
- Step definitions: Jest ESM tests in `scripts/__tests__/extension-commands.test.mjs`, `nmg-sdlc-smoke.test.mjs`, `sdlc-commands.test.mjs`
- `npm test -- --runInBand` (registered `repository.tests`): exit 0
- Fidelity gap: the host fixture's `agent_end` is terminal on demand. The real host injects a plan-mode reminder that continues the turn after any text-only ending.

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `write-spec` (bare `/sdlc-write-spec`, initial-picker Finished) |
| **Test Project** | Disposable non-shallow clone of `Nunley-Media-Group/nmg-sdlc-smoke` in a platform temp dir (removed after capture) |
| **Exercise Method** | Real OMP TUI in an owned Herdr pane: `herdr agent start ex444 --kind omp -- --no-extensions --no-skills --extension <checkout>/src/extension.ts --plugin-dir <checkout> --add-dir <checkout>`, then `herdr agent prompt ex444 /sdlc-write-spec`, then `down` + `enter` on Finished. `exercise-omp.mjs` (RPC) cannot enter native plan mode for interactive commands; the RPC attempt produced no `agent_end` and was explicitly cancelled. |
| **Interactive gate handling** | Key presses only (`down`, `enter`); read-only picker, so no GitHub mutation |
| **Duration** | ~10 minutes including polling |

### Captured Output Summary

Session JSONL (copy retained at `/tmp/nmg-sdlc-444-finished-exit-session.jsonl`), in order:

1. `ask` result: `Finished — stop without writing a spec`
2. assistant: `No spec written: you chose Finished at the issue picker…`
3. developer: `<system-reminder> Plan mode turn ended without a required tool call. You MUST choose exactly one next action now: 1. Call ask … OR 2. … xd://propose …`
4. assistant: `ask` ("You chose Finished… Plan mode needs one more action before this turn can end…"). Finished was selected again.
5. assistant text, then the same developer reminder again, then a third `ask` ("Plan mode keeps requiring an action even though you chose Finished…")

`mode_change` entries throughout: `['plan']`. No `/plan` dispatch and no warning notification were observed.

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC2 | Initial-picker Finished exits plan mode | Fail | Mode stayed `plan`; the host reminder forced repeated `ask` calls |
| AC4 | Fail-safe warning | Fail (live) | No terminal `agent_end`, so no warning was shown |

### Notes

The pane and clone were owned by this exercise; the pane was closed and the clone removed after the session JSONL was captured.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (registered) | Pass | `npm test -- --runInBand` exited 0 at `3789e93` |
| `repository.nmg-sdlc-smoke` (registered) | Pass | `nmg-sdlc-smoke delivered #181`; PR #183 `MERGED` at `1120143d60f33f86a52e83f36d9ae15e41395472`; issue #181 `CLOSED`; execute: start/implement/verify/deliver passed |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check` → `clean (90 items mapped)` |
| OMP plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository` → passed |
| Skill exercise (deterministic) | Pass | `node scripts/skill-exercise-runner.mjs --skill write-spec` → 14 pass, 0 fail |
| Live skill proof | **Fail** | TUI exercise above: Finished does not leave plan mode |
| Prompt quality | Fail | WORKFLOW.md says "End the turn there without another `ask` or `xd://propose`", but the host's plan-mode enforcement makes that instruction unexecutable (Complete paths, Output chain) |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |

**Gate Summary**: 6/8 gates passed, 2 failed, 0 incomplete

---

## Fixes Applied

None. The publication scope binds this verify worker to `verification-report.md` only. The defect also needs a spec change: AC4's "non-terminal `agent_end` waits" is the behavior that blocks the exit.

## Remaining Issues

### High Priority

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Architecture / Error Handling |
| **Location** | `src/extension.ts:194-205` (`agent_end`), `exitPlanMode`; spec AC1/AC2/AC4, design Fix Strategy |
| **Issue** | The plan-mode exit is armed for the next *terminal* `agent_end`. Native plan mode never ends a turn terminally after a text-only reply: it injects `Plan mode turn ended without a required tool call…` (the non-terminal end is `willContinue: true`), and the model re-asks. The exit therefore never runs, and neither does the warning fallback. |
| **Impact** | The original defect persists: selecting Finished loops forever in plan mode until the user exits manually. |
| **Reason Not Fixed** | Needs a spec amendment of the trigger and the AC4 non-terminal clause. Candidates: dispatch the exit on the first `agent_end` after a Finished selection, including `willContinue: true`, before the reminder is acted on; or exit from the Finished `ask` `tool_result`. Also outside this worker's writable scope. |

### Medium Priority

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Testing |
| **Location** | `scripts/__tests__/extension-commands.test.mjs:280` (host fixture) |
| **Issue** | The fixture does not model the host's plan-mode enforcement (a reminder plus a continued turn after a text-only ending), so SCN001/SCN002 pass while the live behavior fails. |
| **Impact** | The regressions cannot catch the live failure. |
| **Reason Not Fixed** | Depends on the redesigned trigger. Outside writable scope. |

## Recommendation

Needs fixes: revise the Finished-exit trigger in the spec and design so that it survives native plan-mode enforcement. Then re-implement it, add a fixture that emits `willContinue: true` plus a re-ask after Finished, and rerun the full registered gate and a live TUI exercise.
