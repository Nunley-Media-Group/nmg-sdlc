# Verification Report: Keep /sdlc-execute supervising after it stops a stage worker that already settled

**Date**: 2026-11-21
**Issue**: #567
**Reviewer**: Claude Code (nmg-sdlc verify worker, gate phase)
**Scope**: Implementation verification against spec
**Verification head**: e2c1e0d62b192bba08163dcecc14a2bd130de380

---

## Executive Summary

The fix confirms the stop of a stage worker that is idle or no longer listed. The controller no longer fails with `worker_stop_failed`. A `supervise` rerun in the same Claude session is now bridged even when its `Bash` call moves to the background: the hooks module chooses the session id itself, passes it as `supervise --session <uuid>`, and starts the bridge before the command runs.

The review passed at `b87b1475fccf989685ba9d5e1394aff09824c014` (scoped mode, after one repair) with no finding above `info`. This gate ran once at the queue head `e2c1e0d62b192bba08163dcecc14a2bd130de380`, after the default branch was integrated and the version prepared (4.20.2). Every registered pre-merge validation passed. Coverage is complete (4 declared, 4 recorded) and there is no ceiling.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 4.67 |

### Implementation Status: Pass
**Total Issues**: 3 (all `info`; none block)

---

## Issue Scope

- Active issue: #567
- Spec: `specs/567-keep-sdlc-execute-supervising-after-it-stops-a-stage-worker-that-already-settled`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2]; FR [FR1, FR2, FR3, FR4, FR5]; tasks [T001, T002, T003, T004, T005]; scenarios [SCN001, SCN002]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":567,"specPath":"specs/567-keep-sdlc-execute-supervising-after-it-stops-a-stage-worker-that-already-settled","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5"],"tasks":["T001","T002","T003","T004","T005"],"scenarios":["SCN001","SCN002"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/567.json` (tier `pre-merge`, base `main`)
- Identity: head `e2c1e0d62b192bba08163dcecc14a2bd130de380`, tree clean, steering `sha256:dd21875f54cdaa20fc04f9d39e709b8f8941858ee8ead4f9e9af1822c077b34b`, spec `sha256:5d8a832b5072977ab10af56fb3b8c6a3f9a6788d4472683d2b51bc6de75b28f1`
- Coverage: declared 4, recorded 4, complete `true`, no missing, duplicate or unknown results
- Ceiling: none
- Selection: mode `all`, reason `fallback_path` (`hooks/register.test.ts` matches `selection.fallbackPaths`), model `haiku` at `xhigh`, rejection `null`. Required surfaces were `execute` and `plugin-host`. Every surface was selected, so all smoke surfaces ran.

---

## Acceptance Criteria Verification

The criteria come from the passed review record `.nmg-sdlc/verification/567-review.json`.

| AC | Description | Status | Exercised | Evidence |
|----|-------------|--------|-----------|----------|
| AC1 | Stopping a settled worker does not crash the controller | Pass | real entry point | `hooks/register.ts` `stopWorker` (about lines 622-644) confirms `ok: true` unless the listed status is in `ACTIVE_AGENT_STATUSES`, and refuses as `status unknown` when `agent.list` fails. `scripts/sdlc-execute-host.mjs:131-134` still raises `worker_stop_failed` only on a refusal. `hooks/register.test.ts` `@SCN001` tests cover idle, unlisted, still-running (refused) and a rejected list read (refused). |
| AC2 | A resumed controller is supervised in the same session | Pass | **mocked** | `hooks/register.ts` (about lines 832-861) names its own `supervise` calls with `--session <randomUUID>` and starts a pending bridge before `next()`. `scripts/sdlc-execute.mjs:1497-1518` accepts `--session`. The `hooks/register.test.ts` `@SCN002` test bridges a backgrounded supervise rerun with empty stdout through the request bridge with a mocked host. The test mocks the path under test: no real Claude session backgrounds a `Bash` call in it. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Confirm the stop of a settled worker | Complete | FR1, `hooks/register.ts` `stopWorker` |
| T002 | Let the hooks module assign the supervise session id | Complete | FR2/FR3, `hooks/register.ts`, `scripts/sdlc-execute.mjs` |
| T003 | Keep a new bridge alive until its session directory exists | Complete | FR4, bridge tick waits up to `HOST_HEARTBEAT_MS` |
| T004 | Add behavioral regression coverage | Complete | FR5, `hooks/register.test.ts`, `scripts/__tests__/sdlc-execute*.test.mjs` |
| T005 | Add the CHANGELOG entry | Complete | Rolled into `## [4.20.2] - 2026-11-21` and ends with `(#567)` |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Stop confirmation stays in `stopWorker`. Session naming lives in `withExecuteSession`, and bridge lifetime in the bridge tick. |
| Open/Closed | 5 | `supervise` keeps generating an id without `--session`, so runs that bypass the hooks module are unchanged (DP6). |
| Liskov Substitution | 5 | No subtype contracts are affected. |
| Interface Segregation | 5 | `--session` is internal to the hooks module, and the workflow text needs no change (C6). |
| Dependency Inversion | 5 | `ACTIVE_AGENT_STATUSES` and `HOST_HEARTBEAT_MS` come from the shared `src/execute-host.mjs` (C3). |

### Layer Separation

The hooks module still imports no Node built-ins. The script side validates `--session` input and owns the session directory.

### Dependency Flow

`hooks/register.ts` depends on `src/execute-host.mjs` constants. `scripts/sdlc-execute.mjs` consumes the injected option before `parseArgs` (C1). The removed `STOPPED_STATUSES` has no remaining reference (C5).

---

## Security Assessment

- [x] Authentication: not affected
- [x] Authorization: a stopped worker's later tool calls and messages stay denied (FR1)
- [x] Input validation: `--session` accepts only a canonical UUID whose directory does not exist (`invalid_session_id`, `session_exists`; DP4/DP5)
- [x] Injection prevention: the session id is generated with `crypto.randomUUID`, not taken from user input
- [x] Data protection: a bridge writes nothing until its session directory exists (DP8)

---

## Performance Assessment

- [x] Async patterns: the bridge ticks on the existing interval
- [x] Caching: not applicable
- [x] Resource management: a bridge whose directory never appears is abandoned after `HOST_HEARTBEAT_MS` (DP9), and a newer session replaces it (DP11)
- [x] Query optimization: one `agent.list` read per stop

---

## Test Coverage

### Scenario Coverage

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | `@SCN001` | `hooks/register.test.ts` | Implemented |
| AC2 | `@SCN002` | `hooks/register.test.ts`, plus `--session` CLI tests in `scripts/__tests__/sdlc-execute.test.mjs` and `scripts/__tests__/sdlc-execute-supervisor.test.mjs` | Implemented |

### Test-Layer Findings

Kept test types: `bdd` (from `steering/test-layers.json`).

Among the test files the branch added or changed:

- Duplicate: none
- Non-kept type: none. Note F2 (info): the `supervise --session` CLI tests cite `@SCN002` but sit outside the scenario's `# File: hooks/register.test.ts` header. Approved task T004 places them in `scripts/__tests__`.
- Justified: none (the implement handoff's `justifiedTests` is `[]`)

### Test Results

| Validation | Tier | Selection | Status | Evidence |
|------------|------|-----------|--------|----------|
| `repository.tests` | `change` | `{ provider: claude:haiku, reason: fallback_path, fallbackPath: hooks/register.test.ts, selectedCount: null }` | Pass | `npm test -- --runInBand` (cwd `scripts`) exited 0: 78 of 79 suites passed (1 skipped), 1930 passed and 2 skipped of 1932 tests, 910 s. Log: `.nmg-sdlc/verification/567/repository.tests.log` |
| `repository.nmg-sdlc-smoke` | `null` | `null` | Pass | It exercised `draft-issue`, `write-spec`, `onboard-project`, `upgrade-project`, `steering`, `run-retro` and `execute`, and delivered nmg-sdlc-smoke #338 |
| `repository.tests.full` | `full` | `null` | Skipped before merge | `full` tier; `/sdlc-verify-full` runs it |
| `repository.nmg-sdlc-smoke.full` | `full` | `null` | Skipped before merge | `full` tier; `/sdlc-verify-full` runs it |

---

## Exercise Test Results

The change touches `hooks/` (the `plugin-host` surface), so every smoke surface was driven live against fresh clones of `Nunley-Media-Group/nmg-sdlc-smoke`. Each ran in an interactive `claude --plugin-dir <this checkout>` session inside a detached tmux session, and each is recorded under `.nmg-sdlc/smoke/surfaces/` bound to head `e2c1e0d6`.

| Surface | Command | Outcome |
|---------|---------|---------|
| `draft-issue` | `/sdlc-draft-issue <provision.need>` | Created nmg-sdlc-smoke #338, "Add greeting_shortest_word library helper" (enhancement, v3) |
| `write-spec` | `/sdlc-write-spec #338` | Spec PR #339 `docs: approve spec for #338` MERGED; #338 labelled `spec-created`; answered Finished |
| `onboard-project` | `/sdlc-onboard-project` | Found the project already initialized, delegated to upgrade, and changed nothing |
| `upgrade-project` | `/sdlc-upgrade-project` | Applied the approved `agents-to-claude-md`, `sdlc-models`, `test-layers` (bdd and unit kept) and `verification-scope` changes in the clone, and backfilled no labels. The first apply attempt hit a transient blocked-by read failure; the retry succeeded |
| `steering` | `/sdlc-steering` | Inspect only (No change); steering valid |
| `run-retro` | `/sdlc-run-retro` | Wrote `steering/retrospective.md` and its state file in the clone, with one learning from #219 |
| `execute` | Headless `/sdlc-execute #338` (session `e946c140-5a61-4de6-ac11-8b81b5d18e84`), run by the gate | nmg-sdlc-smoke #338 CLOSED; PR #340 MERGED at `1e9cd27ed965b7d15e9a46a1bad665fa778263a0`, which matches the invocation's pre-merge delivery proof |

Observations from the smoke runs. Both are outside #567's scope, and neither is a defect in this change:

- In the smoke clone, the upgrade's approved `AGENTS.md` to `CLAUDE.md` rename broke 2 of the smoke project's own pytest-bdd scenarios, which read `AGENTS.md` by name. The clone was disposable and nothing was committed. Per the smoke-scope steering, that smoke-application finding is not repaired here.
- After the upgrade kept both detected test types, a fresh `detect` still listed `test-layers` as actionable. This may deserve its own nmg-sdlc issue.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests (`repository.tests`) | Pass | Full suite ran (selection fallback path); exit 0; 1930 passed, 2 skipped |
| Live smoke project (`repository.nmg-sdlc-smoke`) | Pass | All 7 smoke surfaces had passed head-bound records; #338 delivered by PR #340 MERGED at `1e9cd27e`; issue CLOSED |
| Skill inventory, plugin surface, skill-creator, skill exercise | Not applicable | No `workflows/`, `agents/` or `references/` change; the plugin-surface contracts ran inside the full Jest suite |
| Git hygiene | Pass | Tree clean at the verification head |

**Gate Summary**: 2/2 registered pre-merge validations passed, 0 failed, 0 incomplete; 2 `full`-tier validations skipped before merge.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| minor | Error Handling | `hooks/register.ts` `stopWorker` | Review finding F1: a rejected `agent.list` read confirmed the stop as if the worker were gone | Repair `b87b147` refuses the stop as `status unknown` when the list read fails, and adds a `@SCN001` test for it | `direct` (implement stage) |

This gate made no edits.

## Remaining Issues

### Critical Issues
None.

### High Priority
None.

### Medium Priority
None.

### Low Priority

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Low (info, F2) | Testing | `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-execute-supervisor.test.mjs` | The `supervise --session` CLI tests cite `@SCN002` outside the scenario's `# File:` header | Approved T004 places them there; this concerns the spec's shape, not the behaviour |
| Low (info, F3) | Testing | `hooks/register.ts:857` | Local `tsc` reports TS2339 `backgroundTaskId` on `{}`, the same kind as 3 errors already on main | Likely a stale local types snapshot; no runtime effect |
| Low (info, F4) | Error Handling | `hooks/register.ts` | A `supervise` spelling that `CONTROLLER_SUPERVISE` cannot name in advance (for example `node -r ./preload.mjs` or `bash -c '...'`) binds only from a foreground session line | Residual edge; the documented form is always named |

---

## Positive Observations

- The stop path fails closed. Only a confirmed inactive or absent worker is acknowledged, and an unreadable list is refused.
- Choosing the session id before the command runs removes the dependence on foreground stdout. Callers outside the hooks module are unchanged.
- The live smoke delivery of #338 passed through the changed controller and hooks module end to end.

---

## Recommendations Summary

### Before PR (Must)
- None.

### Short Term (Should)
- [ ] Consider moving the `@SCN002` CLI coverage under the scenario's `# File:` header, or naming both files in the spec (F2).

### Long Term (Could)
- [ ] Refresh the local `.claude-plugin/types` snapshot so `tsc` runs clean (F3).
- [ ] Look into `test-layers` staying actionable after an upgrade that keeps every detected type (smoke observation).

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `hooks/register.ts` | 2 (info) | Stop confirmation, session naming, bridge lifetime |
| `hooks/register.test.ts` | 0 | `@SCN001` and `@SCN002` scenario implementations |
| `scripts/sdlc-execute.mjs` | 0 | `supervise --session` |
| `scripts/sdlc-execute-supervisor.mjs` | 0 | Comment update |
| `scripts/__tests__/sdlc-execute.test.mjs` | 1 (info) | `--session` CLI tests |
| `scripts/__tests__/sdlc-execute-supervisor.test.mjs` | 1 (info, shared with the row above) | Supervisor fixture |
| `CHANGELOG.md`, `VERSION`, `package.json`, `.claude-plugin/plugin.json` | 0 | 4.20.2 release prep, in sync |

---

## Recommendation

**Ready for PR**

The review is clean apart from `info` notes. The single pre-merge gate passed at the queue head with complete registered coverage, including the full Jest suite and a live smoke delivery that ran through the changed execute path.
