# Verification Report: Exit native plan mode when write-spec Finished is selected

**Date**: 2026-09-27
**Issue**: #444
**Reviewer**: architecture-reviewer (verify worker, controller run 88d82699-cdbb-4584-a129-d67994245115)
**Scope**: Implementation verification against spec
**Verification head**: 46a4c424eff486565afb271013c795ab07e9113b

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 4 |
| Architecture (SOLID) | 3 |
| Security | 4 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | 4.0 |

### Implementation Status: Partial
**Total Issues**: 3 (1 Medium, 2 Low)

Both registered validations passed at the verification head:
- `repository.tests`: 833 passed, 2 skipped.
- `repository.nmg-sdlc-smoke`: live self-provisioning of smoke #185, spec PR #186 `MERGED`, delivery PR #187 `MERGED` at `e08a20a4f5dd1aef8a5f59df06c8ba85a11855b3`, and #185 `CLOSED`.

A fresh live TUI exercise at this head showed that initial-picker Finished ends in session mode `none`.

One AC9 `Then` clause is still unimplemented. A provisioning failure returns no created-issue URL as evidence. That leaves AC9 Partial. Only this report was in the verify publication scope, so the gap could not be fixed here.

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 444 --spec specs/444-… --base main --controller-run-id 88d82699-cdbb-4584-a129-d67994245115`
- Artifact: `.omp/sdlc/verification/444.json`. Identity: head `46a4c424eff486565afb271013c795ab07e9113b`, clean tree, steering `sha256:a52a941b…`, spec `sha256:f7171ce0…`.
- Ceiling: `null`.
- Coverage: `declared: 2`, `recorded: 2`, `complete: true`, with no missing, duplicate or unknown entries.
- Manifest: `steering/manifest.json` loaded and validated with 4 modules, 3 snippets and 1 extension (`project.nmg-sdlc-smoke`).

---

## Issue Scope

- Active issue: #444
- Spec: `specs/444-exit-native-plan-mode-when-write-spec-finished-is-selected`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10]; tasks [T001, T002, T003, T004, T005, T006, T007]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008, SCN009, SCN010]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":444,"specPath":"specs/444-exit-native-plan-mode-when-write-spec-finished-is-selected","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10"],"tasks":["T001","T002","T003","T004","T005","T006","T007"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Not complete (AC9 Partial)
- PR evidence: Not required

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Continue-loop Finished exits plan mode fully | Pass | `writeSpecFinishedSelection` (`src/sdlc-commands.mjs:107`) sets `exitPending` (`src/extension.ts:97`). `agent_end` (`src/extension.ts:208`) exits on a terminal end or a `planDecisionContinuation` (`:123`), and `exitPlanMode` (`:181`) awaits `onSubmit("/plan")` for each toggle. In the SCN001 fixture (`extension-commands.test.mjs:334`), the continuation is submitted once and exactly two `/plan` toggles end at `none`. The host continuation path is the same one the live AC2 run exercised. |
| AC2 | Initial-picker Finished exits plan mode fully | Pass | Live TUI at this head. See Exercise Test Results. After the `Finished — stop without writing a spec` result, the session logged: assistant `stop`, the host decision reminder, assistant `aborted`, `mode plan_paused`, `mode none`. The screen showed `Plan mode disabled.` No Discovery ran, there was no `Published specs:` or `Next step:`, and nothing was re-asked. The SCN002 fixture also passes. |
| AC3 | Non-Finished selections keep plan mode | Pass | Selection is by exact label (`WRITE_SPEC_FINISHED_LABELS`) and only while `writeSpec.active`. A later non-Finished ask resets `exitPending` to `false`. The SCN003 fixture (`:357`) covers an issue row, Continue, custom `#12`/`abc`, and asks outside write-spec. |
| AC4 | Undispatchable exit fails safe | Pass | `focusedEditor` returns `undefined` when there is no UI, a draft, an unfocused editor or a disabled submit. `exitPlanMode` sends `FINISHED_EXIT_NOTICE` once and `exitPending` is cleared before dispatch. `willContinue` ends that are not a plan-decision continuation return early. SCN004 fixtures (`:378`, `:389`) pass. The amended AC4 in `46a4c42` matches the implementation. |
| AC5 | Post-publication continuation is preserved | Pass | A pending continuation wins on a terminal end (`submitContinuation`), and `startInteractiveCommand` resets state. SCN005 (`:407`) passes. |
| AC6 | Smoke gate self-provisions without an explicit queue | Pass | Live: the registered gate ran with `NMG_SDLC_SMOKE_ISSUES` unset. It cloned into `nmg-sdlc-smoke-provision-ylvLG8`, prompted `/sdlc-draft-issue <need>` and then `/sdlc-write-spec 185` (bare) in owned pane `smoke-provision-bacd587a`, and delivered #185 through the execute controller of this checkout (`smokePluginRoot`, `nmg-sdlc-smoke.mjs:973`). SCN006 passes. |
| AC7 | Every provisioning gate is answered automatically | Pass | `askDecision` (`:658`) presses `enter` on the Recommended option (0 when none is marked). Plan approval is detected by `planGateVisible` or `pendingPlanApproval`. The live run answered all draft and spec gates without operator input. SCN007 (including the truncated and unpainted variants) passes. |
| AC8 | Provisioning completion is proven from GitHub | Pass | `publishedSpec` (`:685`) requires `spec-created` plus a merged `docs: approve spec for #N` PR. Live evidence: `provisioned smoke issue #185 …; spec PR …/pull/186 MERGED`, with the pane closed in `finally`. SCN008 passes. |
| AC9 | Provisioning failures fail closed, no duplicates | **Partial** | Pass: `failed` status, screen snapshot, agent status, session path, retained clone, pane closed, recovery reuse, interrupted-without-issue fail-closed, and `incomplete` on launch or cancel (SCN009 fixtures). **Missing: "any created issue URL as evidence"**. After an issue is identified (a spec-phase stall or ask failure), and in the multiple-new-issues case, the `stop()` envelope carries no issue URL. `newSmokeIssues` output is not recorded as evidence, and the summary carries bare numbers only. |
| AC10 | Explicit queues keep priority | Pass | `resolveQueue` (`:173`) gives `config.issues` or a non-blank env queue priority, and an invalid value returns `null`, which yields `issues config invalid`. SCN010 (`:1504`, `:1515`) passes. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Detect Finished selections | Complete | `src/sdlc-commands.mjs:97-119`; cases in `sdlc-commands.test.mjs:185-204` |
| T002 | Exit plan mode after a Finished turn | Complete | `src/extension.ts` |
| T003 | Align write-spec contracts | Complete | `WORKFLOW.md` step 7 and the Continue-loop Finished branch, `publish.md`, `references/interactive-gates.md`, `README.md` |
| T004 | Finished-exit regressions | Complete | `extension-commands.test.mjs` SCN001–SCN005 |
| T005 | Smoke self-provisioning | Complete with gap | AC9 created-issue URL evidence is missing |
| T006 | Register provisioning in steering | Complete | `manifest.json` `config.provision.need`; tech and product snippets updated; the manifest validated during the gate run |
| T007 | Smoke regressions and docs | Complete | SCN006–SCN010 tests; README live-smoke section; CHANGELOG `[Unreleased]` |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 3 | `steering/extensions/nmg-sdlc-smoke.mjs` grew to 1680 lines. Provisioning (Herdr driving, JSONL gate parsing, GitHub proof) is added to a provider that already owns clone, recovery and delivery proof. |
| Open/Closed | 4 | Provisioning is config-driven (`config.provision.need`) and the explicit-queue path is unchanged. |
| Liskov Substitution | 4 | The injected `herdr`, `sleep` and `pollMs` adapters replace real ones cleanly. |
| Interface Segregation | 4 | The Herdr adapter exposes only the seven calls it needs. |
| Dependency Inversion | 4 | Plugin modules load through a guarded dynamic import, so the provider fails closed when they are absent. |

### Layer Separation

The extension keeps its role as dispatcher. Only builtin `/plan` goes through the focused editor, and no workflow tells the user to type `/plan`. The steering provider stays within its frozen `extension` export.

### Dependency Flow

Steering extension → `src/process-supervision.mjs` and `scripts/*` through a guarded import. The direction is unchanged.

---

## Security Assessment

- [x] Authentication: uses ambient `gh` auth; no secrets are requested.
- [x] Authorization: mutations are confined to `Nunley-Media-Group/nmg-sdlc-smoke` through the real workflows; the origin allowlist is checked on the provisioning clone.
- [x] Input validation: queue tokens are matched against `^#?[1-9]\d*$`; ask options are chosen by index only, and free-form or multi-select asks fail closed; other issue rows are never selected.
- [x] Injection prevention: every `herdr` and `gh` call uses an argument array; the need text is passed as one argument.
- [x] Data protection: evidence is bounded (`bounded(screen)`).

---

## Performance Assessment

- [x] Async patterns: polling uses an injectable sleep and poll-count bounds, with no wall-clock deadline.
- [x] Caching: N/A.
- [x] Resource management: the owned pane is always closed in `finally`; the clone is removed on success and retained on failure.
- [ ] Query optimization: each 3 s poll re-reads the whole session JSONL and re-stats the session directory. This is acceptable for bounded provisioning sessions (Low).

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | SCN001 | Yes | Yes |
| AC2 | SCN002 | Yes | Yes (plus live) |
| AC3 | SCN003 | Yes | Yes |
| AC4 | SCN004 | Yes | Yes |
| AC5 | SCN005 | Yes | Yes |
| AC6 | SCN006 | Yes | Yes (plus live) |
| AC7 | SCN007 | Yes | Yes (plus live) |
| AC8 | SCN008 | Yes | Yes (plus live) |
| AC9 | SCN009 | Yes | Yes, but no assertion on created-issue URL evidence |
| AC10 | SCN010 | Yes | Yes |

### Coverage Summary

- Feature files: 10 scenarios
- Step definitions: Jest contract tests
- `repository.tests`: `Test Suites: 1 skipped, 49 passed`; `Tests: 2 skipped, 833 passed, 835 total`, exit 0. The skipped suite is the opt-in `RUN_EXERCISE_TESTS` exercise suite, and the skipped tests are win32-only.

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `write-spec` (bare, initial-picker Finished); `draft-issue` and `write-spec` through live smoke provisioning |
| **Test Project** | `/tmp/nmg444-ex-5gnC/smoke` (a disposable `nmg-sdlc-smoke` clone, removed afterwards); smoke provisioning clone `nmg-sdlc-smoke-provision-ylvLG8` |
| **Exercise Method** | Real OMP TUI in an owned Herdr pane: `omp --no-extensions --extension <checkout>/src/extension.ts --plugin-dir <checkout>`. `exercise-omp.mjs` (RPC) cannot enter native plan mode, and its `/sdlc-write-spec` run never settled; it was cancelled (exit 130) and is not used as evidence. |
| **Interactive gate handling** | Key presses only (`down down enter` on Finished) |
| **Duration** | About 1 minute (Finished exit); registered gate about 16.5 minutes |

### Captured Output Summary

- Finished exit, session `2026-09-27T09-46-40-408Z_01a0e242….jsonl`:
  - `09:46:46.506Z` mode `plan`; the helper listed #143 and #184; the picker was asked.
  - `09:47:04.344Z` `selectedOptions:["Finished — stop without writing a spec"]`.
  - `09:47:05.849Z` assistant `stop`, then the host `Plan mode turn ended without a required tool call` reminder.
  - `09:47:05.868Z` assistant `aborted`, followed by mode `plan_paused` and mode `none`. The screen showed `Plan mode disabled.` and the agent went `idle`.
- Smoke provisioning session `2026-09-27T08-31-51-080Z_01a0e1fd….jsonl`: issue #185 was drafted and its spec published (PR #186 merged). Delivery PR #187 merged at `e08a20a4…` and #185 was closed.

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC2 | Initial-picker Finished exits plan mode | Pass | Final mode `none`, no re-ask, no typed command |
| AC6 | Self-provision and deliver | Pass | #185, PR #186, PR #187 |
| AC7 | Automatic gate answers | Pass | Draft and spec gates answered; no operator input |
| AC8 | GitHub completion proof | Pass | `spec-created` plus merged spec PR #186 |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (registered) | Pass | `npm test -- --runInBand` exited 0; 833 passed |
| `repository.nmg-sdlc-smoke` (registered) | Pass | Provisioned #185; PR #187 `MERGED` at `e08a20a4f5dd1aef8a5f59df06c8ba85a11855b3` matches the pre-merge proof; #185 `CLOSED` |
| Skill inventory | Pass | `Skill inventory audit: clean (90 items mapped).` |
| OMP plugin surface | Pass | `Plugin surface validation passed: repository` |
| Skill exercise (`write-spec`) | Pass | `Summary: 14 pass, 0 fail, 0 skipped` |
| Git hygiene | Pass | `git diff --check main...HEAD` exited 0 |

**Gate Summary**: 6/6 gates passed, 0 failed, 0 incomplete

---

## Fixes Applied

None. The verify publication scope allows writes only to this report.

## Remaining Issues

### Medium Priority

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Error Handling |
| **Location** | `steering/extensions/nmg-sdlc-smoke.mjs` (`provisionSmokeIssue` `stop()` and `newSmokeIssues`, around lines 677 and 727–829) |
| **Issue** | AC9 requires "any created issue URL as evidence" on a provisioning failure. The failure envelope has no issue URL: not after issue N is identified (spec-phase stall, ask failure, cancellation), and not for the multiple-new-issues case, whose summary lists bare `#179, #181`. |
| **Impact** | Operators cannot follow a failed provisioning to the created smoke issue from the gate evidence alone. The AC9 contract is unmet. |
| **Reason Not Fixed** | Outside the verify publication scope (only `verification-report.md` is writable). The implementation step must add a `github` evidence entry with `https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/<N>` for each created issue and extend SCN009 fixtures to assert it. |

### Low Priority

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Low | SOLID | `steering/extensions/nmg-sdlc-smoke.mjs` | The file is 1680 lines. Provisioning could move to its own module under `steering/extensions/`. | Refactor; outside scope |
| Low | Error Handling | `src/extension.ts:220` | `void exitPlanMode(session)` calls `sessionManager.getEntries()` outside its `try`, so a throwing host would produce an unhandled rejection. | Hypothetical host failure; outside scope |

---

## Positive Observations

- `writeSpecFinishedSelection` uses exact labels, so near-miss labels and custom input can never trigger the exit.
- The editor-gated `/plan` dispatch never overwrites a draft. Each toggle is awaited, and the loop stops when the mode stops progressing.
- Provisioning drives only key presses, checks completion only against GitHub, and always closes its owned pane.
- The fixtures reproduce the real host `/plan` toggling and the Herdr/JSONL gate states.

---

## Recommendations Summary

### Before PR (Must)
- [ ] Add created-issue URL evidence to provisioning failure envelopes (AC9) and assert it in SCN009.

### Short Term (Should)
- [ ] Guard `exitPlanMode` against host `getEntries` failures.

### Long Term (Could)
- [ ] Split smoke provisioning out of `nmg-sdlc-smoke.mjs`.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `src/extension.ts` | 1 | Finished exit |
| `src/sdlc-commands.mjs` | 0 | Selection classifier |
| `steering/extensions/nmg-sdlc-smoke.mjs` | 2 | Provisioning |
| `steering/manifest.json`, `steering/snippets/project-*.md` | 0 | |
| `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md`, `references/interactive-gates.md` | 0 | |
| `README.md`, `CHANGELOG.md` | 0 | |
| `scripts/__tests__/extension-commands.test.mjs`, `sdlc-commands.test.mjs`, `nmg-sdlc-smoke.test.mjs` | 1 | SCN009 lacks a URL assertion |

---

## Recommendation

**Needs fixes**

Both registered gates are green. The Finished exit is proven live and the smoke gate self-provisions and delivers end to end. AC9 is Partial because failure evidence omits the created-issue URL. Return to implementation for that single fix, then rerun the full registered gate.
