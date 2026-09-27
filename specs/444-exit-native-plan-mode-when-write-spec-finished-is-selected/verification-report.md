# Verification Report: Exit native plan mode when write-spec Finished is selected

**Date**: 2026-09-27
**Issue**: #444
**Reviewer**: architecture-reviewer (OMP verify worker)
**Scope**: Implementation verification against spec
**Verification head**: 3447d46386e5e24824f9d0f0015eb51f77bed045

---

## Executive Summary

The primary defect is fixed. `src/extension.ts`, `src/sdlc-commands.mjs`, `workflows/`, `references/` and `agents/` are byte-identical between `6fda468` and `3447d46`, so the prior live TUI exercise still applies. In that exercise, selecting `Finished — stop without writing a spec` took the session `plan` → `plan_paused` → `none` with no user command.

The `3447d46` smoke recovery fix works live. At the new head, the provider superseded the delivered provisioned issue #181 and provisioned a fresh issue, #184, instead of reusing #181.

Overall status is still **Fail**:

1. The required `repository.nmg-sdlc-smoke` validation failed with `nmg-sdlc-smoke provisioning stalled during spec`. In the spec phase, the provider never answered the write-spec plan-approval gate for #184. The session proposed at `08:06:50Z`, and the stall fired 20 polls later at `08:07:55Z`. The captured 16-column pane screen contains no `Plan mode` selector text. Issue #184 remains OPEN with no spec PR.
2. The spec divergence found at `6fda468` is still unresolved. The approved AC4 "But Given" clause, design `agent_end` and T002 all say `willContinue: true` dispatches nothing. The implementation deliberately exits on the plan-mode decision continuation (`willContinue: true`).

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 3 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 3.8 |

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

- Runner: `sdlc-verify-steering.mjs --project . --issue 444 --spec specs/444-… --base main --controller-run-id 41cdfc97-f527-4223-bfee-db3675a75fb2`. Result: `ok: false`, `ceiling: Fail`, exit 1, about 567 s.
- Artifact: `.omp/sdlc/verification/444.json`, generated `2026-09-27T08:07:55.489Z`.
  - Identity: `headSha 3447d46386e5e24824f9d0f0015eb51f77bed045`, `steeringHash sha256:e6d0c39e…`, `specHash sha256:f98cb197…`, tree `clean`.
  - 19 changed paths against `main`.
- Coverage: `declared 2`, `recorded 2`, `complete true`. No missing, duplicate or unknown results.
- `repository.tests` (builtin.command, required): `passed`. `npm test -- --runInBand` exited 0: 49 suites passed, 1 skipped; 832 tests passed, 2 skipped.
- `repository.nmg-sdlc-smoke` (project.nmg-sdlc-smoke, required): `failed`, `nmg-sdlc-smoke provisioning stalled during spec`.
  - Evidence: provisioning clone `/var/folders/46/…/T/nmg-sdlc-smoke-provision-4RBe1T` (retained), baseline `[{"number":181}]`, Herdr pane `wF:p21`, agent `smoke-provision-1d801a5e`.
  - Prompts: `/sdlc-draft-issue <need>`, then `/sdlc-write-spec 184`.
  - Last agent status `done`. Session `…/2026-09-27T08-04-40-810Z_01a0e1e5-….jsonl`.
- `steering/manifest.json` loaded 4 managed modules (`product`, `structure`, `tech`, `verification`), 3 snippets and 1 extension (`project.nmg-sdlc-smoke`).
- Ceiling: **Fail**.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Continue-loop Finished exits plan mode fully | Pass | `writeSpecFinishedSelection` arms `exitPending`. `planDecisionContinuation` and `exitPlanMode` in `src/extension.ts` await `onSubmit("/plan")` for each toggle. The SCN001 fixture (`extension-commands.test.mjs`) ends at mode `none` after exactly two `/plan` and one continuation prompt. It passes under `repository.tests`. |
| AC2 | Initial-picker Finished exits plan mode fully | Pass | Live TUI exercise at `6fda468`; the source is unchanged at this head. After the Finished `ask` result, the session went through assistant `stop`, the host decision reminder, assistant `aborted`, `mode_change plan_paused` and `mode_change none`. The screen showed `Plan mode disabled.` No Discovery ran and nothing was re-asked. |
| AC3 | Non-Finished selections keep plan mode | Pass | The exact-label check and the `writeSpec.active` gate. The SCN003 fixture covers an issue row, Continue, custom `#12`/`abc`, an errored result, a later ask, another command, and no session; every case is kept. |
| AC4 | Undispatchable exit fails safe | Partial | Pass (fixture) for these cases: draft, no UI, unfocused editor, throwing submit and declined confirmation. Each keeps the draft, warns `NMG SDLC: write-spec finished, but plan mode is still active; /plan exits it.` once, and does not retry. **Diverges** from the approved "But Given" clause (non-terminal `willContinue: true` dispatches nothing): `agent_end` exits on a plan-mode decision continuation (`willContinue: true`, text-only assistant reply). Design ("return on `willContinue === true`") and T002 say the same thing, and the spec is unamended. |
| AC5 | Post-publication continuation is preserved | Pass | `agent_end` runs `submitContinuation` when `pending` on a terminal end. The `willContinue` path returns while `pending`. `startInteractiveCommand` resets state. The `continuationWins` and `restarted` fixtures pass. |
| AC6 | Smoke gate self-provisions without an explicit queue | Fail | Live: the provider cloned the allowlisted repo, opened one owned pane and drafted exactly one new issue (#184 > baseline 181). It then submitted bare `/sdlc-write-spec 184`. Spec provisioning never finished (no `spec-created`, no merged spec PR), so delivery for `[184]` was not run. |
| AC7 | Every provisioning gate is answered automatically | Partial | Draft phase, live: the ask was answered at `08:03:44Z`. The plan approval was accepted within about 1 s: `mode plan` `08:04:39.654Z`, then `mode none` `08:04:40.808Z`. Spec phase, live: after `xd://propose` (`08:06:50Z`, `mode_change plan`), no key was sent. The session ended by `sighup` at pane close (`08:07:55Z`). SCN007 passes as a fixture. |
| AC8 | Provisioning completion is proven from GitHub | Pass (fixture) | `publishedSpec` requires `spec-created` and a merged `docs: approve spec for #N` PR. SCN008 passes. Not reached live. |
| AC9 | Provisioning failures fail closed; no duplicates | Pass | Live: the stall returned `failed` with screen snapshot, agent status, session path and a retained clone, and the owned pane was closed. The recovery store records `provisioned #184`. The new SCN009 changed-identity fixture passes, and the live run superseded delivered #181 instead of reusing it. |
| AC10 | Explicit queues keep priority | Pass | SCN010 valid and invalid fixtures pass under `repository.tests`. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Detect Finished selections | Complete | `WRITE_SPEC_FINISHED_LABELS`, `writeSpecFinishedSelection` |
| T002 | Exit plan mode after Finished turn | Complete (diverges) | Proven live. Acceptance line "`willContinue: true` dispatches nothing" is contradicted by design. |
| T003 | Align write-spec contracts | Complete | `WORKFLOW.md` step 7 and the Continue-loop Finished paragraph, `publish.md`, `interactive-gates.md`, README |
| T004 | Regression coverage for the Finished exit | Complete | Fixture models the host's forced continuation and its abort |
| T005 | Smoke self-provisioning | Incomplete | The spec-phase plan approval was not detected live |
| T006 | Steering registration | Complete | `config.provision.need` registered; snippets updated |
| T007 | Smoke regressions and docs | Complete | SCN009 changed-identity regression added in `3447d46`; README/CHANGELOG updated |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | `focusedEditor`, `submitContinuation`, `exitPlanMode` and `planDecisionContinuation` are narrow. The smoke module is still over 1,650 lines. |
| Open/Closed | 4 | The explicit-queue path is unchanged; provisioning is an added branch of `resolveQueue`. |
| Liskov Substitution | 4 | The Herdr adapter and `runCommand` can be injected. |
| Interface Segregation | 4 | Minimal structural `AgentEnd` and `HostEditor` types |
| Dependency Inversion | 4 | No `@oh-my-pi` dependency; plugin modules are loaded through a guarded dynamic import |

### Layer Separation

The exit path dispatches only builtin `/plan` through the focused editor and calls no git or GitHub. Smoke mutations go only through the real workflows in an owned pane.

### Dependency Flow

Unchanged: `steering/extensions` loads `src`/`scripts` through a guarded dynamic import.

---

## Security Assessment

- [x] Authentication: `gh auth` precheck
- [x] Authorization: the smoke origin is allowlisted, and only the owned pane (`wF:p21`) was closed
- [x] Input validation: exact labels; `stopReason` `error`/`aborted` never trigger the exit
- [x] Injection prevention: argument arrays throughout; the provisioning `need` is sent as a single prompt argument
- [x] Data protection: no secrets in evidence

---

## Performance Assessment

- [x] Async patterns: each `/plan` toggle is awaited; no detached race
- [x] Resource management: owned pane closed; the failed provisioning clone is retained by contract
- [x] Bounded scans: `findLast` over the turn's messages; poll loop at 3 s intervals with a 20-poll stall bound

---

## Error Handling Assessment

The Finished-exit fallbacks behave as specified. Smoke provisioning failed closed with complete evidence and did not duplicate issues. The changed-identity supersede added in `3447d46` removes the permanent `terminal head advancement rejected` failure. Remaining weakness: the spec-phase plan gate goes unrecognized, and this is reported only as a generic stall.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | SCN001 | Yes | Yes |
| AC2 | SCN002 | Yes | Yes (fixture + live at unchanged source) |
| AC3 | SCN003 | Yes | Yes |
| AC4 | SCN004 | Yes | Yes (fixture; spec clause diverges) |
| AC5 | SCN005 | Yes | Yes |
| AC6 | SCN006 | Yes | Fixture yes / live **No** (spec phase stalled) |
| AC7 | SCN007 | Yes | Fixture yes / live draft yes, spec plan gate **No** |
| AC8 | SCN008 | Yes | Yes (fixture) |
| AC9 | SCN009 | Yes | Yes (fixture + live fail-closed and supersede) |
| AC10 | SCN010 | Yes | Yes |

### Coverage Summary

- Feature file: 10 scenarios (SCN001–SCN010)
- `npm test -- --runInBand` (registered `repository.tests`): passed, 832 passed / 2 skipped
- Gap: no fixture covers a spec-phase plan-approval screen as rendered in a very narrow pane (about 16 columns, after a long `Write` preview)

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `write-spec` (bare `/sdlc-write-spec`, initial-picker Finished); live smoke provisioning of `draft-issue` and `write-spec` |
| **Test Project** | Disposable clones of `Nunley-Media-Group/nmg-sdlc-smoke` |
| **Exercise Method** | Finished exit: real OMP TUI in an owned Herdr pane at `6fda468`. The extension and workflow sources are identical at `3447d46` (`git diff --stat 6fda468 HEAD -- src workflows references agents` is empty). `exercise-omp.mjs` (RPC/print) cannot enter native plan mode, because interactive commands fail closed without a UI. Smoke: the registered provider at `3447d46`. |
| **Interactive gate handling** | Key presses only |
| **Duration** | Finished exit about 1 minute; smoke run about 9.5 minutes |

### Captured Output Summary

- Finished exit (unchanged source): `mode_change plan` → `ask` → Finished result → assistant `stop` → decision reminder → assistant `aborted` → `mode_change plan_paused` → `mode_change none`. The screen showed `Plan mode disabled.`
- Smoke draft session `…08-03-05-517Z_01a0e1e3….jsonl`: `ask` at `08:03:44Z`, `xd://propose` at `08:04:39.636Z`, `mode none` at `08:04:40.808Z`. Issue #184 `Add public greeting_has_less_than helper` was created.
- Smoke spec session `…08-04-40-810Z_01a0e1e5….jsonl`: last entries are `xd://propose` → `Plan ready for review.` → `mode_change plan` (`08:06:50.036Z`) → `session_exit sighup` (`08:07:55.424Z`).
  - The final screen is about 16 columns wide. It shows the `Write` preview, `propose … Plan ready for …` and the editor box, with no `Plan mode` text.
  - `gh issue view 184`: OPEN, label `enhancement` only. `gh pr list --search "spec for #184"`: empty.

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC2 | Initial-picker Finished exits plan mode | Pass | Final mode `none`; no re-ask; no user command |
| AC6 | Self-provision and deliver | Fail | Spec phase stalled; no delivery |
| AC7 | Automatic gate answers | Partial | Draft gates answered; spec plan approval never answered |
| AC9 | Fail closed, no duplicate | Pass | `failed` with evidence; pane closed; clone retained; fresh #184 instead of reusing #181 |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (registered) | Pass | `npm test -- --runInBand` exit 0 at `3447d46` |
| `repository.nmg-sdlc-smoke` (registered) | **Fail** | `nmg-sdlc-smoke provisioning stalled during spec`; #184 has no spec |
| Skill inventory | Pass | `Skill inventory audit: clean (90 items mapped).` |
| OMP plugin surface | Pass | `Plugin surface validation passed: repository` |
| Skill exercise (deterministic) | Pass | `write-spec`: 14 pass, 0 fail, 0 skipped |
| Live skill proof | Pass | TUI Finished exercise (source unchanged since capture) |
| Prompt quality | Pass | Both Finished branches end the turn without `ask`/`xd://propose`, and the extension performs the exit |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |

**Gate Summary**: 7/8 gates passed, 1 failed, 0 incomplete

---

## Fixes Applied

None. The verify publication scope allows writes only to `verification-report.md`. Both findings need changes to `steering/extensions/nmg-sdlc-smoke.mjs` and its tests, or to the approved spec.

## Remaining Issues

### High Priority

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Spec Compliance / Testability (AC6, AC7) |
| **Location** | `steering/extensions/nmg-sdlc-smoke.mjs:803-835` (spec-phase poll loop) and `planGateVisible` (`:608-616`); pane creation via `herdr pane split --current` |
| **Issue** | In the spec phase, the native plan-approval gate after `xd://propose` was never detected, so no `enter` was sent. After 20 settled polls (about 65 s) the provider failed with `provisioning stalled during spec`. The captured 16-column screen has no `Plan mode` text at all. The same pane accepted the draft-phase approval in about 1 s. |
| **Impact** | Unattended `/sdlc-execute` verification of nmg-sdlc still cannot reach delivery proof. Smoke issue #184 is left OPEN without a spec. The recovery store records it, so a same-identity retry would run the spec phase only. |
| **Reason Not Fixed** | Outside this worker's writable scope, and the root cause is not proven. `[INFERENCE]` The selector is either not rendered or not captured by `agentRead` in the very narrow split pane after the long `Write` preview. Diagnose with the retained clone and session before changing code: capture `herdr agent read` output at the spec-phase gate and the pane width. Consider a wider or dedicated pane, or detecting the gate from the session's `propose` result plus `mode_change plan` instead of screen text. Add a regression for the observed screen shape. Rerun only after a concrete changed fix. |

### Medium Priority

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Spec Compliance (AC4; design `agent_end`; T002) |
| **Location** | `src/extension.ts` `planDecisionContinuation` / `agent_end`; `requirements.md` AC4 "But Given"; `design.md` Fix Strategy (`agent_end: return on willContinue === true`); `tasks.md` T002 |
| **Issue** | The implementation exits on the plan-mode decision continuation (`willContinue: true`), but the approved AC4, design and T002 say a non-terminal `agent_end` dispatches nothing and waits for the terminal end. |
| **Impact** | The approved contract and the shipped behavior disagree. The behavior is correct and required by the host (proven live), so the spec is stale. This was already reported at `6fda468` and has not been addressed. |
| **Reason Not Fixed** | Spec files are read-only in the verify scope. Amend AC4, design and T002 to limit the non-terminal clause to non-decision continuations (tool-call/error continuations still wait). |

## Recommendation

Needs fixes:

1. Diagnose and fix the smoke provider's spec-phase plan-approval detection in narrow Herdr panes, and add a regression for the observed screen.
2. Amend AC4, the design and T002 to describe the decision-continuation trigger.
3. Rerun the full registered gate at the new head.
