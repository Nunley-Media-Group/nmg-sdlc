# Verification Report: Exit native plan mode when write-spec Finished is selected

**Date**: 2026-09-27
**Issue**: #444
**Reviewer**: architecture-reviewer (OMP verify worker)
**Scope**: Implementation verification against spec
**Verification head**: c59ba5bbdeafc17bded8fcc74f8b55f3f8f8a212

---

## Executive Summary

The write-spec Finished exit (AC1–AC5, T001–T004) is implemented in `src/sdlc-commands.mjs` and `src/extension.ts`. The write-spec contracts document it, and passing regressions cover it. Commit `c59ba5b` fixed the previous finding: `planGateVisible` now recognizes the truncated `Plan mode - next…` selector title. The required live `repository.nmg-sdlc-smoke` gate still **failed** with `nmg-sdlc-smoke provisioning stalled during draft`. The last observed Herdr `agent_status` at the plan-approval selector was **`done`**, which is a new evidence field from `c59ba5b`. The provider's plan-gate branch (`steering/extensions/nmg-sdlc-smoke.mjs:819`) runs only for `idle` or `blocked`, so for `done` it counts a quiet poll and never reads the screen. It never pressed `Approve and execute`. Provisioning failed closed: no issue was created (the latest is still #179), the owned pane was closed, and the clone was retained. AC6–AC8 still lack live proof.

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

Command: `node "$NMG_SDLC_PLUGIN_ROOT/scripts/sdlc-verify-steering.mjs" --project . --issue 444 --spec specs/444-exit-native-plan-mode-when-write-spec-finished-is-selected --base main --controller-run-id 41cdfc97-f527-4223-bfee-db3675a75fb2` exited 1 after 437 s.

Artifact: `.omp/sdlc/verification/444.json`

| Field | Value |
|-------|-------|
| headSha | `c59ba5bbdeafc17bded8fcc74f8b55f3f8f8a212` (clean tree) |
| steeringHash | `sha256:7fe469a2d0d520b54485aee2e47c89489b64e8084d965341865dca4952d9dd00` |
| specHash | `sha256:f98cb19793af8ab5b0d0b60f7310df340dde26e205252b8d9b02ddaba603346a` |
| coverage | declared 2, recorded 2, complete `true` |
| ceiling | **Fail** |

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Continue-loop Finished exits plan mode fully | Pass | `tool_result` records `exitPending` from `writeSpecFinishedSelection` while `writeSpec.active`. On terminal `agent_end`, `exitPlanMode` awaits `onSubmit("/plan")` once per toggle until the mode is `none`. `workflows/write-spec/WORKFLOW.md` ends the Continue-loop Finished branch with no `ask` or `xd://propose`. Covered by SCN001 in `extension-commands.test.mjs`. |
| AC2 | Initial-picker Finished exits plan mode fully | Pass | `WORKFLOW.md` step 7 ends the turn. The label is in `WRITE_SPEC_FINISHED_LABELS`. Covered by SCN002. |
| AC3 | Non-Finished selections keep plan mode | Pass | The classifier returns `false` for other labels and custom input, and `exitPending` is set only in an active write-spec session. Covered by SCN003. |
| AC4 | Undispatchable exit fails safe | Pass | `focusedEditor` rejects missing UI, a non-empty draft, an unfocused editor, and disabled submit. Declined or thrown toggles end with one `FINISHED_EXIT_NOTICE`. `exitPending` is cleared before dispatch, and `willContinue: true` returns early. Covered by SCN004. |
| AC5 | Post-publication continuation is preserved | Pass | `agent_end` handles `writeSpec.pending` first and clears `exitPending`. `startInteractiveCommand` resets `published`, `pending`, and `exitPending`. The #438 continuation tests and SCN005 pass. |
| AC6 | Smoke gate self-provisions without an explicit queue | Fail | Live: the provider cloned, split an owned pane (`wF:p1B`), started `omp`, and submitted `/sdlc-draft-issue <need>`. The interview reached Plan Review, but no issue was created and delivery was not reached. |
| AC7 | Every provisioning gate is answered automatically | Fail | The live plan-approval selector (`Plan mode - next…`, `Approve and ex…` highlighted) had Herdr `agent_status` `done`. `provisionSmokeIssue` checks `planGateVisible` only when the status is `idle` or `blocked` (`nmg-sdlc-smoke.mjs:819`), so it never pressed `Approve and execute`. |
| AC8 | Provisioning completion proven from GitHub | Fail | There is no live proof because provisioning never reached publication. SCN008 fixtures pass. |
| AC9 | Provisioning failures fail closed, never duplicate | Pass | Live: result `failed` with the screen, agent status `done`, the session (`~/.omp/agent/sessions/-tmp-nmg-sdlc-smoke-provision-VR1RkA/2026-09-27T05-09-59-494Z_01a0e145-….jsonl`), and the retained clone `/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-smoke-provision-VR1RkA`. `herdr agent get smoke-provision-d0c6d19d` returns `agent_not_found`, and the latest smoke issue is still #179. SCN009 fixtures pass. |
| AC10 | Explicit queues keep priority | Pass | `resolveQueue` checks `config.issues` and then a non-blank env value before `provision`. SCN010 fixtures pass. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Detect Finished picker selections | Complete | `WRITE_SPEC_FINISHED_LABELS`, `writeSpecFinishedSelection` |
| T002 | Exit plan mode after terminal Finished turn | Complete | `active` / `exitPending`, `focusedEditor`, awaited `/plan` loop, warning fallback |
| T003 | Align write-spec contracts | Complete | `WORKFLOW.md`, `publish.md`, `references/interactive-gates.md`, `README.md` |
| T004 | Finished-exit regressions | Complete | `extension-commands.test.mjs`, `sdlc-commands.test.mjs` |
| T005 | Self-provision smoke issues | Incomplete | Truncated-marker detection is fixed, but the plan gate is still missed because the live selector reports `agent_status: done` |
| T006 | Register provisioning in steering | Complete | `steering/manifest.json` `config.provision.need`; tech/product snippets updated |
| T007 | Provisioning regressions and docs | Partial | The narrow-screen fixtures cover `idle` and `blocked` but not `done`. README and CHANGELOG are updated. |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | The classifier lives in `sdlc-commands.mjs` and dispatch lives in `extension.ts`. Provisioning is isolated in `provisionSmokeIssue`, and `planGateVisible` is a pure helper. |
| Open/Closed | 4 | `resolveQueue` adds a queue kind without changing explicit-queue behavior |
| Liskov Substitution | 4 | `HostEditor` gains an optional `onSubmit`, and existing callers are unaffected |
| Interface Segregation | 4 | The Herdr adapter exposes only the verbs it uses |
| Dependency Inversion | 4 | `herdr`, `sleep`, and `pollMs` are injectable, and the plugin modules are loaded through a guarded import |

### Layer Separation

The extension dispatches only builtin `/plan`, and the workflows describe that behavior. The steering provider stays inside its frozen `extension` export.

### Dependency Flow

`src/extension.ts` imports from `src/sdlc-commands.mjs`. The steering extension reaches plugin modules only through a guarded dynamic import that fails closed.

---

## Security Assessment

- [x] Authentication: uses the existing `gh` auth; no secrets are requested
- [x] Authorization: the clone origin is allowlisted, and `askDecision` never selects another issue row or types free text
- [x] Input validation: queue tokens and provisioned issue numbers are validated
- [x] Injection prevention: Herdr, gh, and git calls use argument arrays
- [x] Data protection: the editor draft is preserved, and the provisioning clone is retained on failure

---

## Performance Assessment

- [x] Async patterns: `/plan` toggles are awaited one at a time. Provisioning polls with poll-count stall bounds and no wall-clock deadline.
- [x] Caching: N/A
- [x] Resource management: the owned pane is closed in `finally`
- [x] Query optimization: the new-issue scan is bounded

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

- Feature file: 10 scenarios
- Unit tests: `npm test -- --runInBand` exited 0 with 49 suites passed and 1 skipped, and 829 tests passed and 2 skipped
- Live smoke: failed (see gates)

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill exercised** | `repository.nmg-sdlc-smoke` provisioning (live `/sdlc-draft-issue` in a Herdr `omp` pane) |
| **Method** | Real steering provider run through `sdlc-verify-steering.mjs` |
| **Outcome** | The draft-issue interview completed with the plan "Add public greeting_has_apostrophe helper" and reached the `Plan mode - next…` selector with `Approve and ex…` highlighted. Herdr reported `agent_status: done`, which the plan-gate branch ignores. After 20 no-progress polls, the provider failed closed. |
| **Write-spec Finished TUI exit** | Not exercised live. It requires an interactive TUI picker selection, so the evidence is the deterministic host-editor fixture (SCN001–SCN005). |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (builtin.command, required) | Pass | `npm test -- --runInBand` in `scripts/` exited 0 at `c59ba5bb` |
| `repository.nmg-sdlc-smoke` (project.nmg-sdlc-smoke, required) | Fail | `nmg-sdlc-smoke provisioning stalled during draft` with last agent status `done`. The pane was closed, and clone `/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-smoke-provision-VR1RkA` was retained. |
| Skill inventory (additional) | Pass | `node scripts/skill-inventory-audit.mjs --check`: clean, 90 items |
| OMP plugin surface (additional) | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository` exited 0 |
| Git hygiene (additional) | Pass | `git diff --check main...HEAD` exited 0 |

**Gate Summary**: 1/2 registered passed, 1 failed, 0 incomplete

Real smoke lifecycle evidence: provisioning only; delivery was not reached. `repository.nmg-sdlc-smoke` stayed a required gate and was not bypassed.

---

## Fixes Applied

None. The verify publication scope permits only this report, so the provider fix belongs to implementation.

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Critical | Smoke provider | `steering/extensions/nmg-sdlc-smoke.mjs:819` (plan-gate branch in `provisionSmokeIssue`) | Herdr reports the live native plan-approval selector as `agent_status: done`. The plan-gate check accepts only `idle` or `blocked`, so `done` counts as a quiet poll and the selector is never approved. Proposed fix: run the `planGateVisible` screen check for every non-`working` status without a pending ask (at least `done`, `idle`, and `blocked`). | Outside the verify publication scope; the fix belongs to implementation |
| High | Testing | `scripts/__tests__/nmg-sdlc-smoke.test.mjs` (SCN007 narrow-pane cases) | The fixtures cover `idle` and `blocked`, but not the live `done` status, so they pass while the live gate fails. Add a `planStatus: 'done'` case. | Implementation scope |

---

## Positive Observations

- `c59ba5b` correctly fixed the truncated-marker detection. The live screen now shows exactly the case `planGateVisible` handles.
- The new agent-status stall evidence pinned the remaining cause in one run.
- Provisioning again failed closed as AC9 requires: no stray issue, owned pane closed, clone retained, and evidence recorded.

---

## Recommendations Summary

### Before PR (Must)
- [ ] Accept `done` (and any other non-`working` status without a pending ask) in the plan-gate branch
- [ ] Add a narrow-pane SCN007 fixture with `planStatus: 'done'`
- [ ] Rerun the full registered gate, including live smoke provisioning and delivery

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `src/extension.ts` | 0 | Finished-exit state machine |
| `src/sdlc-commands.mjs` | 0 | Classifier |
| `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md`, `references/interactive-gates.md`, `README.md` | 0 | Contract text |
| `steering/extensions/nmg-sdlc-smoke.mjs` | 1 | Plan-gate status filter |
| `scripts/__tests__/nmg-sdlc-smoke.test.mjs` | 1 | Missing `done` status fixture |
| `steering/manifest.json`, `steering/snippets/*` | 0 | Provision registration |

---

## Recommendation

**Needs fixes for remaining items**

AC1–AC5 and AC9–AC10 pass. AC6–AC8 fail because the live plan-approval selector reports Herdr `agent_status: done`, and the provider's plan-gate branch ignores that status. Route back to implementation to accept `done` in `steering/extensions/nmg-sdlc-smoke.mjs`, add the fixture, and rerun the full gate.
