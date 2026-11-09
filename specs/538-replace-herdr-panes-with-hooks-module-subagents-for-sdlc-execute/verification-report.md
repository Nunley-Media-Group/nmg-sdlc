# Verification Report: Replace Herdr panes with hooks-module subagents for /sdlc-execute

**Date**: 2026-11-08
**Issue**: #538
**Reviewer**: nmg-sdlc verify worker (architecture-reviewer)
**Scope**: Implementation verification against the amended Approved spec
**Controller run id**: dbac7959-7e86-4ae5-8176-4b38cf145860

**Verification head**: 9a50a22c091c9fd7c5899048379f26f92d413361

---

## Executive Summary

### Implementation Status: Pass

HEAD `9a50a22` fixes the startup-ordering deadlock that failed the previous verification (`supervising_session_lost` on every run). `superviseExecute` now also returns while a host request is waiting with no fresh heartbeat (`scripts/sdlc-execute-supervisor.mjs` `awaitingBridge`). The file host also waits up to one heartbeat window (`HOST_HEARTBEAT_MS`, 60 s) for a first heartbeat, and only when no `host.json` exists yet. A present but stale heartbeat still fails at once (`scripts/sdlc-execute-host.mjs` `assertAliveOrStarting`). New Jest cases cover the first-spawn handshake with no pre-seeded `host.json`.

Both registered gates pass at the exact source head. The live smoke gate delivered the verify-provisioned smoke issue #293 end to end, through hooks-module stage subagents with no Herdr. Its closing PR #295 is MERGED at the invocation's pre-merge delivery head `6d010d880b500592f0c93bebb3b819ad8ae6a92e`, and the issue is CLOSED.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall (architecture average)** | **4.0** |

**Total Issues**: 1 (Low, pre-existing, outside #538 scope)

### Issue Scope

- Active issue: #538
- Spec: `specs/538-replace-herdr-panes-with-hooks-module-subagents-for-sdlc-execute`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC13]; FR [FR1–FR13]; tasks [T001–T014]; scenarios [SCN001–SCN014]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":538,"specPath":"specs/538-replace-herdr-panes-with-hooks-module-subagents-for-sdlc-execute","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10","AC11","AC12","AC13"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10","FR11","FR12","FR13"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009","T010","T011","T012","T013","T014"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010","SCN011","SCN012","SCN013","SCN014"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

### Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`node <plugin-root>/scripts/sdlc-verify-steering.mjs --project . --issue 538 --spec specs/538-… --base main --controller-run-id dbac7959-7e86-4ae5-8176-4b38cf145860` exited 0 with `ok: true`.

- `.nmg-sdlc/verification/538.json`: `ceiling: null`. Identity: head `9a50a22c091c9fd7c5899048379f26f92d413361`, tree clean, spec hash `sha256:2afc4e6e…`, steering hash `sha256:dc2b05c4…`
- Coverage: `declared: 2`, `recorded: 2`, `complete: true`; nothing missing, duplicated or unknown

| Validation | Provider | Required | Result | Evidence |
|------------|----------|----------|--------|----------|
| `repository.tests` | `builtin.command` (`npm test -- --runInBand`, cwd `scripts`) | yes | Passed | `command exited 0` |
| `repository.nmg-sdlc-smoke` | `project.nmg-sdlc-smoke` | yes | Passed | `nmg-sdlc-smoke delivered #293`; PR #295 MERGED at `6d010d880b500592f0c93bebb3b819ad8ae6a92e`, issue CLOSED |

**Gate Summary**: 2/2 passed, 0 failed, 0 incomplete

---

## Acceptance Criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC1: Stages run as hooks-module subagents without Herdr | Pass | `hooks/register.ts` registers and spawns `nmg-sdlc:execute-<entry>`. Live: headless `/sdlc-execute #293` (session `76b7f0a9-2e8a-4360-b369-541a06ee87a3`) ran its stages as subagents with no Herdr environment and reached exact-head merge and issue closure (`#293: MERGED and CLOSED`). No runtime `herdr` invocation remains |
| AC2: Per-stage model/effort from sdlc-models.json | Pass | `scripts/sdlc-execute.mjs` stage and repair entry selection, plus effort `default` handling. Jest green |
| AC3: Invalid or partial stage configuration | Pass | `scripts/sdlc-models.mjs` diagnostic and single warning line. Jest green. Live: the smoke run used the plugin defaults with the missing-file warning |
| AC4: Check-ins show worker activity | Pass | The `activity` object and the `interval`, `activity_unchanged` and `waiting_marker_stale` reasons in `scripts/sdlc-execute.mjs`; the `$.clock.every` / `$.prompt.submit` bridge in `hooks/register.ts`. Jest green |
| AC5: Prompt guidance reaches the worker | Pass | `$.session.append` path in `hooks/register.ts`, with the controller waiting for a fresh handoff. Jest green. The live run needed no `prompt` decision |
| AC6: Redispatch/halt stop the worker | Pass | `TaskStop` through `$.tool.call` before a replacement or halt; halt exits non-zero. Jest green. The live run needed no redispatch or halt |
| AC7: Headless runs and `/sdlc-execute --result` | Pass | Live: `claude -p --session-id 76b7f0a9-… --plugin-dir <checkout> "/sdlc-execute #293"` stayed alive through all stages and ended with `#293: MERGED and CLOSED`. The provider read the result through `--resume … "/sdlc-execute --result"`. The stage subagents used the `--plugin-dir` candidate |
| AC8: `--retain-worker` rejected | Pass | `scripts/sdlc-execute.mjs` usage error; `--check-in-seconds` still accepted. Jest green |
| AC9: Autopilot removed; interactive commands TUI-only | Pass | Unchanged since `7fadc26`, where a live exercise showed headless `/sdlc-draft-issue` and `/sdlc-write-spec` with `NMG_SDLC_AUTOPILOT=1` printing `Run /<name> in the TUI.`, exiting 2, and leaving the tree unchanged. No runtime or doc reads of `NMG_SDLC_AUTOPILOT` remain. `CHANGELOG.md` records the breaking removal |
| AC10: Smoke gate delivers the verify-provisioned issue | Pass | The provider read `.nmg-sdlc/smoke/provisioned.json` (#293) and checked OPEN, author, `spec-created` and merged spec PR #294. It cloned with `--single-branch` and recorded an empty closing-PR baseline. It then ran headless `/sdlc-execute #293` and proved PR #295 MERGED at the pre-merge delivery head and #293 CLOSED. It drafted nothing and called no `herdr` |
| AC11: Upgrade rewrites the CONTRIBUTING sentence | Pass | `scripts/sdlc-upgrade.mjs` v3/v4 Herdr sentence rewrite, idempotent. Jest green |
| AC12: Worker start refusal fails visibly | Pass | `scripts/sdlc-execute-host.mjs` `worker_start_refused`. Jest green |
| AC13: Verify stage provisions the smoke issue | Pass | Following `steering/snippets/project-smoke.md` step 1, this run reused record #293: OPEN, `spec-created`, and `docs: approve spec for #293` (PR #294) merged. Fresh provisioning through real tmux-driven `/sdlc-draft-issue` and `/sdlc-write-spec` was proven live at `7fadc26`, and the snippet is unchanged since |

### Tasks

| Task | Status | Note |
|------|--------|------|
| T001–T014 | Complete | Every task's expected artifacts exist. `9a50a22` repairs the T001–T003 bridge startup ordering and adds its regression tests (`scripts/__tests__/execute-host.test.mjs`, `scripts/__tests__/sdlc-execute-supervisor.test.mjs`) |

### Regression Obligations

None declared.

---

## Architecture Review

| Area | Score (1-5) | Findings |
|------|-------------|----------|
| SOLID Principles | 4 | Clean split between the Node-free host protocol (`src/execute-host.mjs`), the file host (`scripts/sdlc-execute-host.mjs`) and in-process servicing (`hooks/register.ts`). The fix stays inside the supervisor and file host, and `requestNumbers` is now shared by `nextRequestNumber` |
| Security | 4 | The autopilot auto-approve surface is gone. The smoke provider makes no ad-hoc GitHub writes. The startup grace applies only while no `host.json` exists and a heartbeat has never been seen, so a lost session is still detected |
| Performance | 4 | Supervision is event-driven. The grace window is bounded (60 s) and polls at 250 ms |
| Testability | 4 | Tests now cover a first spawn with no pre-seeded heartbeat, a stale-heartbeat immediate failure, and a supervise yield on an unanswered host request |
| Error Handling | 4 | `supervising_session_lost`, `worker_start_refused` and the usage errors are stable. After a heartbeat is seen, a missing heartbeat fails at once |

---

## Test Results

- `cd scripts && npm test -- --runInBand`: **passed** (exit 0, recorded by the registered gate at `9a50a22`)
- Live smoke (`repository.nmg-sdlc-smoke`): **passed**, `nmg-sdlc-smoke delivered #293`
- BDD: SCN001–SCN014 are defined. SCN001, SCN007 and SCN010 now have live runtime evidence from the smoke delivery. The others are covered by Jest contract tests and earlier live exercises (SCN009 at `7fadc26`)

## Real Smoke Lifecycle Evidence

- Provisioning (AC13): the record `.nmg-sdlc/smoke/provisioned.json` names https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/293. It was reused: OPEN, `spec-created`, and spec PR https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/294 MERGED
- Baseline: issue OPEN with no closing PRs before the run
- Delivery: `claude -p --session-id 76b7f0a9-2e8a-4360-b369-541a06ee87a3 --plugin-dir <checkout> "/sdlc-execute #293"` in the clone, with `NMG_SDLC_SMOKE_OWNED=1`. Final line: `#293: MERGED and CLOSED`
- Proof: #293 CLOSED by https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/295, MERGED with `headRefOid` `6d010d880b500592f0c93bebb3b819ad8ae6a92e`, which matches the invocation's pre-merge delivery proof. PR #295 is outside the empty pre-run baseline
- #293 is now delivered and terminal; the next verification provisions a fresh smoke issue
- `repository.nmg-sdlc-smoke` preserved as a required, always-applicable gate

---

## Fixes Applied

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| — | — | — | None in this verification. The previous Critical startup deadlock was fixed in implementation at `9a50a22` | — | — |

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Low | Error Handling | `workflows/open-pr/WORKFLOW.md:10` | Under `/sdlc-execute`, the deliver worker's first `sdlc-deliver.mjs --issue N` call failed with `controller_lease_held`. It succeeded on retry once the worker added `--controller-run-id`. The instruction does not name the `--controller-run-id` option the way verify's instructions do | Pre-existing: the line is unchanged from `main`, the worker recovered on its own, and it is outside #538's scope and the verify publication scope. Worth a follow-up issue |

## Recommendation

**Ready for PR.** Every acceptance criterion passes. Both registered gates pass, with complete coverage at the exact source head `9a50a22c091c9fd7c5899048379f26f92d413361`, and the live smoke delivery proves stage subagents work end to end without Herdr.

**Overall Status: Pass**
