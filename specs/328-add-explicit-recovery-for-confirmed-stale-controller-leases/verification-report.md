# Verification Report: Add explicit recovery for confirmed stale controller leases

**Date**: 2026-08-31
**Issue**: #328
**Reviewer**: Codex
**Scope**: Implementation verification against approved spec

## Executive Summary

Issue #328 implements explicit, fail-closed stale controller lease recovery. Recovery is opt-in through `--recover-stale`; it requires the checkpoint and lease to identify the same run, an `ESRCH` PID probe, a successful Herdr agent listing with the exact controller pane absent, and unchanged lease bytes immediately before unlink. Ordinary exclusive acquisition, default rejection, worker ownership, and `--retain-worker` behavior remain unchanged.

The deterministic steering artifact is complete with both required validations passed. The full repository suite, focused recovery suites, inventory audit, plugin-surface validation, checkout-loaded command exercise, live consumer smoke, and diff hygiene all passed. No implementation findings required a code fix during this verification.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **4.7** |

### Implementation Status: Pass

**Total Issues**: 0 remaining

## Issue Scope

- Active issue: #328
- Spec: `specs/328-add-explicit-recovery-for-confirmed-stale-controller-leases`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3, FR4, FR5]; tasks [T001, T002, T003, T004, T005]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":328,"specPath":"specs/328-add-explicit-recovery-for-confirmed-stale-controller-leases","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5"],"tasks":["T001","T002","T003","T004","T005"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

- Delivery version artifacts: `VERSION` and `package.json` synchronization verified by the delivery controller; these generated release artifacts do not alter the issue's stale-lease recovery contract.
- Steering alignment: the change preserves the registered managed steering runtime and its `steering/manifest.json` verification gates; recovery remains inside the existing execute-controller boundary.

## Deterministic Steering Artifact and Ceiling

- Artifact: `.omp/sdlc/verification/328.json`
- Identity: head `04145b58e0b85d29ef6e124161a51038d59fc5fa`
- Spec hash: `sha256:b3a93e738cc534f3033123ba3d5d34a5d6aec158cca3b79713a853172d2e589e`
- Coverage: 2 declared, 2 recorded, complete; no missing, duplicate, or unknown results
- Ceiling: none
- Required results: `repository.tests` passed; `repository.nmg-sdlc-smoke` passed

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Reclaim a confirmed-dead same-run lease and continue normal startup with the exact stdout line. | Pass | `scripts/sdlc-controller-lease.mjs:76-130` requires same-run identity and both absence proofs; `scripts/sdlc-execute.mjs:1420-1445` reclaims immediately before acquisition and appends `Reclaimed stale controller lease.`; focused integration test passed. |
| AC2 | Preserve live, unknown, malformed, unreadable, and foreign leases without protected mutations. | Pass | Fail-closed branches at `scripts/sdlc-controller-lease.mjs:84-128`; table-driven helper tests at `scripts/__tests__/sdlc-controller-lease.test.mjs:117-165`; execute tests preserve lease, run, and handoff bytes and start no workers. |
| AC3 | Protect a changed lease before unlink and preserve the latest bytes. | Pass | Exact snapshot comparison at `scripts/sdlc-controller-lease.mjs:122-128`; helper and execute replacement-byte tests at `scripts/__tests__/sdlc-controller-lease.test.mjs:167-188` and `scripts/__tests__/sdlc-execute.test.mjs:1469-1504`. |
| AC4 | Preserve default lease rejection and independent `--retain-worker` semantics. | Pass | Recovery is guarded solely by `parsedArgs.recoverStale` at `scripts/sdlc-execute.mjs:1420-1432`; cleanup still consumes only `parsedArgs.retainWorker`; default no-probe and existing retention tests passed. |

## Regression Obligations

| Contract | Status | Evidence |
|----------|--------|----------|
| #291 competing-controller exclusivity | Pass | Existing `wx` acquisition remains unchanged and runs after optional recovery; full suite passed. |
| #291 durable worker ownership | Pass | Worker ownership and retained-worker discovery were unchanged; full suite passed. |
| #291 default cleanup and explicit retention | Pass | Cleanup still receives only `parsedArgs.retainWorker`; focused and full suites passed. |

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Parse `--recover-stale` beside existing issue tokens. | Complete | Accepted once, combined with `--retain-worker`, omitted when absent, and reflected in the exact usage string. |
| T002 | Reclaim only a confirmed-stale same-run lease. | Complete | PID and pane absence are both required; malformed, foreign, unknown, live, and changed leases remain held. |
| T003 | Wire reclaim immediately before acquire. | Complete | Recovery follows preflight and controller run-id resolution, then ordinary acquisition. |
| T004 | Carry the flag through execute workflow text. | Complete | `WORKFLOW.md`, `selection.md`, and generated `commands/sdlc-execute.md` accept and forward the flag. |
| T005 | Cover AC1-AC4 in controller tests. | Complete | Focused helper/controller suites passed 212/212 tests. |

## Architecture Assessment

| Area | Score (1-5) | Findings |
|------|-------------|----------|
| SOLID Principles | 4 | Recovery stays in the focused lease module; process and Herdr observations are injected. No schema or general-purpose abstraction was added. |
| Security | 5 | Explicit opt-in, same-run binding, two independent absence proofs, fail-closed parsing, exact-pane matching, and unchanged-byte comparison prevent silent recovery from uncertain ownership. |
| Performance | 4 | The optional startup path performs one PID probe, one bounded agent listing, and two small file reads. Synchronous file operations are acceptable in this one-shot controller path. |
| Testability | 5 | Injectable `processApi` and `listAgents` provide deterministic coverage for live, absent, unknown, malformed, foreign, and changed-byte cases. |
| Error Handling | 5 | Every uncertain recovery observation maps to stable `controller_lease_held`; recovery never restores bytes, closes panes, kills processes, or retries. |

### SOLID Detail

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Lease validation, recovery observation, acquisition, and release remain within the lease module. |
| Open/Closed | 4 | Optional recovery extends startup without changing the lease schema or ordinary acquisition contract. |
| Liskov Substitution | 4 | Injected process and agent-list collaborators use small structural contracts suitable for test doubles. |
| Interface Segregation | 5 | Recovery depends only on `kill(pid, 0)` and `listAgents()`. |
| Dependency Inversion | 4 | External runtime observations are injected; bounded filesystem primitives remain module-local. |

## Test Coverage

| Acceptance Criterion | Has Scenario | Has Automated Coverage | Passes |
|---------------------|--------------|------------------------|--------|
| AC1 | Yes, SCN001 | Yes | Yes |
| AC2 | Yes, SCN002 | Yes | Yes |
| AC3 | Yes, SCN003 | Yes | Yes |
| AC4 | Yes, SCN004 | Yes | Yes |

- Focused recovery suites: 2 suites passed; 212 tests passed.
- Full repository suite: 49 suites passed, 1 skipped; 744 tests passed, 2 skipped.
- Skill inventory audit: clean, 43 items mapped.
- Plugin surface validation: passed.
- Git diff hygiene: passed.

## Exercise Test Results

| Field | Value |
|-------|-------|
| Skill Exercised | `/sdlc-execute --recover-stale #328` |
| Test Project | Disposable `/tmp/nmg-sdlc-exercise-328.*` repository; removed after capture |
| Required installed-helper method | `node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/exercise-omp.mjs" --cwd <project> -- /sdlc-execute --recover-stale #328` |
| Installed-helper result | Exit 2 with the old usage `Usage: /sdlc-execute [--retain-worker] [#N ...]`; inspection shows that helper resolves `REPO_ROOT` to its installed package, so it did not load this checkout. This is stale installed-package evidence, not evidence against the candidate tree. |
| Checkout-loaded method | `node scripts/exercise-omp.mjs --cwd <project> -- /sdlc-execute --recover-stale #328` |
| Checkout-loaded result | Exit 0 from the harness with assistant output `{"ok":false,"reasonCode":"issues_unreadable"}`. The changed command accepted and forwarded `--recover-stale`, passed argument parsing, and stopped at read-only issue discovery in the disposable repository. |

The checkout-loaded exercise proves command expansion and argument forwarding for the candidate extension. Live Herdr lease reclamation requires a controller session and is covered by deterministic helper/controller tests. Neither exercise created a worker, checkpoint, handoff, branch, verification artifact, or delivery mutation in the disposable repository.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` | Pass | Deterministic artifact: `npm test -- --runInBand` exited 0; 49 suites passed, 1 skipped; 744 tests passed, 2 skipped. |
| `repository.nmg-sdlc-smoke` | Pass | Live checkout-loaded `/sdlc-status --json` against `Nunley-Media-Group/nmg-sdlc-smoke` returned `nextAction.command` `/sdlc-draft-issue`. |
| Focused recovery tests | Pass | `npm test -- --runInBand __tests__/sdlc-controller-lease.test.mjs __tests__/sdlc-execute.test.mjs`; 2 suites and 212 tests passed. |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`; clean, 43 items mapped. |
| Plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository`; passed. |
| Git hygiene | Pass | `git diff --check main...HEAD`; no output. |

**Gate Summary**: 6/6 passed, 0 failed, 0 incomplete.

## Fixes Applied

None during this verification.

## Remaining Issues

None.

## Positive Observations

- Recovery cannot occur silently or for a foreign run.
- PID and exact-pane absence evidence are independently required; unknown evidence is held.
- Concurrent replacement bytes are not restored over.
- Existing lease acquisition, schema, worker ownership, and retained-worker cleanup remain unchanged.
- Tests cover both the focused lease helper and full execute-controller behavior.

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-controller-lease.mjs` | 0 | Focused fail-closed recovery helper. |
| `scripts/sdlc-execute.mjs` | 0 | Flag parsing and pre-acquisition wiring. |
| `scripts/__tests__/sdlc-controller-lease.test.mjs` | 0 | Absence, held, malformed, foreign, and changed-byte coverage. |
| `scripts/__tests__/sdlc-execute.test.mjs` | 0 | AC1-AC4 integration and regression coverage. |
| `workflows/execute/WORKFLOW.md` | 0 | Updated argument and forwarding contract. |
| `workflows/execute/references/selection.md` | 0 | Optional flag stripping and selected-run forwarding. |
| `commands/sdlc-execute.md` | 0 | Generated command synchronized from workflow content. |

## Recommendation

**Ready for delivery**

Every approved delivery criterion and required local gate passes for the candidate checkout. The deterministic steering artifact has complete passing coverage and no ceiling.
