# Verification Report: Track /sdlc-execute's queued issues with a Claude Code /goal

**Date**: 2026-10-26
**Issue**: #529
**Reviewer**: Claude Code (architecture-reviewer, verify worker)
**Scope**: Implementation verification against spec
**Verification head**: ab94405923629f63388ef1fc8b2fad672171b8f2

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 4 |
| Error Handling | 5 |
| **Overall** | 4.8 |

### Implementation Status: Pass
**Total Issues**: 0 blocking (1 low-severity note)

Every approved acceptance criterion, functional requirement, task and scenario is implemented at the verification head. Both manifest-registered validations passed with complete coverage: `repository.tests` and the live `repository.nmg-sdlc-smoke`, which delivered nmg-sdlc-smoke #287. The applicable steering gates (skill inventory, plugin surface, `git diff --check`) also exit 0.

---

## Issue Scope

- Active issue: #529
- Spec: `specs/529-track-sdlc-execute-s-queued-issues-with-a-claude-code-goal`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6]; FR [FR1, FR2, FR3, FR4, FR5, FR6]; tasks [T001, T002, T003, T004, T005, T006]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":529,"specPath":"specs/529-track-sdlc-execute-s-queued-issues-with-a-claude-code-goal","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004","T005","T006"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs --project . --issue 529 --spec specs/529-… --base main --controller-run-id 59262b96-2a5e-4d65-96a7-c50c0aa0fd61` exited 0 with `ok: true` and `ceiling: null`.

`.nmg-sdlc/verification/529.json`: identity head `ab94405923629f63388ef1fc8b2fad672171b8f2`, tree `clean`, coverage `declared: 2, recorded: 2, complete: true`, nothing missing, duplicated or unknown.

| Validation | Provider | Required | Status | Evidence |
|------------|----------|----------|--------|----------|
| `repository.tests` | `builtin.command` | yes | passed | `npm test -- --runInBand` in `scripts/` exited 0 |
| `repository.nmg-sdlc-smoke` | `project.nmg-sdlc-smoke` | yes | passed | `nmg-sdlc-smoke delivered #287`: the issue was provisioned through the real draft-issue/write-spec workflows in an autopilot Herdr pane, then delivered by this checkout's execute controller to an exact-head merge with the issue closed |

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Explicit tokens set a goal before the first `supervise` | Pass | `workflows/execute/WORKFLOW.md:22,36` routes tokens through **Set the goal**; `hooks/register.ts:284` denies `supervise` until `goalSet`; `hooks/register.ts:291,368,207` record the helper result and run `$.command.run({ command: 'goal', args: condition })` from `turn.complete`; `src/host-events.mjs:207` builds the condition naming each `#N: MERGED and CLOSED` line and the stop prefix |
| AC2 | Bare runs set the goal once the issue set is resolved | Pass | `scripts/sdlc-execute.mjs:1183,1209` resolves the `N-*` branch issue, or reports `goal_issues_unresolved` exit 1; `WORKFLOW.md:23,115` route the branch path and picker step 7 through **Set the goal** in resolved order |
| AC3 | Delivery meets the goal from conversation text | Pass | `WORKFLOW.md:49` requires each `#N: MERGED and CLOSED` line to be repeated verbatim in the reply |
| AC4 | A halt or non-remediable exit ends the goal | Pass | `WORKFLOW.md:49` requires `/sdlc-execute stopped: <diagnosis>` as the reply's last line; the condition accepts that line |
| AC5 | A goal that cannot be set refuses the run | Pass | `hooks/register.ts:207` checks `$.command.list()` for `goal`, resets `goalSet = false` on rejection, and submits a prompt carrying `executeGoalStoppedLine(reason)` (`src/host-events.mjs:233`); `supervise` stays denied |
| AC6 | Runs that select nothing set no goal | Pass | `hooks/register.ts:240-249`: headless, model-refused and render-failed dispatches return before `startInteractiveCommand`, so no execute run starts; empty/failed `list-specified` and `Stop — run nothing` stop before **Set the goal** (`WORKFLOW.md` Select specified issues; `WORKFLOW.md:47`) |

## Functional Requirements

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | `supervise` gate at `hooks/register.ts:284`, before `next` |
| FR2 | Pass | `executeGoalCondition` lists issues in order with the completion and stop terms |
| FR3 | Pass | Condition is conversation-judgeable; test asserts ≤ 4,000 chars at 20 issues; cap `EXECUTE_GOAL_MAX_ISSUES = 20` (`src/host-events.mjs:197`) matches `parseArgs` |
| FR4 | Pass | `goal_unavailable` stop line plus persistent refusal |
| FR5 | Pass | See AC6 |
| FR6 | Pass | `README.md:309` **Completion goal**; `WORKFLOW.md:36-55` |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Node-free goal helpers | Complete | `src/host-events.mjs:197-236`, `.d.mts` declarations; module still imports nothing |
| T002 | `goal` controller subcommand | Complete | Flags ignored via `parseArgs`; invalid tokens throw into the existing usage/exit-2 path; reads only `git branch --show-current` |
| T003 | Hooks goal gate and handshake | Complete | State, deny gate, `turn.complete` handshake via `void`, failure prompt |
| T004 | Execute workflow routing | Complete | Set the goal section, start/picker routing, completion and stop lines, `/goal clear` |
| T005 | README and changelog | Complete | README section; CHANGELOG bullet ending `(#529)` (rolled to `[4.7.0]` by the delivery commit `ab94405`) |
| T006 | Behavior and contract tests | Complete | `scripts/__tests__/execute-goal.test.mjs` (unit, CLI-in-temp-repo, source-contract); inventory audit clean |

---

## Architecture Assessment

| Area | Score | Notes |
|------|-------|-------|
| SOLID | 5 | Pure classification lives in Node-free `src/host-events.mjs`; the hooks module only holds session state and wiring; the controller subcommand is read-only and reuses `parseArgs`/`parseIssueBranch` |
| Security | 5 | Issue tokens are validated as distinct positive safe integers before they reach the condition; no shell interpolation; `git` is called with an argument array; nothing is written to GitHub, Herdr or git |
| Performance | 5 | Constant-time regex checks on each Bash call; one `command.list()` per run |
| Testability | 4 | Helpers and the CLI have deterministic tests. The hooks handshake is covered by source-contract assertions only, with no event-driven harness (see note) |
| Error Handling | 5 | Fails closed: an invalid condition, a missing `goal` command, or a rejected run all keep `supervise` refused and emit one stable stop line; an aborted or errored turn leaves the run refusing `supervise` and does not set a goal |

---

## Test Results

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests (`cd scripts && npm test`) | Pass | Registered `repository.tests` exit 0 at the verification head |
| Live smoke project | Pass | Registered `repository.nmg-sdlc-smoke`: delivered nmg-sdlc-smoke #287 (provisioned, merged at exact head, closed) |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check` → `clean (90 items mapped)` |
| Claude Code plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository` → passed |
| Skill creator validation | N/A | The verify worker edited no workflow-bundled files |
| Skill exercise | N/A (gap noted) | No deterministic `execute` fixture exists under `scripts/__fixtures__/skill-exercise/` |
| Prompt quality | Pass | Set the goal steps are ordered, testable and cover the success, `ok:false`, refused-`supervise` and goal-failure branches |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |

**Gate Summary**: 6/6 applicable gates passed, 0 failed, 0 incomplete.

### Exercise Testing

The interactive goal handshake runs only in a TUI session. Under `claude -p`, `/sdlc-execute` prints the headless refusal (AC6 path). The smoke gate exercises the headless `sdlc-execute.mjs run` path, which requirements.md excludes from scope. Runtime evidence for AC1–AC5 is therefore the unit/CLI tests and source-contract tests in `scripts/__tests__/execute-goal.test.mjs`, as allowed by the Gherkin-or-documented-reason rule.

### Real Smoke Lifecycle Evidence

`repository.nmg-sdlc-smoke` passed at head `ab94405923629f63388ef1fc8b2fad672171b8f2`. It cloned `Nunley-Media-Group/nmg-sdlc-smoke`, provisioned a fresh issue in an autopilot Herdr pane, and delivered #287 through this checkout's execute controller. Its result identity matches the head, steering hash and spec hash recorded above.

---

## Fixes Applied

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| — | — | — | None required | — | — |

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Low | Testability | `hooks/register.ts` | The hooks goal handshake (deny, `turn.complete`, failure prompt) is checked by source-text assertions, not by driving events through the module. A local `tsc` type-check was not run because TypeScript is not installed in this checkout | Non-blocking: behavior matches design.md on inspection, and the verify publication scope allows only the report |

## Recommendation

Ready for PR.
