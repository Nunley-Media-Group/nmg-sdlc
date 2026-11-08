# Verification Report: Replace Herdr panes with hooks-module subagents for /sdlc-execute

**Date**: 2026-11-08
**Issue**: #538
**Reviewer**: nmg-sdlc verify worker (architecture-reviewer)
**Scope**: Implementation verification against spec

**Verification head**: a94d45e5efb15380df88f5267078a6a46cbabd8c

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 2 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 4 |
| **Overall** | 3.5 |

### Implementation Status: Fail
**Total Issues**: 2 (1 Critical, 1 Low)

The Herdr transport is replaced cleanly by the file host (`scripts/sdlc-execute-host.mjs`), the shared Node-free protocol (`src/execute-host.mjs`, `src/stage-models.mjs`) and the hooks-module bridge (`hooks/register.ts`). Contract tests pass: 1288 Jest tests and 47 hooks-module tests. Every static gate also passes.

The required live smoke gate `repository.nmg-sdlc-smoke` **failed** with `nmg-sdlc-smoke provisioning draft created no issue`. The headless `claude -p --plugin-dir <checkout> "/sdlc-draft-issue <need>"` run under `NMG_SDLC_AUTOPILOT=1` printed the rendered workflow text as its output and exited, so the model never ran the workflow. This is a confirmed plugin defect in the new headless command path (`hooks/register.ts:648`). It blocks AC9 and AC10. AC1 and AC7 have no live proof, because `/sdlc-execute` headless uses the same `{ text: rendered.text }` answer.

---

## Issue Scope

- Active issue: #538
- Spec: `specs/538-replace-herdr-panes-with-hooks-module-subagents-for-sdlc-execute`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC12]; FR [FR1–FR11]; tasks [T001–T013]; scenarios [SCN001–SCN012]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":538,"specPath":"specs/538-replace-herdr-panes-with-hooks-module-subagents-for-sdlc-execute","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10","AC11","AC12"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10","FR11"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009","T010","T011","T012","T013"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010","SCN011","SCN012"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Not complete (required `repository.nmg-sdlc-smoke` failed)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

Artifact: `.nmg-sdlc/verification/538.json` (controller run `52bdfe5e-1a20-443a-bc0d-e72e54d02320`, head `a94d45e5efb15380df88f5267078a6a46cbabd8c`, clean tree).

- Coverage: declared 2, recorded 2, complete `true`; no missing, duplicate, or unknown ids.
- Ceiling: **Fail**.

| Validation | Required | Status | Evidence |
|------------|----------|--------|----------|
| `repository.tests` (`npm test -- --runInBand` in `scripts/`) | yes | passed | exit 0; Test Suites: 60 passed, 1 skipped; Tests: 1288 passed, 2 skipped |
| `repository.nmg-sdlc-smoke` | yes | **failed** | `nmg-sdlc-smoke provisioning draft created no issue`. The `claude -p /sdlc-draft-issue (provisioning)` stdout is the hooks preamble plus the rendered draft-issue workflow (about 8 KB), with no model work. The smoke issue baseline stays at #290 and no new issue was created |

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Stages run as hooks-module subagents without Herdr | Incomplete | Implemented in `hooks/register.ts` (`spawnWorker`, `$.agent.register`/`$.agent.spawn`) and `scripts/sdlc-execute-host.mjs` (`createFileHost`). `scripts/__tests__/herdr-removal.test.mjs` shows no `herdr` invocation. No live merge/close proof: the smoke gate failed before delivery |
| AC2 | Per-stage model/effort from sdlc-models.json | Pass | `overrideStep` applies the worker `model`/`effort` to every subagent step, and omits effort for `default` (`hooks/register.ts`, `spawnWorker` effort spread). Validator shared via `src/stage-models.mjs`. Covered by `register.test.ts` and `sdlc-models.test.mjs` |
| AC3 | Invalid/partial config keeps behavior | Pass | `validateStageModels` and `StageModelsError` diagnostic unchanged in `src/stage-models.mjs`; `scripts/sdlc-models.mjs` re-exports them; `sdlc-models.test.mjs`, `sdlc-execute.test.mjs` |
| AC4 | Check-in reports show activity | Pass | `activityRecord` in `src/execute-host.mjs`; `interval`/`activity_unchanged`/`waiting_marker_stale` in the supervisor; `announceReport` + `checkInNotice` in `hooks/register.ts`; `execute-host.test.mjs`, `sdlc-execute-supervisor.test.mjs` |
| AC5 | Prompt guidance reaches running worker | Pass | `appendToWorker` → `$.session.append`, falling back to `$.session.send`; tested in `register.test.ts` |
| AC6 | Redispatch/halt stop the worker | Pass | `stopWorker` (`TaskStop`, status check, deny-after-stop `tool.call` hook); `worker_stop_failed` in the file host; tested |
| AC7 | Headless runs complete and report exit status | **Fail** | `/sdlc-execute --result` reads `.nmg-sdlc/execute/results/<id>.json` (unit-tested). The headless `/sdlc-execute` answer is `{ text: rendered.text }` (`hooks/register.ts:648`). The live smoke shows that answer from the same branch prints the text and ends the run without a model turn |
| AC8 | `--retain-worker` rejected | Pass | `scripts/sdlc-execute.mjs:62-63` usage error; argument hint updated; `sdlc-execute.test.mjs` |
| AC9 | Interactive commands run headless under autopilot | **Fail** | Live smoke: `claude -p --plugin-dir <checkout> "/sdlc-draft-issue <need>"` with `NMG_SDLC_AUTOPILOT=1` printed the preamble plus workflow and exited, creating no issue. The without-autopilot refusal path is unchanged (unit-tested) |
| AC10 | Smoke gate runs without Herdr | **Fail** | `steering/extensions/nmg-sdlc-smoke.mjs` now uses headless `claude -p` with autopilot and invokes no `herdr` command, but provisioning fails as described under AC9, so the gate cannot pass |
| AC11 | Upgrade rewrites managed CONTRIBUTING sentence | Pass | `scripts/sdlc-upgrade.mjs:1213-1216,1350-1362`; idempotence tested in `sdlc-upgrade.test.mjs` |
| AC12 | Worker start failure fails visibly | Pass | `spawnWorker` returns deny on a missing definition, rejected registration, or refused spawn; the file host throws `worker_start_refused`; tested |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Node-free stage-model and host-protocol modules | Complete | `src/stage-models.mjs`, `src/execute-host.mjs` + `.d.mts` |
| T002 | Replace controller Herdr transport with file host | Complete | `scripts/sdlc-execute-host.mjs`, `scripts/sdlc-execute.mjs` |
| T003 | Supervisor and controller lease | Complete | heartbeat-based reclaim in `scripts/sdlc-controller-lease.mjs` |
| T004 | Hooks module stage subagents and headless runs | Incomplete | Subagent bridge complete; the headless command answer does not start a model turn (see Remaining Issues) |
| T005 | Stage agent definitions | Complete | no `model`/`effort` frontmatter; Herdr-only dispatch text removed |
| T006 | Execute workflow rewrite | Complete | `workflows/execute/WORKFLOW.md` |
| T007 | Smoke gate to headless Claude sessions | Complete (code) | Implemented, but blocked at runtime by the T004 defect |
| T008 | Upgrade CONTRIBUTING sentence | Complete | |
| T009 | Public docs and changelog | Complete | README, CONTRIBUTING, CLAUDE.md, tooling reference, snippets, CHANGELOG |
| T010–T013 | Tests | Complete | All pass, but `register.test.ts` asserts the `{ text }` headless answer through the test engine, which does not model the real host's headless behavior |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Clear split between pure protocol (`src/execute-host.mjs`), Node transport (`scripts/sdlc-execute-host.mjs`) and host bridge (`hooks/register.ts`). `hooks/register.ts` keeps growing (≈900 lines) |
| Open/Closed | 4 | Request kinds are table-driven |
| Liskov Substitution | 4 | `host` replaces `herdr` behind the same controller seams |
| Interface Segregation | 4 | File host exposes a narrow `{ spawn, activity, append, send, stop, wait, hostAlive, finish }` |
| Dependency Inversion | 4 | Controller depends on an injected host; the hooks module imports no Node built-ins |

### Layer Separation

Respects the structure steering: the hooks module stays Node-free, and shared logic lives in `src/`.

### Dependency Flow

`hooks/register.ts` → `src/execute-host.mjs` → `src/stage-models.mjs`. Scripts → `src/`. No reverse edges.

---

## Security Assessment

- [x] Input validation: `validateHostRequest` checks every request field (UUID session, known entry/agent, valid model, effort, and permission mode) before any spawn
- [x] Injection prevention: smoke and controller use argument arrays; no shell interpolation of request values
- [x] Data protection: session files written atomically with mode 0600
- [x] Stopped workers are denied every further tool call

## Performance Assessment

- [x] Bounded records: 10 tool calls, 2000-character latest text, 200-character summaries
- [x] Bridge tick of 1 s with a re-entrancy guard; latest text refreshed at most every 15 s
- [x] Synchronous `Atomics.wait` polling only in the detached controller

## Error Handling

Stable reason codes: `worker_start_refused`, `worker_stop_failed`, `supervising_session_lost`, `missing_handoff`, and `process_lost`. Swallowed errors in `tick` are retried on the next tick. Each refusal is answered with an explicit deny.

---

## Test Coverage

### Coverage Summary

- Feature file: 12 scenarios (SCN001–SCN012), each mapped to an AC
- Jest: 1288 passed, 2 skipped (60 suites passed, 1 skipped)
- Hooks module (`claude plugin test .`): 47 pass, 0 fail
- Gap: no test exercises the real host's handling of a `command.run` `{ text }` answer in a headless run; the live smoke gate is the only evidence, and it fails

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `/sdlc-draft-issue` (headless under autopilot), via the smoke provider |
| **Exercise Method** | `claude -p --plugin-dir <checkout> --permission-mode <mode> "/sdlc-draft-issue <need>"` in a fresh `nmg-sdlc-smoke` clone, `NMG_SDLC_AUTOPILOT=1` |
| **Interactive gate handling** | Autopilot (never reached) |

### Captured Output Summary

The stdout begins `nmg-sdlc: /sdlc-draft-issue is running headless under NMG_SDLC_AUTOPILOT=1 with no UI. Call EnterPlanMode first, …` and continues with the full rendered draft-issue workflow. No tool calls were made, and no GitHub issue was created (baseline #290 unchanged).

### AC Evaluation

| AC | Verdict | Evidence |
|----|---------|----------|
| AC9 | Fail | Workflow text printed as command output; no model turn |
| AC10 | Fail | Provisioning failed: `draft created no issue` |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests (`repository.tests`) | Pass | exit 0; 1288 passed |
| Live smoke project (`repository.nmg-sdlc-smoke`) | **Fail** | `nmg-sdlc-smoke provisioning draft created no issue` |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: clean (90 items mapped) |
| Claude Code plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository`: passed |
| Hooks module tests | Pass | `claude plugin test .`: 47 pass |
| Git hygiene | Pass | `git diff --check main...HEAD`: exit 0 |
| Prompt quality | Pass | Workflow/agent edits keep the automated no-question contract |

**Gate Summary**: 6/7 passed, 1 failed, 0 incomplete

---

## Fixes Applied

None. This verify step's publication scope allows writes only to this report, and the defect needs a design change in the hooks module (T004).

## Remaining Issues

### Critical Issues

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Architecture / Spec compliance |
| **Location** | `hooks/register.ts:645-649` (`command.run` headless branch) |
| **Issue** | In a headless run, the hook answers its own command with `{ text: [headlessPlanPreamble(name)] + rendered.text }`. Under the host's `CommandRunResult` contract (`.claude-plugin/types/claude-code/index.d.ts`, around line 1858), a hook's own answer "runs no command: its `text` is shown as the command's output". It does not become the model's prompt. In `claude -p "/<cmd>"` the run prints the text and ends, so no model turn runs. The design assumption ("answers `{ text: rendered.text }` so the workflow runs as the headless prompt") is false on the real host |
| **Impact** | Headless interactive commands under autopilot (AC9), the smoke gate's provisioning and delivery (AC10), and headless `/sdlc-execute` (AC7, and AC1 for headless runs) do not run their workflows. The required smoke gate cannot pass |
| **Reason Not Fixed** | Needs an implementation change outside the verify publication scope, and a confirmed host mechanism for starting a model turn from a headless command. Possible routes are to submit the rendered workflow as a prompt (`$.prompt.submit`) or to carry it as model-visible `context`; either needs a focused live reproduction under `claude -p` before the smoke gate is rerun. The hooks-module test engine accepts the current answer, so `register.test.ts` needs a case that reflects the real headless semantics |

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Documentation |
| **Location** | `scripts/sdlc-upgrade.mjs:2559`, `workflows/upgrade-project/WORKFLOW.md:13`, `workflows/upgrade-project/references/detection.md:3`, `workflows/upgrade-project/references/v3-detectors.md:55` |
| **Issue** | The `packaging-v4-claude-code-herdr` detector still tells v3 projects that v4 "requires Herdr" / "plus Herdr" |
| **Impact** | Upgrading users get stale Herdr guidance; it does not affect delivery |
| **Reason Not Fixed** | Outside verify publication scope; fold into the next implementation pass |

---

## Positive Observations

- The transport swap is cleanly contained, and controller routing, gates and handoff validation are unchanged (FR2).
- Request validation and deny-after-stop give strong fail-closed behavior.
- The test suite was rewritten substantially and stays green.

## Recommendations Summary

### Before PR (Must)
- [ ] Make headless `/sdlc-*` commands (autopilot interactive commands and `/sdlc-execute`) start a real model turn with the rendered workflow. Prove it with a focused `claude -p --plugin-dir <checkout>` reproduction, then rerun the full registered gate including `repository.nmg-sdlc-smoke`

### Short Term (Should)
- [ ] Remove the stale "requires Herdr" text from the `packaging-v4-claude-code-herdr` detector

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `hooks/register.ts` | 1 | Headless `command.run` answer |
| `src/execute-host.mjs` | 0 | |
| `src/stage-models.mjs` | 0 | |
| `scripts/sdlc-execute-host.mjs` | 0 | |
| `scripts/sdlc-execute.mjs` | 0 | |
| `scripts/sdlc-upgrade.mjs` | 1 | Low: stale Herdr detector text |
| `steering/extensions/nmg-sdlc-smoke.mjs` | 0 | Correct, blocked by the hooks defect |
| `agents/*.md` | 0 | |

---

## Recommendation

**Needs fixes**

The required live smoke gate failed on a confirmed plugin defect: a headless command answer is printed as output, not run as a prompt. Route back to implementation diagnosis, then rerun the full registered gate at the new head.
