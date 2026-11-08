# Verification Report: Replace Herdr panes with hooks-module subagents for /sdlc-execute

**Date**: 2026-11-08
**Issue**: #538
**Reviewer**: nmg-sdlc verify worker (architecture-reviewer)
**Scope**: Implementation verification against the amended Approved spec
**Controller run id**: dbac7959-7e86-4ae5-8176-4b38cf145860

**Verification head**: 7fadc265257ecd85bc6733a4bc79299bb323fce1

---

## Executive Summary

### Implementation Status: Fail

HEAD `7fadc26` implements the amendment. Autopilot is removed (AC9), the smoke provider delivers only the recorded issue (AC10), and the `project.smoke` verify snippet drives provisioning (AC13). The previous report's three Fail findings are resolved. `repository.tests` passes.

The required live smoke gate **failed**, and its cause is a real nmg-sdlc defect, not an environmental one:

- **`/sdlc-execute` cannot start its first stage subagent: `supervising_session_lost`.** The `supervise` subprocess creates the execute session id (`scripts/sdlc-execute.mjs:1038-1040`) and prints it on stdout only after `superviseExecute` returns. The hooks module starts the heartbeat and request bridge only once that stdout arrives (`hooks/register.ts:713-716`, `startBridge`). `superviseExecute` returns only once a report or `worker.json` exists (`scripts/sdlc-execute-supervisor.mjs:563-566`). `worker.json` is written only after the hooks module answers the spawn request (`scripts/sdlc-execute-host.mjs:96-97`). On its first poll, the spawn request runs `assertAlive()` (`scripts/sdlc-execute-host.mjs:56-58,76`) and finds no `host.json` heartbeat yet. The controller therefore fails at once with `supervising_session_lost`, and the late bridge start leaves a lone `host.json`. This is a startup ordering deadlock, so every real `/sdlc-execute` run fails, in the TUI and headless alike.

This defect blocks AC1, AC5, AC6 and AC7 at runtime, and stops AC10 from proving delivery. The verify publication scope allows writes only to this report, so the fix routes to implementation.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 3 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 4 |
| **Overall (architecture average)** | **3.8** |

### Issue Scope

- Active issue: #538
- Spec: `specs/538-replace-herdr-panes-with-hooks-module-subagents-for-sdlc-execute`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC13]; FR [FR1–FR13]; tasks [T001–T014]; scenarios [SCN001–SCN014]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":538,"specPath":"specs/538-replace-herdr-panes-with-hooks-module-subagents-for-sdlc-execute","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10","AC11","AC12","AC13"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10","FR11","FR12","FR13"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009","T010","T011","T012","T013","T014"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010","SCN011","SCN012","SCN013","SCN014"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

### Delivery Validation

- Local verification: Failed (required smoke gate failed)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`node <plugin-root>/scripts/sdlc-verify-steering.mjs --project . --issue 538 --spec specs/538-… --base main --controller-run-id dbac7959-7e86-4ae5-8176-4b38cf145860`

- `.nmg-sdlc/verification/538.json`: `ceiling: Fail`; identity head `7fadc265257ecd85bc6733a4bc79299bb323fce1`, tree clean
- Coverage: `declared: 2`, `recorded: 2`, `complete: true`

| Validation | Provider | Required | Result | Evidence |
|------------|----------|----------|--------|----------|
| `repository.tests` | `builtin.command` (`npm test -- --runInBand`, cwd `scripts`) | yes | Passed | `command exited 0` |
| `repository.nmg-sdlc-smoke` | `project.nmg-sdlc-smoke` | yes | **Failed** | `nmg-sdlc-smoke execute exited 1`, `/sdlc-execute stopped: supervising_session_lost` (session `93f39cdc-8b75-4656-a8c4-fc64ca163846`) |

**Gate Summary**: 1/2 passed, 1 failed, 0 incomplete

---

## Acceptance Criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC1: Stages run as hooks-module subagents without Herdr | **Fail** | Code: `hooks/register.ts` registers and spawns `nmg-sdlc:execute-<entry>`. No runtime `herdr` invocation remains; the only matches are upgrade legacy detectors, ADRs and tests. Runtime: the live smoke run never started a stage because of the `supervising_session_lost` startup deadlock |
| AC2: Per-stage model/effort from sdlc-models.json | Pass (unit) | `scripts/sdlc-execute.mjs` stage and repair entry selection. Jest suite green |
| AC3: Invalid or partial stage configuration | Pass (unit) | `scripts/sdlc-models.mjs` diagnostic and single warning line. Jest green. The smoke run logged the missing-file warning and used plugin defaults |
| AC4: Check-ins show worker activity | Pass (unit) | `scripts/sdlc-execute.mjs` reasons `interval`, `activity_unchanged` and `waiting_marker_stale`, plus the `$.clock.every` bridge in `hooks/register.ts`. No live worker ran to exercise them |
| AC5: Prompt guidance reaches the worker | Incomplete | `$.session.append` path is present and unit-tested. Unprovable live while no worker can start |
| AC6: Redispatch/halt stop the worker | Incomplete | `TaskStop` path is present and unit-tested. Unprovable live while no worker can start |
| AC7: Headless runs and `/sdlc-execute --result` | **Fail** | The headless session did exit, and printed `/sdlc-execute stopped: <diagnosis>`, so the stopped-run reporting works. But a headless run cannot reach a stage, so no run can deliver |
| AC8: `--retain-worker` rejected | Pass | `scripts/sdlc-execute.mjs:62-63` usage error. Jest green |
| AC9: Autopilot removed; interactive commands TUI-only | Pass | Live exercise from a disposable repo: `NMG_SDLC_AUTOPILOT=1 claude -p --plugin-dir <checkout> "/sdlc-draft-issue …"` and `"/sdlc-write-spec #1"` each printed `Run /<name> in the TUI.`, exited 2, and left the tree unchanged. No runtime, workflow, README, `CLAUDE.md`, `CONTRIBUTING.md` or `interactive-gates.md` references remain. `CHANGELOG.md:32` records the breaking removal. The cutover ADR marks decisions 4 and 6 superseded |
| AC10: Smoke gate delivers the verify-provisioned issue | **Fail** | The provider read `.nmg-sdlc/smoke/provisioned.json` (#293), checked OPEN, author, `spec-created` and merged PR #294, cloned the repo, recorded the closing-PR baseline, and ran the headless `claude -p --session-id … /sdlc-execute #293`. It drafted nothing and called no `herdr`. Delivery failed on the AC1 defect, so there is no merged-PR or closed-issue proof |
| AC11: Upgrade rewrites the CONTRIBUTING sentence | Pass (unit) | `scripts/sdlc-upgrade.mjs:1213-1216,1350`, with the v3 and v4 sentences documented in upgrade-project references. Jest green |
| AC12: Worker start refusal fails visibly | Pass (unit) | `scripts/sdlc-execute-host.mjs:87-95` (`worker_start_refused`). Jest green |
| AC13: Verify stage provisions the smoke issue | Pass | Run live in this verification. Following `steering/snippets/project-smoke.md`, the worker cloned the smoke repo, ran `claude --plugin-dir <checkout>` in detached tmux `nmg-smoke-7fadc265`, and answered the trust, capability, type, milestone and plan dialogs. Real `/sdlc-draft-issue` created #293. Real `/sdlc-write-spec #293` merged PR #294 and the worker chose `Finished`. The worker then killed the session, removed the clone and wrote the record. Both workflows behaved correctly, so there is no draft-issue or write-spec defect to report |

### Tasks

| Task | Status | Note |
|------|--------|------|
| T001–T014 | Files present | Every task's expected artifacts exist. The amendment tasks T004, T007, T009 and T011–T014 are now implemented. The bridge startup ordering in T001–T003 is defective at runtime (see Remaining Issues) |

### Regression Obligations

None declared.

---

## Architecture Review

| Area | Score (1-5) | Findings |
|------|-------------|----------|
| SOLID Principles | 4 | Clean split between the Node-free host protocol (`src/execute-host.mjs`), the file host (`scripts/sdlc-execute-host.mjs`) and in-process servicing (`hooks/register.ts`). Removing autopilot took the second responsibility out of the hooks module |
| Security | 4 | The autopilot auto-approve surface is gone. The smoke provider makes no ad-hoc GitHub writes; it verifies the recorded issue's author, label and merged spec PR before delivering |
| Performance | 4 | Supervision is event-driven through `$.clock.every` and `$.prompt.submit`, with no Bash wait loops |
| Testability | 3 | Unit seams are good, but the tests seed the heartbeat or bridge before the spawn request, so they miss the real cross-process startup order between `supervise` stdout and `startBridge`. A test needs to drive `supervise` → first spawn with no pre-existing `host.json` |
| Error Handling | 4 | The failure surfaced as an explicit `supervising_session_lost` stop with a diagnosis, not a hang. `worker_start_refused` and the usage errors are stable |

---

## Test Results

- `cd scripts && npm test -- --runInBand`: **passed** (exit 0, recorded by the registered gate at head `7fadc26`)
- Live smoke (`repository.nmg-sdlc-smoke`): **failed**, `nmg-sdlc-smoke execute exited 1`
- Exercise (AC9): `claude -p --plugin-dir <checkout>` headless refusal for `/sdlc-draft-issue` and `/sdlc-write-spec` with `NMG_SDLC_AUTOPILOT=1`: both exit 2 with no mutation
- BDD: SCN001–SCN014 are defined. SCN001, SCN005–SCN007 and SCN010 have no passing runtime evidence because of the startup deadlock

## Real Smoke Lifecycle Evidence

- Provisioning (verify worker, AC13): issue https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/293 drafted by real `/sdlc-draft-issue`. Spec PR https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/294 (`docs: approve spec for #293`) MERGED by real `/sdlc-write-spec`. The record `.nmg-sdlc/smoke/provisioned.json` names issue 293
- Gate: the provisioning check passed; `git clone --single-branch` succeeded; the closing-PR baseline was empty and the issue OPEN
- Delivery: `claude -p --session-id 93f39cdc-8b75-4656-a8c4-fc64ca163846 --plugin-dir <checkout> "/sdlc-execute #293"` stopped with `supervising_session_lost` before any stage started
- Post-state: #293 is OPEN, there is no #293 branch or PR besides the spec PR, and the smoke repo is unmutated. The record stays valid, so the next verification reuses #293 (no new draft)
- `repository.nmg-sdlc-smoke` preserved as a required, always-applicable gate

---

## Fixes Applied

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| — | — | — | None | The verify publication scope allows writes only to this report, and the defect is runtime code | implement |

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Critical | Correctness | `hooks/register.ts:713-716`, `scripts/sdlc-execute.mjs:1038-1040`, `scripts/sdlc-execute-supervisor.mjs:563-566`, `scripts/sdlc-execute-host.mjs:56-76` | Startup deadlock: the bridge and heartbeat start only after `supervise` returns, but `supervise` returns only after the first spawn, and the spawn fails at once on the missing heartbeat. Result: `supervising_session_lost` on every run (AC1, AC5–AC7, AC10). Candidate fixes: (a) start the bridge before the controller's first request, for example when the hooks module sees the `supervise` command start, or have `supervise` take a session id the hooks module chose; or (b) give the file host a bounded grace period for the first heartbeat before it declares the session lost | Outside the verify publication scope; route to implement |
| Medium | Testability | `scripts/__tests__/sdlc-execute*.test.mjs`, `hooks/register.test.ts` | No test covers `supervise` → first spawn without a pre-seeded `host.json` | Add with the fix |
| Low | Steering | smoke repo `steering/sdlc-models.json` | Missing, so plugin defaults were used (AC3 warning path). Not a cause | Smoke project fixture; out of plugin scope |

## Recommendation

Fix the bridge startup ordering in implementation, add a regression test for the first-spawn handshake, and rerun the full registered gate. The rerun reuses smoke issue #293 from the existing provisioning record.

**Overall Status: Fail**
