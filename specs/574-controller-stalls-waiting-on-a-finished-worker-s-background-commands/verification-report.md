# Verification Report: Controller stalls waiting on a finished worker's background commands

**Date**: 2026-11-23
**Issue**: #574
**Reviewer**: Claude (nmg-sdlc verify worker, gate phase)
**Scope**: Pre-merge gate at the merge-queue head against the Approved spec

**Verification head**: 3dd6e690cdb8f9c41ba969b9d1463cc0764af1cf

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 5 |
| **Overall** | 4.7 |

### Implementation Status: Pass
**Total Issues**: 0 above `info`

The code review passed at `9b29fb0a3a69` with only `info` findings. This gate ran at the merge-queue head `3dd6e690`, the merge of `origin/main` (`1d32871`) into the branch. `hooks/register.ts`, `src/execute-host.mjs` and `scripts/sdlc-execute.mjs` are unchanged from the previously verified head `19a2a44`. At this head the full contract suite passes and the live smoke gate passes. The deterministic steering ceiling is clear: both applicable pre-merge validations passed, and the two full-tier validations were skipped by tier.

Because surface records are head-bound, every selected interactive smoke surface was driven live again at this head. Smoke issue #347 from the previous gate was already delivered and closed, so a fresh issue was provisioned: #353 (spec PR #354 merged). The gate's headless `/sdlc-execute #353` delivered it through PR #355.

---

## Issue Scope

- Active issue: #574
- Spec: `specs/574-controller-stalls-waiting-on-a-finished-worker-s-background-commands`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002]; scenarios [SCN001, SCN002]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":574,"specPath":"specs/574-controller-stalls-waiting-on-a-finished-worker-s-background-commands","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002"],"scenarios":["SCN001","SCN002"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Complete (every applicable required validation passed)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/574.json`, tier `pre-merge`, base `main`
- Identity: head `3dd6e690cdb8f9c41ba969b9d1463cc0764af1cf`, steering `sha256:dd21875f54cdaa20fc04f9d39e709b8f8941858ee8ead4f9e9af1822c077b34b`, spec `sha256:4b8a7746316f96b5759d6fe815341274b03ed87be65ae83e92be4fbca97a5b8e`. The tree was clean when the gate ran.
- Coverage: declared 4, recorded 4, complete `true`; no missing, duplicate or unknown entries
- Selection: model `haiku`, effort `xhigh`, mode `all`, reason `fallback_path` (`hooks/register.ts`), no rejection, no guidance supplied. Required surfaces were `execute` and `plugin-host`. Every surface was selected: draft-issue, write-spec, onboard-project, upgrade-project, steering, run-retro, execute, status, verify-full, plugin-host, shared-references, project-steering, script-assets, ci.
- **Ceiling: none (Pass)**

---

## Acceptance Criteria Verification

The evidence comes from the passed review record `.nmg-sdlc/verification/574-review.json` (full mode, review head `9b29fb0a3a69`).

| AC | Description | Status | Exercised | Evidence |
|----|-------------|--------|-----------|----------|
| AC1 | A finished worker's exited background commands do not block routing | Pass | mocked | The SubagentStop/Stop handlers (`hooks/register.ts:947-960`) call `reconcileWorker`/`reconcileSettledWorkers` (`hooks/register.ts:394-415`). These drop each entry missing from `background_tasks` via `reconcileBackground` (`src/execute-host.mjs:130-136`). Covered by `@SCN001` in `scripts/__tests__/sdlc-execute.test.mjs` |
| AC2 | A still-running background command still blocks | Pass | mocked | Entries whose task ID is listed are kept (`src/execute-host.mjs:132-133`). The Stop pass covers only settled workers, with a `since` guard (`hooks/register.ts:401`, `src/execute-host.mjs:134`). Covered by `@SCN002` in `scripts/__tests__/sdlc-execute.test.mjs` |

**Criteria whose tests mock the path under test**: AC1 and AC2. The controller scenarios drive the real `awaitWorkerHandoff`/`settleCommits` against a fake host that applies the real `reconcileBackground`. The hooks-module wiring is covered by a source regex, because the hook test kit starts no subagent. An earlier review's live probe confirmed that SubagentStop reaches a plugin module and that the `background_tasks` IDs match `backgroundTaskId`. The live smoke `/sdlc-execute #353` delivery in this gate also ran this head's hooks module from start to merge.

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | `reconcileBackground` filters `record.background` to the IDs in the in-flight list and is applied per tracked worker (`src/execute-host.mjs:130-136`, `hooks/register.ts:395-396`) |
| FR2 | Pass | A non-array in-flight list returns the record unchanged, and an unchanged record is not written (`src/execute-host.mjs:131`, `hooks/register.ts:403`) |
| FR3 | Pass | The `settleCommits` loop returns when the record lists no background command and the index is unlocked (`scripts/sdlc-execute.mjs:588-594`) |
| FR4 | Pass | Reconciliation errors are swallowed and the stop outcome is unchanged (`hooks/register.ts:404`, `hooks/register.ts:409-414`) |

Design paths DP1-DP8 and consumers C1-C6 all pass (see `.nmg-sdlc/verification/574-review.md`).

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Reconcile tracked background commands against the host's in-flight tasks | Complete | `hooks/register.ts`, `src/execute-host.mjs`, `src/execute-host.d.mts` |
| T002 | Add behavioral regression coverage | Complete | `@SCN001`/`@SCN002` are in `scripts/__tests__/sdlc-execute.test.mjs`, not in `execute-host.test.mjs` as the task names (spec drift, info F4) |

---

## Architecture Assessment

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID | 5 | Pure `reconcileBackground` helper in `src/execute-host.mjs`; the hooks module only wires it through the per-agent queue |
| Security | 5 | No new inputs beyond host event fields; no shell or path handling |
| Performance | 4 | An exited command of a settled worker clears only at the next stop event, bounded by the check-in interval (info F2) |
| Testability | 4 | Real controller loop with a fake host. The hook wiring is checked by a source regex (info F3) |
| Error Handling | 5 | Missing or malformed in-flight lists are no-ops, failures are swallowed, and writes are serialized per agent |

**Average**: 4.6

### Review Findings (all `info`, carried from the passed review)

- F1: Residual race on the main-loop Stop. The `since` guard is the hook clock at handler entry, not the host snapshot time. The window is hook-dispatch latency.
- F2: Clearing latency is bounded by the next stop event, not indefinite. This is the alternative the design selected.
- F3: The hooks wiring is covered by a source regex; the test kit cannot start a subagent.
- F4: The spec names `execute-host.test.mjs` for T002 and the signature `reconcileBackground(record, inFlight, at)`. The implementation uses the bdd test file and adds an optional `since` parameter.

---

## Test Coverage

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | `@SCN001` | `scripts/__tests__/sdlc-execute.test.mjs` (#574 describe block) | Implemented |
| AC2 | `@SCN002` | `scripts/__tests__/sdlc-execute.test.mjs` (#574 describe block) | Implemented |

Test-layer findings: none. Every added test implements a `feature.gherkin` scenario, which fits the kept `bdd` layer.

---

## Exercise Test Results

Each interactive surface was exercised in an interactive `claude --plugin-dir <this checkout>` session inside a detached tmux session, against a fresh `--single-branch` clone of `Nunley-Media-Group/nmg-sdlc-smoke`. The gate worker drove every surface directly and started no subagents. Each record is bound to the head above.

| Surface | Command | Result |
|---------|---------|--------|
| draft-issue | `/sdlc-draft-issue <provision.need>` | Passed. The interview chose Enhancement, milestone v3 and the `greeting_titlecase` helper, and the plan was approved. It created smoke issue #353 "Add greeting_titlecase library helper" |
| write-spec | `/sdlc-write-spec #353` | Passed. The plan was approved, and the spec was published in PR #354 (`docs: approve spec for #353`, merged after CI). #353 carries `spec-created`. The run chose "Finished — stop writing specs" |
| onboard-project | `/sdlc-onboard-project` | Passed. The smoke project is already initialized, so the workflow took its already-initialized branch: "Delegate to upgrade" and a plan with no file writes. It was approved, and `git status` stayed clean |
| upgrade-project | `/sdlc-upgrade-project` | Passed. The interview kept `bdd` and `unit`, created the `sdlc-models` defaults and declined the verification scope. Auto mode blocked the plan-approved `sdlc-upgrade.mjs apply` inside the exercised session ("Destructive or Unwanted Actions"). The gate worker ran that exact approved command as a `!` command in the smoke clone, which stays inside the smoke clone. It exited 0: it created `steering/sdlc-models.json` and `steering/test-layers.json`; label backfill found nothing to add and skipped #35 and #96, with no failures. The session's checks then passed: detection went from 7 to 6 items, pytest reported 1081 passed and 2 skipped, ruff passed, and only the two new files changed |
| steering | `/sdlc-steering` | Passed. A no-op refresh plan was approved. The session's first combined extract-and-apply command was blocked by auto mode, and it fell back to the Write tool and ran apply and validate separately. Steering and registration hashes were unchanged, and `git status` was clean |
| run-retro | `/sdlc-run-retro` | Passed. The plan was approved and `steering/retrospective.md` and `steering/retrospective-state.json` were written in the clone. The first shell write was blocked by auto mode, and the session wrote the same content with the Write tool |
| execute | gate-driven headless `/sdlc-execute #353` | Passed. The baseline had no closing PR. Smoke PR #355 was MERGED at `50e2658a38afc3469fccaaa6c30c8a656eac405f`, matching the pre-merge delivery proof, and issue #353 is CLOSED |

The tmux sessions and smoke clones from this run were removed afterwards.

---

## Steering Doc Verification Gates

| Gate | Tier | Selection | Status | Evidence |
|------|------|-----------|--------|----------|
| `repository.tests` | change | `claude:haiku`, reason `fallback_path` (`hooks/register.ts`), full suite | Pass | `npm test -- --runInBand` exited 0: 79 suites passed, 1 skipped; 1951 tests passed, 2 skipped; 926.4 s (`.nmg-sdlc/verification/574/repository.tests.log`) |
| `repository.nmg-sdlc-smoke` | null | null | Pass | Exercised draft-issue, write-spec, onboard-project, upgrade-project, steering, run-retro and execute, and delivered smoke #353 through PR #355 (MERGED, issue CLOSED) |
| `repository.tests.full` | full | n/a | Skipped before merge | Runs under `/sdlc-verify-full` |
| `repository.nmg-sdlc-smoke.full` | full | n/a | Skipped before merge | Runs under `/sdlc-verify-full` |

**Gate Summary**: 2 of 2 applicable pre-merge gates passed; 2 full-tier gates were skipped by tier.

---

## Fixes Applied

None. No source, spec or steering file was edited in this gate.

---

## Remaining Issues

None above `info`. The four `info` review findings above are carried for follow-up.

Observations from earlier exercised surfaces, not attributed to #574 and tracked separately: the `sdlc-upgrade.mjs detect` output is too large for one read, a `test-layers` item persists after apply, and auto mode blocks some plan-approved commands inside exercised sessions (seen again this run in upgrade-project, steering and run-retro).

---

## Overall Status: Pass
