# Verification Report: Add explicit recovery for confirmed stale controller leases

**Date**: 2026-08-31
**Issue**: #328
**Reviewer**: Codex
**Scope**: Implementation verification against approved spec

## Executive Summary

Issue #328 implements explicit, fail-closed stale controller lease recovery. The lease helper requires same-run identity, a demonstrably absent PID, a successful Herdr listing with the exact pane absent, and unchanged lease bytes before unlink. Execute invokes recovery only for `--recover-stale`, immediately before ordinary exclusive acquisition. Default and `--retain-worker` behavior remain independent.

Remediation synchronized the generated `commands/sdlc-execute.md` from the execute workflow and replaced host-absolute controller operands across the active execute prompt surfaces with the canonical portable plugin-root form. Focused recovery and command synchronization tests, the full repository suite, required audits, the changed-command exercise, and the live consumer smoke all pass.

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

- Local verification: Complete
- PR evidence: Not required

## Prior Deterministic Steering Artifact

- Artifact: `.omp/sdlc/verification/328.json`
- Identity: head `8a84acf15f97f78c5b43613dbb9b4bff5c8c5916`; spec hash `sha256:b3a93e738cc534f3033123ba3d5d34a5d6aec158cca3b79713a853172d2e589e`
- Prior result: `repository.tests` failed and `repository.nmg-sdlc-smoke` passed before remediation.
- Current status: superseded by the passing remediation evidence below. The execute controller owns regeneration of the deterministic verification artifact and handoff.

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Reclaim a confirmed-dead same-run lease and continue normal startup with the exact stdout line. | Pass | Runtime implementation and focused tests pass at `scripts/sdlc-controller-lease.mjs:76-130` and `scripts/sdlc-execute.mjs:1416-1445`; the generated `/sdlc-execute` command is synchronized and the repository gate passes. |
| AC2 | Preserve live, unknown, malformed, unreadable, and foreign leases without protected mutations. | Pass | `scripts/sdlc-controller-lease.mjs:84-128`; table-driven module tests at `scripts/__tests__/sdlc-controller-lease.test.mjs:117-165`; execute controller held-path tests passed. |
| AC3 | Fail closed when observed lease bytes change before unlink. | Pass | Exact byte re-read at `scripts/sdlc-controller-lease.mjs:122-128`; replacement preservation test at `scripts/__tests__/sdlc-controller-lease.test.mjs:167-188`. |
| AC4 | Preserve default lease rejection and independent `--retain-worker` semantics. | Pass | Recovery call is guarded by `parsedArgs.recoverStale` at `scripts/sdlc-execute.mjs:1420-1432`; existing cleanup continues to consume only `parsedArgs.retainWorker`; focused controller tests passed. |

## Regression Obligations

| Contract | Status | Evidence |
|----------|--------|----------|
| #291 AC1 / FR1-FR2: competing writers and standalone helpers fail closed. | Pass | Existing exclusive `wx` acquisition remains unchanged and follows optional recovery; full repository suite passed. |
| #291 AC2 / FR3: retained workers require exact durable ownership. | Pass | Worker ownership and retained-worker discovery code were unchanged; full repository suite passed. |
| #291 AC3 / FR4: controller-owned panes close by default and only `--retain-worker` retains them. | Pass | Cleanup still receives only `parsedArgs.retainWorker`; focused and full suites passed. |

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Parse `--recover-stale` beside existing issue tokens. | Complete | Flag is accepted once, omitted when absent, and usage text is synchronized. |
| T002 | Reclaim only a confirmed-stale same-run lease. | Complete | PID and pane observations are both required; foreign, malformed, unknown, and changed leases remain held. |
| T003 | Wire reclaim immediately before acquire. | Complete | Recovery follows preflight and run-id resolution, then ordinary acquisition. |
| T004 | Carry the flag through execute workflow text. | Complete | `WORKFLOW.md`, selection reference, and generated command carry the flag and canonical controller operand. |
| T005 | Cover AC1-AC4 in controller tests. | Complete | Relevant focused suites passed 212/212 tests. |

## Architecture Assessment

| Area | Score (1-5) | Findings |
|------|-------------|----------|
| SOLID Principles | 4 | Recovery remains in the focused lease module; process and Herdr listing dependencies are injected. No new abstraction or schema was added. |
| Security | 5 | Explicit opt-in, same-run binding, two independent absence proofs, exact-pane comparison, fail-closed parsing, and unchanged-byte check prevent silent or uncertain lease theft. |
| Performance | 4 | Recovery is bounded to one PID probe, one Herdr listing, and two small lease reads. Synchronous filesystem operations are acceptable on this one-shot controller startup path. |
| Testability | 5 | Injectable `processApi` and `listAgents` allow deterministic live, absent, unknown, malformed, and race-path coverage. |
| Error Handling | 5 | Every uncertain observation maps to stable `controller_lease_held`; no snapshot restoration, pane closure, or recovery retry occurs. |

### SOLID Detail

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Lease parsing, observation, comparison, and release stay in the controller lease module. |
| Open/Closed | 4 | Optional recovery extends startup without changing the lease schema or ordinary acquisition contract. |
| Liskov Substitution | 4 | Injected process and agent-list collaborators use small structural contracts suitable for test doubles. |
| Interface Segregation | 5 | Recovery depends only on `kill(pid, 0)` and `listAgents()`. |
| Dependency Inversion | 4 | External observations are injected; bounded filesystem primitives remain module-local. |

## Test Coverage

| Acceptance Criterion | Has Scenario | Has Automated Coverage | Passes |
|---------------------|--------------|------------------------|--------|
| AC1 | Yes, SCN001 | Yes | Yes |
| AC2 | Yes, SCN002 | Yes | Yes |
| AC3 | Yes, SCN003 | Yes | Yes |
| AC4 | Yes, SCN004 | Yes | Yes |

- Focused command and recovery suites: 3 suites passed; 217 tests passed.
- Full repository suite: 49 suites passed, 1 skipped; 744 tests passed, 2 skipped.
- Skill inventory audit: clean, 43 items mapped.
- Plugin surface validation: passed.
- Git whitespace check: passed.
- Skill-creator contract was read. Its generic validator expects a `SKILL.md`; `workflows/execute` is a project `WORKFLOW.md` bundle, so repository command synchronization, inventory, plugin-surface, focused, full-suite, and exercise checks are authoritative.

## Exercise Test Results

| Field | Value |
|-------|-------|
| Skill Exercised | `/sdlc-execute --recover-stale #328` |
| Test Project | Disposable `/tmp/nmg-sdlc-exercise-328.*` repository, removed after capture |
| Checkout-loaded method | `node scripts/exercise-omp.mjs --cwd <project> -- /sdlc-execute --recover-stale #328` |
| Checkout-loaded result | The command accepted `--recover-stale`, advanced through command dispatch, and stopped at read-only issue-label lookup with `Unable to read labels for #328`; no delivery mutation occurred. |

The disposable exercise proves the changed checkout's command expansion, portable controller-path materialization, and argument forwarding. Herdr lease reclamation itself requires a live Herdr controller context and is covered deterministically by the focused controller tests; the exercise intentionally did not create workers, branches, handoffs, verification, or delivery artifacts.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` | Pass | `cd scripts && npm test -- --runInBand` — 49 suites passed, 1 skipped; 744 tests passed, 2 skipped. |
| `repository.nmg-sdlc-smoke` | Pass | Live checkout-loaded `/sdlc-status --json` against `Nunley-Media-Group/nmg-sdlc-smoke` returned `nextAction.command` `/sdlc-draft-issue`. |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check` — clean, 43 items mapped. |
| Plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository` — passed. |
| Git hygiene | Pass | `git diff --check` produced no output. |

**Gate Summary**: 5/5 passed, 0 failed, 0 incomplete.

## Fixes Applied

- Regenerated `commands/sdlc-execute.md` through `renderAutomatedCommandMarkdown(...)`, synchronizing `--recover-stale` from `workflows/execute/WORKFLOW.md` and `workflows/execute/references/selection.md`.
- Replaced host-absolute execute-controller operands in `workflows/execute/WORKFLOW.md` and `workflows/execute/references/selection.md` with the canonical portable plugin-root operand; regeneration carried the same form into `commands/sdlc-execute.md`.

## Remaining Issues

None.

## Positive Observations

- Recovery is explicit and cannot silently weaken the existing exclusive lease.
- PID and pane evidence are independently required; unknown evidence is held.
- The observed lease is never restored over a concurrent replacement.
- Existing acquisition, lease schema, worker ownership, and retained-worker cleanup remain unchanged.
- Tests cover both the helper boundary and execute integration.

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-controller-lease.mjs` | 0 | Focused fail-closed recovery helper. |
| `scripts/sdlc-execute.mjs` | 0 | Flag parsing and pre-acquisition wiring. |
| `scripts/__tests__/sdlc-controller-lease.test.mjs` | 0 | Absence, held, malformed, foreign, and changed-byte coverage. |
| `scripts/__tests__/sdlc-execute.test.mjs` | 0 | AC1-AC4 integration and regression coverage. |
| `workflows/execute/WORKFLOW.md` | 0 | Updated argument and forwarding contract. |
| `workflows/execute/references/selection.md` | 0 | Optional flag stripping and selected-run forwarding. |
| `commands/sdlc-execute.md` | 0 | Generated command synchronized from the workflow and portable controller operand. |

## Recommendation

**Ready for controller reverification**

The repository-gate defects are repaired and every required local check passes. Resume the execute controller's verification step so it can regenerate the deterministic verification artifact and handoff before delivery.
