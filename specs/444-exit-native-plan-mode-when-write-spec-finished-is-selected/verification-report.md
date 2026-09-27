# Verification Report: Exit native plan mode when write-spec Finished is selected

**Date**: 2026-09-26
**Issue**: #444
**Reviewer**: architecture-reviewer (OMP verify worker)
**Scope**: Implementation verification against spec
**Verification head**: 054aa5dd4a8e45b6e4f5c8fd6dfc0ff98006b3e8

---

## Executive Summary

The write-spec Finished exit (AC1–AC5, T001–T004) is implemented in `src/sdlc-commands.mjs` and `src/extension.ts`, documented in the write-spec contracts, and covered by passing regressions. Smoke self-provisioning (T005–T007) is implemented and passes its faked-Herdr regressions, but the required live `repository.nmg-sdlc-smoke` gate **failed**: the provider stalled at the `/sdlc-draft-issue` native plan-approval selector. `PLAN_GATE_MARKER = "Plan mode - next step"` is truncated to `Plan mode - next…` in the provider's narrow split pane, so the plan gate is never recognized. No issue was created, the owned pane was closed, and the provisioning clone was retained, so the fail-closed path works. AC6–AC8 lack live proof. The report cannot pass until the provider is fixed.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 3 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 4 |
| **Overall** | 3.7 |

### Implementation Status: Fail
**Total Issues**: 3

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

Command: `node "$NMG_SDLC_PLUGIN_ROOT/scripts/sdlc-verify-steering.mjs" --project . --issue 444 --spec specs/444-exit-native-plan-mode-when-write-spec-finished-is-selected --base main --controller-run-id 41cdfc97-f527-4223-bfee-db3675a75fb2` exited 1 after 490 s.

Artifact: `.omp/sdlc/verification/444.json`

| Field | Value |
|-------|-------|
| headSha | `054aa5dd4a8e45b6e4f5c8fd6dfc0ff98006b3e8` |
| steeringHash | `sha256:bc0257d80927dc81d833a2e10616a2a08aa5e8b0ecea24a3ab8a8531d4a7498f` |
| specHash | `sha256:f98cb19793af8ab5b0d0b60f7310df340dde26e205252b8d9b02ddaba603346a` |
| changedPaths | 19 paths (src, scripts tests, workflows/write-spec, references, steering, README, CHANGELOG, spec) |
| coverage | declared 2, recorded 2, complete `true` |
| ceiling | **Fail** |

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Continue-loop Finished exits plan mode fully | Pass | `src/extension.ts:90-96` records `exitPending` from `writeSpecFinishedSelection`. `exitPlanMode` (`:165-192`) awaits `onSubmit("/plan")` once per toggle until the mode is `none`. `workflows/write-spec/WORKFLOW.md:161` ends the turn with no `ask` or `xd://propose`. Covered by `extension-commands.test.mjs:280` (SCN001). |
| AC2 | Initial-picker Finished exits plan mode fully | Pass | `WORKFLOW.md:37` makes step 7 end the turn. The label is in `WRITE_SPEC_FINISHED_LABELS` (`src/sdlc-commands.mjs:97-100`). Covered by SCN002 in the same test. |
| AC3 | Non-Finished selections keep plan mode | Pass | The classifier returns `false` for other labels and `customInput`, and `exitPending` is set only while `writeSpec.active`. Covered by SCN003 fixture cases. |
| AC4 | Undispatchable exit fails safe | Pass | `focusedEditor` rejects missing UI, a non-empty draft, an unfocused editor, and disabled submit. Declined or thrown toggles fall through to one `FINISHED_EXIT_NOTICE`. `exitPending` is cleared before dispatch, and `willContinue` returns early. Covered by SCN004. |
| AC5 | Post-publication continuation is preserved | Pass | `agent_end` checks `writeSpec.pending` before the exit path. `startInteractiveCommand` resets `published`, `pending`, and `exitPending`. The #438 continuation tests still pass, plus SCN005. |
| AC6 | Smoke gate self-provisions without an explicit queue | Fail | The implementation exists (`resolveQueue`, `provisionSmokeIssue`). The live run cloned, split an owned pane, started `omp`, and submitted `/sdlc-draft-issue <need>`, but it never reached issue creation or delivery. |
| AC7 | Every provisioning gate is answered automatically | Fail | The live plan-approval selector was not recognized: the screen shows `Plan mode - next…` instead of the exact `PLAN_GATE_MARKER` `Plan mode - next step` (`steering/extensions/nmg-sdlc-smoke.mjs`). The provider never pressed `Approve and execute`. |
| AC8 | Provisioning completion proven from GitHub | Fail | There is no live proof because provisioning never reached publication. SCN008 fixtures pass. |
| AC9 | Provisioning failures fail closed, never duplicate | Pass | Live: result `failed` (`nmg-sdlc-smoke provisioning stalled during draft`) with screen, session (`~/.omp/agent/sessions/-tmp-nmg-sdlc-smoke-provision-koz4ut/…jsonl`), and retained-clone evidence. `herdr agent get smoke-provision-4970980b` returns `agent_not_found` (pane closed), and no smoke issue was created (latest is still #179). SCN009 fixtures pass. |
| AC10 | Explicit queues keep priority | Pass | `resolveQueue` checks `config.issues`, then a non-blank env value, before `provision`. Covered by `nmg-sdlc-smoke.test.mjs:1392`, `:1403`, and `:433`. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Detect Finished picker selections | Complete | `WRITE_SPEC_FINISHED_LABELS`, `writeSpecFinishedSelection` |
| T002 | Exit plan mode after terminal Finished turn | Complete | `active` / `exitPending` state, `focusedEditor`, awaited `/plan` loop, warning fallback |
| T003 | Align write-spec contracts | Complete | `WORKFLOW.md`, `publish.md`, `references/interactive-gates.md`, `README.md` |
| T004 | Finished-exit regressions | Complete | `extension-commands.test.mjs`, `sdlc-commands.test.mjs` |
| T005 | Self-provision smoke issues | Incomplete | Implemented, but plan-gate detection fails against a real narrow Herdr pane |
| T006 | Register provisioning in steering | Complete | `steering/manifest.json` `config.provision.need`; tech/product snippets updated; the smoke extension loads through a guarded dynamic import |
| T007 | Provisioning regressions and docs | Partial | SCN006–SCN010 fixtures pass, but the fake screen (`nmg-sdlc-smoke.test.mjs:1228`) renders the full marker text and does not model the real pane truncation; README and CHANGELOG are updated |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | The classifier lives in `sdlc-commands.mjs`; dispatch lives in `extension.ts`. Provisioning is isolated in `provisionSmokeIssue` with a Herdr adapter. |
| Open/Closed | 4 | `resolveQueue` adds a queue kind without changing explicit-queue behavior |
| Liskov Substitution | 4 | `HostEditor` gains an optional `onSubmit`, and existing callers are unaffected |
| Interface Segregation | 4 | `createHerdrAdapter` exposes only the seven Herdr verbs it uses |
| Dependency Inversion | 4 | `herdr`, `sleep`, and `pollMs` are injectable, and the plugin modules are loaded through a guarded import |

### Layer Separation

The extension still only dispatches builtin `/plan`, and the workflows only describe that behavior. The steering provider stays inside its frozen `extension` export.

### Dependency Flow

`src/extension.ts` imports from `src/sdlc-commands.mjs`. The steering extension reaches `src/` and `scripts/` only through a guarded dynamic import that fails closed.

---

## Security Assessment

- [x] Authentication: uses the existing `gh` auth; no secrets are requested
- [x] Authorization: the clone origin is allowlisted, and `pendingAsk` / `askDecision` never select another issue row or type free text
- [x] Input validation: queue tokens are validated, and provisioned issue numbers are integer-checked
- [x] Injection prevention: every Herdr, gh, and git call uses argument arrays
- [x] Data protection: the editor draft is preserved; the provisioning clone is retained on failure and removed on success

---

## Performance Assessment

- [x] Async patterns: the `/plan` toggles are awaited one at a time. Provisioning polls at 3 s with poll-count stall bounds and no wall-clock deadline.
- [x] Caching: N/A
- [x] Resource management: the owned pane is always closed in `finally`
- [x] Query optimization: the new-issue scan is bounded (`--limit 20`)

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1–AC5 | SCN001–SCN005 | Yes | Yes |
| AC6–AC7 | SCN006–SCN007 | Yes (faked) | Fixtures yes; live no |
| AC8 | SCN008 | Yes (faked) | Fixtures yes; live not reached |
| AC9 | SCN009 | Yes | Yes (fixtures and live) |
| AC10 | SCN010 | Yes | Yes |

### Coverage Summary

- Feature files: 10 scenarios
- Unit tests: `npm test -- --runInBand` exited 0: 49 suites passed and 1 skipped; 826 tests passed and 2 skipped
- Live smoke: failed (see gates)

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill exercised** | `repository.nmg-sdlc-smoke` provisioning (live `/sdlc-draft-issue` in a Herdr `omp` pane) |
| **Method** | Real steering provider run through `sdlc-verify-steering.mjs` |
| **Outcome** | The draft-issue interview completed and reached `Plan Review`, and the selector rendered with `Approve and ex…` highlighted. The provider did not match the truncated `Plan mode - next…` marker. It counted 20 no-progress polls, then failed. |
| **Write-spec Finished TUI exit** | Not exercised live. It requires an interactive TUI picker selection, so the evidence is the deterministic host-editor fixture (SCN001–SCN005). |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (builtin.command, required) | Pass | `npm test -- --runInBand` in `scripts/` exited 0 at `054aa5dd` |
| `repository.nmg-sdlc-smoke` (project.nmg-sdlc-smoke, required) | Fail | `nmg-sdlc-smoke provisioning stalled during draft`: the plan-approval screen marker was truncated in the narrow pane, the pane was closed, and clone `/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-smoke-provision-koz4ut` was retained |

**Gate Summary**: 1/2 passed, 1 failed, 0 incomplete

Real smoke lifecycle evidence: provisioning only; delivery was not reached. `repository.nmg-sdlc-smoke` stayed a required gate and was not bypassed.

---

## Fixes Applied

None. The verify publication scope permits only this report, so the provider fix belongs to implementation.

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Critical | Smoke provider | `steering/extensions/nmg-sdlc-smoke.mjs` (`PLAN_GATE_MARKER`, plan-gate branch in `provisionSmokeIssue`) | Plan-approval detection requires the exact text `Plan mode - next step`, but the right-split pane truncates it to `Plan mode - next…`. The gate check also runs only when `agent_status === "idle"`, and the live status was not recorded. Proposed fix: detect the selector from width-independent text, or give the pane a width that shows the full marker, and accept both statuses the selector can report. | Outside the verify publication scope; the fix belongs to implementation |
| High | Testing | `scripts/__tests__/nmg-sdlc-smoke.test.mjs:1228` | The fake TUI screen always renders the full marker and never models real pane truncation, so the regression passes while the live gate fails | Implementation scope |
| Medium | Evidence | `steering/extensions/nmg-sdlc-smoke.mjs` stall path | Stall evidence omits the last observed `agent_status`, which made the diagnosis rely on the screen alone | Implementation scope |

---

## Positive Observations

- The Finished exit is minimal: it reuses the #438 `focusedEditor` gate, awaits each toggle, and warns once without retrying.
- Provisioning failed closed exactly as AC9 requires: no stray issue, owned pane closed, clone retained, and evidence recorded.

---

## Recommendations Summary

### Before PR (Must)
- [ ] Make plan-approval detection in the smoke provider robust to pane width, and record `agent_status` in stall evidence
- [ ] Add a fixture with a truncated or narrow screen
- [ ] Rerun the full registered gate, including live smoke provisioning and delivery

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `src/extension.ts` | 0 | Finished-exit state machine |
| `src/sdlc-commands.mjs` | 0 | Classifier |
| `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md`, `references/interactive-gates.md`, `README.md` | 0 | Contract text |
| `steering/extensions/nmg-sdlc-smoke.mjs` | 2 | Plan-gate marker; stall evidence |
| `scripts/__tests__/nmg-sdlc-smoke.test.mjs` | 1 | Fake screen realism |
| `steering/manifest.json`, `steering/snippets/*` | 0 | Provision registration |

---

## Recommendation

**Needs fixes for remaining items**

AC1–AC5 and AC9–AC10 pass. AC6–AC8 fail because the live smoke provisioning never recognizes the narrow-pane plan-approval selector. Route back to implementation to fix the plan-gate detection in `steering/extensions/nmg-sdlc-smoke.mjs`, then rerun the full gate.
