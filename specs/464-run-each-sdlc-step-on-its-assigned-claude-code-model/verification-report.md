# Verification Report: Run each nmg-sdlc step on its assigned Claude Code model

**Date**: 2026-10-24
**Issue**: #464
**Reviewer**: Claude Code (manual verification at the owner's request; not an nmg-sdlc verify worker)
**Scope**: Implementation verification against spec
**Verification head**: a5e7ee1 (source tree identical to the implementation commit c8a8a1e)

---

## Executive Summary

The implementation in c8a8a1e meets all seven acceptance criteria and all seven functional requirements, and tasks T001–T006 are complete. A verify-stage commit (24df307) added a steering line that misdiagnosed a cancelled gate. It was reverted in a5e7ee1, so the source tree under review is exactly c8a8a1e. The earlier Fail report in this file was written on the empty branch at 9220afd, before anything was implemented. It is replaced here.

This verification was done by hand because the `/sdlc-execute` controller cancelled the registered gate (#470). The contract suite, the plugin tests, the surface and spec audits, and a live model-routing exercise all pass. **The registered live smoke gate (`repository.nmg-sdlc-smoke`) was not run.** It drives `/sdlc-execute` in the smoke repository, which is the path #470 breaks, and the owner asked for delivery without nmg-sdlc.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | 5 |

### Implementation Status: Pass
**Total Issues**: 0 blocking; 1 gate not run (live smoke, see Test Results)

---

## Issue Scope

- Active issue: #464
- Spec: `specs/464-run-each-sdlc-step-on-its-assigned-claude-code-model`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7]; tasks [T001, T002, T003, T004, T005, T006]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":464,"specPath":"specs/464-run-each-sdlc-step-on-its-assigned-claude-code-model","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7"],"tasks":["T001","T002","T003","T004","T005","T006"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: contract tests, plugin tests, and audits pass; live smoke not run
- PR evidence: CI on the delivery pull request

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Fresh stage workers start on their stage model | Pass | `stageModel` and `workerAgentArgs` in `scripts/sdlc-execute.mjs` append `--model` after `--plugin-dir <root> --permission-mode <mode>`. Tests `starts each fresh stage on its model and a repair re-dispatch on opus` and `passes the stage model to claude after the permission mode` in `scripts/__tests__/sdlc-execute.test.mjs` pass: start `haiku`, implement `sonnet`, verify `opus`, deliver `sonnet` |
| AC2 | Repair re-dispatch escalates to opus | Pass | A recorded failure other than `pr_evidence_pending` or `mergeability_reverification_required` returns `SDLC_MODELS.repair` (`opus`) for implement, verify, and deliver, and never for start. `preserves dirty partial work and repairs more than two distinct failures without an attempt cap` asserts the models `sonnet, opus, opus, opus, opus, opus, sonnet`, so the deliver after the pass is back on `sonnet` |
| AC3 | Automated command files declare their model | Pass | `commands/sdlc-status.md` `model: haiku`, `sdlc-verify-code.md` `model: opus`, `sdlc-open-pr.md` `model: sonnet`, all rendered by `renderAutomatedCommandMarkdown`. Live run from this checkout with a sonnet session (`claude -p --model sonnet --plugin-dir <checkout>`): `/nmg-sdlc:sdlc-status --json` used only `claude-haiku-5-5`, `/nmg-sdlc:sdlc-verify-code` used only `claude-opus-5-5`, and a plain prompt in the same configuration used `claude-sonnet-5-5` |
| AC4 | Hooks-registered commands run on their model | Pass | `hooks/register.ts` `turn.step` rewrites the model of main-loop requests only (no `agentId`). `claude plugin test .` test `hooks-registered commands run on their model without changing the session model` covers the workflow, the write-spec Continue, and the Finished nudge (`opus`), `/sdlc-execute` (`haiku`), an unchanged subagent request, an unchanged effort, and no `/model` run or settings write |
| AC5 | Override ends when the user moves on or picks a model | Pass | `prompt.submit` clears the override on a non-meta `composer` or `bridge` submission. `overrideStep` clears it when `$.session.model()` differs from the recorded model. Test `the override ends when the user moves on or picks a model` covers meta and task-notification prompts keeping it, typed and bridge prompts ending it, a session-model change ending it, and a render failure setting none |
| AC6 | Packaged agents and steering declare the same models | Pass | `agents/starter.md` `haiku`, `spec-implementer.md` `sonnet`, `architecture-reviewer.md` `opus`, `deliverer.md` `sonnet`. The Agent Files table in `steering/snippets/project-tech.md` matches. Test `agents and steering declare the stage models` in `scripts/__tests__/steering-contract.test.mjs` passes |
| AC7 | Worker start failure on a model-routed launch | Pass | `stops with agent_start_failed on a model-routed launch and sends no prompt` passes for both `#42` (pane closed) and `#42 --retain-worker` (pane kept), with no prompt sent |

## Functional Requirements

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | `SDLC_MODELS` in `src/host-events.mjs` is frozen at every level and Node-free. The controller, the command renderer, the hooks module, and the contract tests import it, and no model is defined anywhere else |
| FR2 | Pass | `api.agentStart({ ..., model: stageModel(step, failure) })` runs on every dispatch |
| FR3 | Pass | Checked-in `commands/*.md` match the renderer (`plugin-commands.test.mjs`) |
| FR4 | Pass | `hooks/register.ts` only returns `{ ...e, model }` from `turn.step`, and never sets the session model or writes settings |
| FR5 | Pass | See AC5 |
| FR6 | Pass | `assigns one model alias to every interactive and automated command` limits every value to `haiku`, `sonnet`, and `opus` |
| FR7 | Pass | The agents, steering table, `README.md` Model Map, and `CHANGELOG.md` all document the map |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Define the step model map | Complete | `src/host-events.mjs`, `src/host-events.d.mts` |
| T002 | Launch stage workers on their model | Complete | `scripts/sdlc-execute.mjs` |
| T003 | Declare models in the automated command files | Complete | `src/sdlc-commands.mjs`, `commands/*.md` |
| T004 | Route hooks-registered commands through `turn.step` | Complete | `hooks/register.ts` |
| T005 | Sync agents, steering, and README | Complete | `agents/spec-implementer.md`, `agents/deliverer.md`, `steering/snippets/project-tech.md`, `README.md`, `CHANGELOG.md` |
| T006 | Test coverage | Complete | `scripts/__tests__/sdlc-execute.test.mjs`, `plugin-commands.test.mjs`, `steering-contract.test.mjs`, `sdlc-commands.test.mjs`, `hooks/register.test.ts` |

---

## Architecture Assessment

There is one source of truth for every model. The override is per-request: the hooks module rewrites only the outgoing main-loop request and never touches session state. A failed `$.session.model()` read fails open, so the request goes out unchanged and nothing is blocked. Model values are tier aliases, never pinned model ids. Error handling scores 4 because a failed session-model read at command start silently drops the override rather than reporting it. The spec accepts that, and it is covered by `a failing session model read never blocks or rewrites a request`.

---

## Test Results

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests (`repository.tests`) | Pass | `cd scripts && CI=1 npm test -- --runInBand` exited 0: 50 suites passed and 1 skipped; 1045 tests passed and 2 skipped (382 s) |
| Hooks module (`claude plugin test .`) | Pass | 20 passed, 0 failed |
| Plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository --claude-validate` exited 0 |
| Current specs | Pass | `node scripts/verify-current-specs.mjs` exited 0 |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: clean (90 items) |
| Git hygiene | Pass | `git diff --check main...HEAD` exited 0 |
| Live smoke (`repository.nmg-sdlc-smoke`) | Not run | It drives `/sdlc-execute` in the smoke repository, the path #470 breaks, and the owner asked for delivery without nmg-sdlc |

BDD coverage: 7/7 scenarios have implementing tests (SCN001–SCN002 and SCN007 in `sdlc-execute.test.mjs`, SCN003 in `plugin-commands.test.mjs`, SCN004–SCN005 in `hooks/register.test.ts`, SCN006 in `steering-contract.test.mjs`).

---

## Fixes Applied

- Reverted 24df307 (a steering line that blamed a foreground `Bash` timeout for the cancelled gate; the actual cause is #470).

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Medium | Verification | `repository.nmg-sdlc-smoke` | Live smoke not run for this head | Blocked on #470; owner-directed manual delivery |

## Recommendation

Ready to merge on CI evidence. Run the live smoke gate once #470 lands.
