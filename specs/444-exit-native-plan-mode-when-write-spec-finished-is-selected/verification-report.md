# Verification Report: Exit native plan mode when write-spec Finished is selected

**Date**: 2026-09-27
**Issue**: #444
**Reviewer**: architecture-reviewer (OMP verify worker)
**Scope**: Implementation verification against spec
**Verification head**: df5e33ea0e8eab901ded8d99ea39e6eb99aa2e7d

---

## Executive Summary

The write-spec Finished exit (AC1–AC5, T001–T004) is implemented and covered by passing regressions. Commit `df5e33e` fixed the previous finding: the plan-gate branch now reads the screen for every status except `working`, including Herdr `done`, and the SCN007 fixture covers `done`.

The live smoke provisioning worked end to end for the first time. The provider drafted smoke issue **#181** ("Add public greeting_has_apostrophe helper"), wrote and published its Approved spec (PR **#182**, `MERGED`, label `spec-created`), and closed its owned pane. This proves AC6 provisioning, AC7, and AC8 live.

The following delivery phase still did not run. `repository.nmg-sdlc-smoke` returned **`incomplete`** with `nmg-sdlc-smoke candidate identity unavailable`. The cause: `plugin.resolvePluginRoot` prefers `NMG_SDLC_PLUGIN_ROOT`, which in this worker is the installed package `/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc`. That directory is not a git repository, so `candidateTree` (`git read-tree HEAD`) fails before execute is launched. `main` has the same resolution, so this is a pre-existing provider defect that surfaced only now that provisioning reaches delivery. It is still a plugin defect: steering requires the gate to run *this checkout's* execute controller.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 4 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 4.0 |

### Implementation Status: Incomplete
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

Command: `node "$NMG_SDLC_PLUGIN_ROOT/scripts/sdlc-verify-steering.mjs" --project . --issue 444 --spec specs/444-exit-native-plan-mode-when-write-spec-finished-is-selected --base main --controller-run-id 41cdfc97-f527-4223-bfee-db3675a75fb2` exited 1 after 661 s.

Artifact: `.omp/sdlc/verification/444.json`

| Field | Value |
|-------|-------|
| headSha | `df5e33ea0e8eab901ded8d99ea39e6eb99aa2e7d` (clean tree) |
| steeringHash | `sha256:988145bbbcb5eceb512afc37a5aa32583be8908f4f7d2faa1eaa3a3fc67d5fe6` |
| specHash | `sha256:f98cb19793af8ab5b0d0b60f7310df340dde26e205252b8d9b02ddaba603346a` |
| coverage | declared 2, recorded 2, complete `true` |
| ceiling | **Incomplete** |

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Continue-loop Finished exits plan mode fully | Pass | `tool_result` records `exitPending` from `writeSpecFinishedSelection` while `writeSpec.active`. On terminal `agent_end`, the extension awaits `onSubmit("/plan")` once per toggle until the mode is `none`. `WORKFLOW.md` ends the Finished branch with no `ask` or `xd://propose`. Covered by SCN001. |
| AC2 | Initial-picker Finished exits plan mode fully | Pass | `WORKFLOW.md` step 7 ends the turn, and the label is in `WRITE_SPEC_FINISHED_LABELS`. Covered by SCN002. |
| AC3 | Non-Finished selections keep plan mode | Pass | The classifier returns `false` for other labels and custom input. Covered by SCN003. |
| AC4 | Undispatchable exit fails safe | Pass | `focusedEditor` rejects missing UI, a draft, an unfocused editor, and disabled submit. The extension shows `FINISHED_EXIT_NOTICE` once, and `willContinue: true` returns early. Covered by SCN004. |
| AC5 | Post-publication continuation is preserved | Pass | A pending continuation wins and clears `exitPending`. `startInteractiveCommand` resets the state. Covered by SCN005 and the #438 tests. |
| AC6 | Smoke gate self-provisions without an explicit queue | Incomplete | Provisioning is proven live: `/sdlc-draft-issue <need>` created exactly one new issue (#181; baseline latest was #179), then `/sdlc-write-spec 181` (bare number) ran in owned pane `wF:p1E`. The delivery smoke for `[181]` stopped before execute launched with `candidate identity unavailable`, because `NMG_SDLC_PLUGIN_ROOT` points at a plugin root without git. |
| AC7 | Every provisioning gate is answered automatically | Pass | Live: the draft interview, its plan approval (Herdr status `done`), and the write-spec gates were all answered with key presses only. No operator input was needed. SCN007 fixtures pass for `idle`, `blocked`, and `done`. |
| AC8 | Provisioning completion is proven from GitHub | Pass | Live: evidence reads `provisioned smoke issue #181 …; spec PR https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/182 MERGED`, and the issue has `spec-created`. The pane was then closed, and `herdr agent get` no longer lists it. |
| AC9 | Provisioning failures fail closed, never duplicate | Pass | SCN009 fixtures pass. The prior live stall failed closed without creating an issue. #181 is recorded in the recovery store for reuse under this verification identity. |
| AC10 | Explicit queues keep priority | Pass | `resolveQueue` checks `config.issues` and then a non-blank env value before `provision`. SCN010 fixtures pass. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Detect Finished picker selections | Complete | `WRITE_SPEC_FINISHED_LABELS`, `writeSpecFinishedSelection` |
| T002 | Exit plan mode after terminal Finished turn | Complete | Awaited `/plan` loop with a warning fallback |
| T003 | Align write-spec contracts | Complete | `WORKFLOW.md`, `publish.md`, `interactive-gates.md`, README |
| T004 | Finished-exit regressions | Complete | `extension-commands.test.mjs`, `sdlc-commands.test.mjs` |
| T005 | Self-provision smoke issues | Complete (provisioning) | Proven live. Delivery handoff is blocked by the plugin-root resolution defect below. |
| T006 | Register provisioning in steering | Complete | `config.provision.need`; snippets updated |
| T007 | Provisioning regressions and docs | Complete | Includes the `done` fixture; README and CHANGELOG updated |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | The classifier and dispatch are separate, and provisioning is isolated in `provisionSmokeIssue` |
| Open/Closed | 4 | `resolveQueue` adds a queue kind without changing explicit queues |
| Liskov Substitution | 4 | `HostEditor.onSubmit` is optional |
| Interface Segregation | 4 | The Herdr adapter is minimal |
| Dependency Inversion | 4 | `herdr`, `sleep`, and `pollMs` are injectable. However, plugin-root resolution is inherited from the env-first shared resolver, which does not fit a checkout-bound gate. |

### Layer Separation

The extension dispatches only builtin `/plan`. The provider keeps its frozen `extension` export.

### Dependency Flow

`src/extension.ts` imports from `src/sdlc-commands.mjs`. The smoke provider loads plugin modules through a guarded dynamic import.

---

## Security Assessment

- [x] Authentication: uses the existing `gh` auth
- [x] Authorization: the clone origin is allowlisted, and the provider never selects foreign issue rows or types free text
- [x] Input validation: queue and issue numbers are validated
- [x] Injection prevention: calls use argument arrays
- [x] Data protection: the draft is preserved, and clones are retained on failure

---

## Performance Assessment

- [x] Async patterns: awaited toggles, and poll-count stall bounds with no wall-clock deadline
- [x] Caching: N/A
- [x] Resource management: the owned pane is closed in `finally`, and the temporary index is removed
- [x] Query optimization: the new-issue scan is bounded

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1–AC5 | SCN001–SCN005 | Yes | Yes |
| AC6 | SCN006 | Yes (faked) | Fixtures yes; live provisioning yes; live delivery not reached |
| AC7–AC8 | SCN007–SCN008 | Yes | Yes (fixtures and live) |
| AC9 | SCN009 | Yes | Yes |
| AC10 | SCN010 | Yes | Yes |

### Coverage Summary

- Feature file: 10 scenarios
- Unit tests: `npm test -- --runInBand` passed 49 suites (1 skipped) and 830 tests (2 skipped)
- Live smoke: `incomplete` (see gates)

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill exercised** | `repository.nmg-sdlc-smoke`: live provisioning with `/sdlc-draft-issue` and `/sdlc-write-spec` in a Herdr `omp` pane, then delivery |
| **Method** | The real steering provider run by `sdlc-verify-steering.mjs` |
| **Outcome** | Issue #181 was provisioned and spec PR #182 merged. The provisioning clone was removed on success. The delivery clone `/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-smoke-y0MmEe` was created and the baseline for #181 recorded (no closing PRs). `candidateTree` then failed in the non-git `NMG_SDLC_PLUGIN_ROOT`, and the gate returned `incomplete`. |
| **Write-spec Finished TUI exit** | Not exercised live because it needs an interactive TUI picker selection. The evidence is the deterministic host-editor fixture (SCN001–SCN005). |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (builtin.command, required) | Pass | `npm test -- --runInBand` exited 0 at `df5e33e` |
| `repository.nmg-sdlc-smoke` (project.nmg-sdlc-smoke, required) | Incomplete | `nmg-sdlc-smoke candidate identity unavailable`. Provisioning passed (#181 / PR #182); execute was not launched. The delivery clone was retained. |
| Skill inventory (additional) | Pass | `skill-inventory-audit.mjs --check`: clean, 90 items |
| OMP plugin surface (additional) | Pass | `verify-plugin-surface.mjs --root . --label repository` exited 0 |
| Git hygiene (additional) | Pass | `git diff --check main...HEAD` exited 0 |

**Gate Summary**: 1/2 registered passed, 0 failed, 1 incomplete

Real smoke lifecycle evidence: provisioning is proven live; delivery was not reached. `repository.nmg-sdlc-smoke` was preserved as a required gate and not bypassed.

---

## Fixes Applied

None. The verify publication scope permits only this report.

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Critical | Smoke provider | `steering/extensions/nmg-sdlc-smoke.mjs` `deliverSmoke` (`pluginRoot = plugin.resolvePluginRoot(options)`) together with `candidateTree` | `resolvePluginRoot` returns `NMG_SDLC_PLUGIN_ROOT` first. Here that is the installed package `/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc`, which is not a git repository, so `git read-tree HEAD` fails and delivery never launches. Steering requires the smoke to run this checkout's controller. Proposed fix: resolve the candidate root and controller from the provider's own checkout (`import.meta.url`, which is the verified project) rather than the env override, and add a fixture where `NMG_SDLC_PLUGIN_ROOT` is a non-git install. | Outside the verify publication scope; the fix belongs to implementation |
| Medium | Smoke fixture reuse | Smoke issue #181 | #181 is open with an Approved spec and is recorded for reuse only under the current verification identity. After a code fix changes the head, provisioning will draft another issue unless #181 is reused. | Record only; the provider is designed to create new issues |

---

## Positive Observations

- The `done` status fix worked: the draft plan approval was pressed and the issue was created.
- Provisioning completion was proven from GitHub evidence, and the owned pane was closed.
- The failure was classified `incomplete` with a retained clone, not a false pass.

---

## Recommendations Summary

### Before PR (Must)
- [ ] Bind the smoke candidate root and controller to the verified checkout rather than `NMG_SDLC_PLUGIN_ROOT`
- [ ] Add a regression with a non-git `NMG_SDLC_PLUGIN_ROOT`
- [ ] Rerun the full registered gate, including live delivery

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `src/extension.ts`, `src/sdlc-commands.mjs` | 0 | Finished exit |
| `workflows/write-spec/*`, `references/interactive-gates.md`, `README.md` | 0 | Contract text |
| `steering/extensions/nmg-sdlc-smoke.mjs` | 1 | Plugin-root resolution for the delivery candidate |
| `scripts/__tests__/nmg-sdlc-smoke.test.mjs` | 0 | `done` fixture added |
| `steering/manifest.json`, `steering/snippets/*` | 0 | Provision registration |

---

## Recommendation

**Needs fixes for remaining items**

AC1–AC5 and AC7–AC10 pass. AC6 is Incomplete: live provisioning succeeded (#181, PR #182 merged), but the delivery smoke could not compute the candidate identity because `NMG_SDLC_PLUGIN_ROOT` points at a non-git installed plugin. Route back to implementation to bind the smoke candidate to the verified checkout, then rerun the full gate.
