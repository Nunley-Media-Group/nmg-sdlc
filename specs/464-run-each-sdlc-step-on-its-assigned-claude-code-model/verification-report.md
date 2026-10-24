# Verification Report: Run each nmg-sdlc step on its assigned Claude Code model

**Date**: 2026-10-24
**Issue**: #464
**Reviewer**: Claude Code (nmg-sdlc:architecture-reviewer, verify worker)
**Scope**: Implementation verification against spec
**Verification head**: 9220afd304fc60dd65802afa5bf68349bb02ad7a

---

## Executive Summary

The branch `464-run-each-nmg-sdlc-step-on-its-assigned-claude-code-model` is at `9220afd`, which is also `main` and `origin/main`. `git log main..HEAD` is empty and `git diff main...HEAD` is empty. The only commit for #464 on this line is the spec replacement (#468). None of tasks T001–T006 has been implemented, so no acceptance criterion is met.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 1 |
| Architecture (SOLID) | N/A (no change) |
| Security | N/A (no change) |
| Performance | N/A (no change) |
| Testability | N/A (no change) |
| Error Handling | N/A (no change) |
| **Overall** | 1 |

### Implementation Status: Fail
**Total Issues**: 6 (one per unimplemented task)

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

- Local verification: Not complete
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- `steering/manifest.json` loads: modules `product`, `tech`, `structure`, `verification`, extension `project.nmg-sdlc-smoke`. Registered validations are `repository.tests` (builtin.command, required) and `repository.nmg-sdlc-smoke` (required, always).
- `repository.tests` (`cd scripts && CI=1 npm test -- --runInBand`): **passed**, 50 suites passed and 1 skipped; 1038 tests passed and 2 skipped (373 s). This proves only that the unchanged `main` tree is green. No #464 assertion exists yet.
- `repository.nmg-sdlc-smoke`: **not run**. The branch has no plugin change, so a live smoke experiment would have no #464 hypothesis to test (steering, Smoke Experiment Scope §3). Running it would also use up a smoke issue. The gate stays non-passing.
- Ceiling: **Fail**, because no acceptance criterion is implemented.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Fresh stage workers start on their stage model | Fail | `scripts/sdlc-execute.mjs` `workerAgentArgs` has no `--model`; no `stageModel` export (`grep stageModel` finds nothing) |
| AC2 | Repair re-dispatch escalates to opus | Fail | No `stageModel` failure rule exists |
| AC3 | Automated command files declare their model | Fail | `commands/sdlc-status.md`, `sdlc-verify-code.md`, `sdlc-open-pr.md` have no `model:` frontmatter |
| AC4 | Hooks-registered commands run on their model | Fail | `hooks/register.ts` has no `turn.step` model rewrite |
| AC5 | Override ends when the user moves on or picks a model | Fail | No override or `prompt.submit` clearing exists |
| AC6 | Packaged agents and steering declare the same models | Fail | `agents/spec-implementer.md` and `agents/deliverer.md` omit `model` (spec requires `sonnet`); steering table still says "omit" |
| AC7 | Worker start failure on a model-routed launch | Fail | No model-routed launch path exists to test |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Define the step model map (`SDLC_MODELS`) | Incomplete | No `SDLC_MODELS` export in `src/host-events.mjs` |
| T002 | Launch stage workers on their model | Incomplete | `scripts/sdlc-execute.mjs` unchanged |
| T003 | Declare models in automated command files | Incomplete | `src/sdlc-commands.mjs` and `commands/*.md` unchanged |
| T004 | Route hooks-registered commands through `turn.step` | Incomplete | `hooks/register.ts` unchanged |
| T005 | Sync agents, steering, and README | Incomplete | Agents, `steering/snippets/project-tech.md`, README, and CHANGELOG unchanged |
| T006 | Test coverage | Incomplete | No `stageModel`, `step models`, or model-frontmatter tests |

---

## Architecture Assessment

There is no implementation diff to review, so SOLID, security, performance, testability, and error-handling checklists were not scored against any change. The design in `design.md` was not re-reviewed here; it was approved in #468.

---

## Test Results

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests (`repository.tests`) | Pass | 1038 passed / 2 skipped, exit 0. Unchanged `main` tree only |
| Live smoke (`repository.nmg-sdlc-smoke`) | Incomplete | Not run: no plugin change to exercise |
| Skill inventory / plugin surface | Not applicable | No surface change in diff |
| Git hygiene (`git diff --check main...HEAD`) | Pass | Exit 0 (empty diff) |

**Gate Summary**: 2/4 passed, 0 failed, 1 incomplete, 1 not applicable

BDD coverage: 0/7 scenarios have implementing tests.

---

## Fixes Applied

None. The verify publication scope allows writing only this report, and implementing the whole feature is implementation-stage work, not a small local fix.

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Critical | Spec compliance | `src/host-events.mjs` | T001 `SDLC_MODELS` map missing | Implementation stage not run |
| Critical | Spec compliance | `scripts/sdlc-execute.mjs` | T002 `--model` worker routing missing | Implementation stage not run |
| Critical | Spec compliance | `src/sdlc-commands.mjs`, `commands/*.md` | T003 command `model` frontmatter missing | Implementation stage not run |
| Critical | Spec compliance | `hooks/register.ts` | T004 `turn.step` override missing | Implementation stage not run |
| High | Documentation | `agents/*.md`, steering, README, CHANGELOG | T005 sync missing | Implementation stage not run |
| High | Test coverage | `scripts/__tests__/`, `hooks/register.test.ts` | T006 tests missing | Implementation stage not run |

## Recommendation

Major rework needed: run the implement stage for #464 (T001–T006), then verify again with the full registered gate, including live smoke.
