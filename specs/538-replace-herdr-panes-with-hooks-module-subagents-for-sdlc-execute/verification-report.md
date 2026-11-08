# Verification Report: Replace Herdr panes with hooks-module subagents for /sdlc-execute

**Date**: 2026-11-08
**Issue**: #538
**Reviewer**: nmg-sdlc verify worker (architecture-reviewer)
**Scope**: Implementation verification against the amended Approved spec
**Controller run id**: dbac7959-7e86-4ae5-8176-4b38cf145860

**Verification head**: 39bda3e6e2aaa177a38ca53015cf6c13fb164362

---

## Executive Summary

### Implementation Status: Fail

HEAD `39bda3e` is the spec amendment commit (`docs: amend #538 spec to remove autopilot and move smoke provisioning to verify`). The amendment changed AC9, AC10 and AC13 (and FR6, FR7, FR12, tasks T004, T007, T009, T011–T014). No implementation commit follows it, so the code still matches the pre-amendment spec:

- **AC9 / FR6 — autopilot removal: not implemented.** `hooks/register.ts:624` still reads `NMG_SDLC_AUTOPILOT`, and `hooks/register.ts:633-636` still lets headless interactive commands run under autopilot.
- **AC10 / FR7 — smoke gate delivers the recorded issue: not implemented.** `steering/extensions/nmg-sdlc-smoke.mjs:609-699` still drafts and specifies its own issue through `claude -p` with `NMG_SDLC_AUTOPILOT=1`, and never reads `.nmg-sdlc/smoke/provisioned.json`.
- **AC13 / FR12 / T014 — verify-stage provisioning snippet: not implemented.** `steering/snippets/project-smoke.md` does not exist, and `steering/manifest.json` registers no `project.smoke` snippet.

The registered gate was **stopped deliberately** before it reached `repository.nmg-sdlc-smoke`, and was not rerun. The current smoke provider still self-provisions, so running it would have drafted a real issue in `Nunley-Media-Group/nmg-sdlc-smoke`, which the amended AC10 forbids. `repository.tests` was cancelled mid-run as a result (exit 130, result `incomplete: command cancelled`).

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 2 |
| Architecture (SOLID) | 4 |
| Security | 3 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 4 |
| **Overall (architecture average)** | **3.6** |

### Issue Scope

- Active issue: #538
- Spec: `specs/538-replace-herdr-panes-with-hooks-module-subagents-for-sdlc-execute`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC13]; FR [FR1–FR13]; tasks [T001–T014]; scenarios [SCN001–SCN014]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":538,"specPath":"specs/538-replace-herdr-panes-with-hooks-module-subagents-for-sdlc-execute","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10","AC11","AC12","AC13"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10","FR11","FR12","FR13"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009","T010","T011","T012","T013","T014"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010","SCN011","SCN012","SCN013","SCN014"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

### Delivery Validation

- Local verification: Not complete
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`node <plugin-root>/scripts/sdlc-verify-steering.mjs --project . --issue 538 --spec specs/538-… --base main --controller-run-id dbac7959-7e86-4ae5-8176-4b38cf145860`

- The runner exited 130 because the supervisor interrupted it on purpose. It wrote `.nmg-sdlc/verification/538.json` with `ok: false` and `ceiling: Incomplete`.
- Coverage: `declared: 2`, `recorded: 2`, `complete: true`
- The report status is **Fail** because spec acceptance criteria are not implemented, which is stricter than the gate's Incomplete ceiling.

| Validation | Provider | Required | Result | Evidence |
|------------|----------|----------|--------|----------|
| `repository.tests` | `builtin.command` (`npm test -- --runInBand`, cwd `scripts`) | yes | Incomplete | `command cancelled`: jest child stopped by the supervisor |
| `repository.nmg-sdlc-smoke` | `project.nmg-sdlc-smoke` | yes | Incomplete | Never reached. Stopped on purpose to avoid the old self-provisioning provider mutating the smoke repository (AC10) |

**Gate Summary**: 0/2 passed, 0 failed, 2 incomplete

---

## Acceptance Criteria

The criteria marked Incomplete have code evidence on this branch, but no test or smoke result proves them, because the gate was cancelled.

| AC | Status | Evidence |
|----|--------|----------|
| AC1: Stages run as hooks-module subagents without Herdr | Incomplete | `hooks/register.ts:484` (`$.agent.register`) and `:498` (`$.agent.spawn`). The exact-head merge needs the smoke gate, which was not run |
| AC2: Per-stage model/effort from sdlc-models.json | Incomplete | `scripts/sdlc-execute.mjs:14` and `:167` (stage and repair entry selection). Tests not run |
| AC3: Invalid or partial stage configuration | Incomplete | `scripts/sdlc-models.mjs:47`, `scripts/sdlc-execute.mjs:624` (`stageModelsWarning`). Tests not run |
| AC4: Check-ins show worker activity | Incomplete | `scripts/sdlc-execute.mjs:676` (`interval` / `activity_unchanged` / `waiting_marker_stale`), `hooks/register.ts:385` (`$.clock.every` bridge), `:588` check-in prompt |
| AC5: Prompt guidance reaches the worker | Incomplete | `hooks/register.ts:531` (`$.session.append`) |
| AC6: Redispatch/halt stop the worker | Incomplete | `hooks/register.ts:555` (`TaskStop` via `$.tool.call`) |
| AC7: Headless runs and `/sdlc-execute --result` | Incomplete | `hooks/register.ts:606-631`, `src/execute-host.mjs:142` |
| AC8: `--retain-worker` rejected | Incomplete | `scripts/sdlc-execute.mjs:62-63` |
| AC9: Autopilot removed; interactive commands stay TUI-only | **Fail** | `hooks/register.ts:624` reads `NMG_SDLC_AUTOPILOT`, and `:633-636` runs headless interactive commands under it. `src/execute-host.mjs:131` holds the autopilot headless message. Docs still describe autopilot: `README.md:19,119,174,427`, `CONTRIBUTING.md:18`, `references/interactive-gates.md:24`, `workflows/execute/WORKFLOW.md:90`, `workflows/verify-code/references/exercise-testing.md:29,47`, `steering/snippets/project-tech.md:165,171,272,307,386,388` |
| AC10: Smoke gate delivers the verify-provisioned issue | **Fail** | `steering/extensions/nmg-sdlc-smoke.mjs:609-699` still provisions through `claude -p /sdlc-draft-issue` and `/sdlc-write-spec` with `NMG_SDLC_AUTOPILOT=1` (`:629`). It does not read `.nmg-sdlc/smoke/provisioned.json`, and has no `nmg-sdlc-smoke smoke issue not provisioned` failure |
| AC11: Upgrade rewrites the CONTRIBUTING sentence | Incomplete | `scripts/sdlc-upgrade.mjs:1213` (`SUBAGENT_CONTRIBUTING_SENTENCE`). Tests not run |
| AC12: Worker start refusal fails visibly | Incomplete | `scripts/sdlc-execute-host.mjs:87-95` (`worker_start_refused`) |
| AC13: Verify stage provisions the smoke issue | **Fail** | `steering/snippets/project-smoke.md` is missing, `steering/manifest.json` has no `project.smoke` entry, and the rendered verify worker prompt has no provisioning steps |

### Tasks

| Task | Status | Note |
|------|--------|------|
| T001–T003, T005, T006, T008, T010 | Done (pre-amendment) | Files present. Tests not run |
| T004 | **Not done for amendment** | Hooks module still services autopilot and headless interactive runs |
| T007 | **Not done for amendment** | Provider still self-provisions. The recorded-issue read is absent |
| T009 | **Not done for amendment** | README/CONTRIBUTING/steering still document autopilot. CHANGELOG does not record its removal as breaking |
| T011, T012, T013 | **Not done for amendment** | `hooks/register.test.ts`, `scripts/__tests__/nmg-sdlc-smoke.test.mjs`, `execute-host.test.mjs`, `herdr-removal.test.mjs` and `steering-contract.test.mjs` still assert autopilot behavior |
| T014 | **Not done** | Snippet, manifest registration and contract test absent |

### Regression Obligations

None declared.

---

## Architecture Review

| Area | Score (1-5) | Findings |
|------|-------------|----------|
| SOLID Principles | 4 | Clear split: Node-free host protocol (`src/execute-host.mjs`), file host (`scripts/sdlc-execute-host.mjs`), in-process subagent servicing (`hooks/register.ts`). Autopilot remains a second responsibility in the hooks module that the amendment removes |
| Security | 3 | The autopilot path auto-approves `ExitPlanMode` and answers `AskUserQuestion` in any session that sets the variable. The amended spec removes this surface. The smoke provider still makes provider-owned GitHub writes through headless drafting |
| Performance | 4 | Supervision is event-driven through `$.clock.every` and `$.prompt.submit`, so no Bash wait loops |
| Testability | 3 | Good unit seams through the file host. Current tests pin the superseded autopilot contract and need to be rewritten with the amendment |
| Error Handling | 4 | `worker_start_refused`, `--retain-worker` usage error and the stage-model diagnostic are explicit and stable |

---

## Test Results

- `cd scripts && npm test -- --runInBand`: **cancelled** (Incomplete). The supervisor stopped the run before it finished.
- Live smoke (`repository.nmg-sdlc-smoke`): **not run**. Stopped on purpose (see Executive Summary).
- Exercise tests (`exercise-claude.mjs`): not run. They are moot until AC9/AC10/AC13 are implemented.
- BDD scenarios: SCN001–SCN014 are defined in `feature.gherkin`. The code that SCN009, SCN010 and SCN013–SCN014 cover is missing.

## Real Smoke Lifecycle Evidence

None. The gate was stopped before it reached the smoke provider. Running the current provider would have drafted a new issue in `Nunley-Media-Group/nmg-sdlc-smoke`, which violates the amended AC10. No smoke-repository mutation was made by this verification.

---

## Fixes Applied

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| — | — | — | None | The missing work is a full implementation pass across runtime, provider, docs and tests, not a safe local fix | — |

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| High | Spec compliance | `hooks/register.ts`, `src/execute-host.mjs`, docs, tests | AC9/FR6: autopilot not removed (T004, T009, T011, T013) | Implementation scope, so route to implement |
| High | Spec compliance | `steering/extensions/nmg-sdlc-smoke.mjs`, `scripts/__tests__/nmg-sdlc-smoke.test.mjs` | AC10/FR7: provider self-provisions instead of reading `.nmg-sdlc/smoke/provisioned.json` (T007, T012) | Implementation scope, so route to implement |
| High | Spec compliance | `steering/snippets/project-smoke.md`, `steering/manifest.json`, `steering-contract.test.mjs` | AC13/FR12: verify-stage provisioning snippet missing (T014) | Implementation scope, so route to implement |
| Medium | Spec compliance | `CHANGELOG.md`, `docs/decisions/*`, `references/rewrite-*` | FR10/FR13: autopilot removal not recorded as breaking or superseded | Depends on the AC9 change |
| Medium | Verification | `.nmg-sdlc/verification/538.json` | Registered gate incomplete (tests cancelled, smoke not run) | Stopped on purpose. Rerun the full gate after the implementation lands |

## Recommendation

Major rework needed: implement the amended AC9, AC10 and AC13 (T004, T007, T009, T011–T014). Then rerun the full registered gate, including real smoke against a verify-provisioned issue.

**Overall Status: Fail**
