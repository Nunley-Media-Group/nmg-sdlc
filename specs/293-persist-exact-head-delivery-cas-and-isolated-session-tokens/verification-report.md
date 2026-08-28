# Verification Report: Persist exact-head delivery CAS and isolated session tokens

**Date**: 2026-08-28
**Issue**: #293
**Reviewer**: Codex
**Scope**: Implementation verification against the approved specification

---

## Executive Summary

The implementation satisfies the approved delivery contract. Delivery requires exactly one controller or isolated-session scope, persists the selected pull request and expected head through checkpoint CAS, rejects unexpected identity with stable reconciliation evidence, rebinds only the controller-owned post-version head, and restores a clean next-issue checkout before retained-worker matching.

Verification identified a real session-namespace symlink-boundary defect, but its verifier-owned implementation edit was not a valid deliverable and ended as `verification_publish_failed`. Implementation remediation intentionally adopted and refined the finding: resumed isolated sessions now require a regular non-symlink `run.json` and a real non-symlink `handoffs` directory before reading state or invoking Git or GitHub commands. The specification now owns AC7, FR8, T007, and SCN007 for this invariant. Overall status is **Pass** after the remediation checks recorded below.

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

**Total implementation findings**: 1 resolved  
**Verification blockers**: 0

---

## Deterministic Steering Artifact and Ceiling

Command:

```text
node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/sdlc-verify-steering.mjs" --project . --issue 293 --spec specs/293-persist-exact-head-delivery-cas-and-isolated-session-tokens --base main --controller-run-id d379f511-611c-4962-84a9-4cccb2ff8ee5
```

The pre-remediation steering execution exited 0 with `ok: true`, `ceiling: null`, issue 293, and complete coverage: 2 declared, 2 recorded, no missing, duplicate, or unknown results. Its dirty-diff binding is superseded by this implementation remediation and is retained only as prior verification evidence; the focused delivery suite, current-spec validator, full repository suite, and diff hygiene were rerun against the committed implementation remediation.

## Issue Scope

- Active issue: #293
- Spec: `specs/293-persist-exact-head-delivery-cas-and-isolated-session-tokens`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8]; tasks [T001, T002, T003, T004, T005, T006, T007]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007]
- Regression: issue #291 AC [AC1, AC2]; FR [FR2, FR3]; scenarios [SCN001, SCN002]

<!-- nmg-sdlc-issue-scope: {"issueNumber":293,"specPath":"specs/293-persist-exact-head-delivery-cas-and-isolated-session-tokens","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8"],"tasks":["T001","T002","T003","T004","T005","T006","T007"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007"]},"regression":{"acceptanceCriteria":["AC1","AC2"],"functionalRequirements":["FR2","FR3"],"scenarios":["SCN001","SCN002"]}} -->

## Delivery Validation

- Local verification: Complete; deterministic steering coverage is 2/2 with no ceiling
- PR evidence: Not required

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Exact PR and expected head remain CAS-bound through snapshots and merge | Pass | `scripts/sdlc-deliver.mjs:246-265`, `305-343`, `1395-1401`; `scripts/__tests__/sdlc-deliver.test.mjs:571-593`, `888-909` |
| AC2 | Unexpected identity records one stable reconciliation failure and blocks later mutation | Pass | `scripts/sdlc-deliver.mjs:276-296`, `1100-1102`; `scripts/__tests__/sdlc-deliver.test.mjs:855-886` |
| AC3 | Standalone delivery uses an isolated UUID session and preserves canonical bytes | Pass | `scripts/sdlc-deliver.mjs:138-201`, `204-258`; `scripts/__tests__/sdlc-deliver.test.mjs:412-552`; disposable exercise produced only `.omp/sdlc/sessions/<token>/...` state and handoff |
| AC4 | Matching scoped delivery still proves exact merge, closure, cleanup, and passed handoff | Pass | `scripts/sdlc-deliver.mjs:1181-1225`, `1380-1412`; `scripts/__tests__/sdlc-deliver.test.mjs:888-909` |
| AC5 | Existing PR is re-read and rebound only to the clean controller-owned version head | Pass | `scripts/sdlc-deliver.mjs:305-343`, `736-741`, `1262-1275`; `scripts/__tests__/sdlc-deliver.test.mjs:571-619` |
| AC6 | Execute restores the active branch before retained-worker ownership matching | Pass | `scripts/sdlc-execute.mjs:1161-1179`, `1854-1887`; `scripts/__tests__/sdlc-execute.test.mjs:3363-3499` |
| AC7 | Isolated session state and handoff leaf artifacts cannot cross symlink boundaries | Pass | `scripts/sdlc-deliver.mjs:204-215`, `224-239`; `scripts/__tests__/sdlc-deliver.test.mjs:513-555` |

## Regression Obligations

| Contract | Status | Evidence |
|----------|--------|----------|
| #291 AC1 / FR2 / SCN001: unscoped phase helpers cannot mutate a leased canonical project | Pass | `scripts/sdlc-deliver.mjs:211-214`; `scripts/__tests__/sdlc-deliver.test.mjs:412-452` proves rejection before command or protected-artifact changes |
| #291 AC2 / FR3 / SCN002: retained-worker reuse requires exact ownership | Pass | Branch restoration precedes the unchanged `matchingWorkerOwnership` gate at `scripts/sdlc-execute.mjs:1854-1887`; exact-live and restoration-failure regressions are at `scripts/__tests__/sdlc-execute.test.mjs:3363-3499` |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add scoped delivery namespaces and session initialization | Complete | Exactly one scope is required; isolated run state and handoffs use the UUID namespace; symlink boundaries fail closed |
| T002 | Persist expected PR/head and reconciliation through CAS | Complete | Expected identity, authorized transitions, reconciliation, and complete status use revision-checked checkpoint writes |
| T003 | Update open-pr scope propagation and public docs | Complete | Workflow and packaged command retain one scope through every rerun; README documents isolated delivery and handoff-only completion |
| T004 | Add exact-head, isolation, and terminal-proof regressions | Complete | All seven scenarios map to named Jest cases; full and focused suites pass |
| T005 | Rebind an existing PR after the controller-owned version push | Complete | Persisted PR is re-read after push; stale H1 is never merged; foreign drift reconciles |
| T006 | Restore the next issue branch before retained-worker matching | Complete | Clean restoration occurs before collision/ownership checks; dirty restoration failures retain the worker and fail closed |
| T007 | Harden isolated session leaf artifact boundaries | Complete | Both unsafe leaf types fail before state use, command invocation, CAS writes, or redirected handoffs |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Namespace resolution, CAS persistence, reconciliation, scoped snapshots, session initialization, and branch restoration are separate helpers; `sdlc-deliver.mjs` remains necessarily large because it owns the complete terminal delivery transaction |
| Open/Closed | 4 | Explicit-path `readRunAt`/`writeRunAt` reuse the existing checkpoint CAS rather than introducing a second persistence implementation |
| Liskov Substitution | 5 | Existing canonical `readRun`/`writeRun` signatures and behavior remain intact |
| Interface Segregation | 4 | Delivery helpers receive narrow context, namespace, snapshot, and branch inputs; command adapters remain injectable |
| Dependency Inversion | 5 | Filesystem, command execution, time, sleep, and tokens are injectable in behavioral tests |

**SOLID score**: 4.4/5

### Layer Separation

Delivery identity and lifecycle policy remain in `scripts/sdlc-deliver.mjs`; checkpoint CAS and execute checkout sequencing remain in `scripts/sdlc-execute.mjs`; `workflows/open-pr/WORKFLOW.md` owns the worker loop; `commands/sdlc-open-pr.md` is the packaged synchronized surface; README owns user-facing behavior.

### Dependency Flow

A verified controller lease or isolated token selects one namespace before delivery commands. Namespace state supplies the persisted PR/head to every snapshot and mutation. Exact terminal GitHub evidence feeds CAS completion, then handoff writing and cleanup. Execute restores local checkout state before applying retained-worker ownership identity.

## Security Assessment

**Score**: 5/5

- CLI parsing requires exactly one controller run id or lowercase UUID session token.
- Session paths are fixed segments beneath `.omp/sdlc/sessions/`; directory, run-file, and handoff-directory symlinks fail before command execution.
- Git and GitHub calls use explicit argument arrays; issue, PR, branch, and head values are never evaluated as shell source.
- Controller scope validates the active lease, project real path, run id, issue, step, and issue list.
- Unexpected remote identity fails closed and cannot select, create, ready, push, or merge another PR on reconciliation reruns.

## Performance Assessment

**Score**: 4/5

- Namespace inspection and CAS operations are bounded to fixed paths and one small JSON checkpoint.
- Existing PR identity is fetched by persisted number rather than repeatedly scanning all branch PRs after binding.
- Polling performs bounded work per snapshot and intentionally has no arbitrary wall-clock deadline while the process remains observable.
- Synchronous filesystem and child-process operations are acceptable for this deterministic single-controller CLI, though `sdlc-deliver.mjs` remains a serial orchestration path by design.

## Testability Assessment

**Score**: 5/5

- Command execution, filesystem, clock, sleep, and UUID token are injectable.
- Every approved Gherkin scenario maps to named Jest behavior coverage.
- Tests assert protected bytes, CAS state, exact command arguments, mutation absence, stable reruns, checkout behavior, and terminal handoffs.
- The added symlink regression exercises both session state and handoff boundaries and proves no git/GitHub command runs after rejection.

## Error Handling Assessment

**Score**: 5/5

- Invalid invocation exits 2 without a handoff; scope mismatch exits 1 without mutation.
- Reconciliation has the stable machine reason `delivery_reconciliation_required` plus expected and observed identity.
- Dirty or foreign checkout restoration fails closed without overwriting work.
- A passed deliver handoff is emitted only after exact persisted-head merge and issue closure proof.
- Exit 0 is explicitly non-authoritative without the validated namespace-specific handoff marker.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Scenario | Has Jest Case | Passes |
|---------------------|----------|---------------|--------|
| AC1 | SCN001 | Yes | Yes |
| AC2 | SCN002 | Yes | Yes |
| AC3 | SCN003 | Yes | Yes |
| AC4 | SCN004 | Yes | Yes |
| AC5 | SCN005 | Yes | Yes |
| AC6 | SCN006 | Yes | Yes |
| AC7 | SCN007 | Yes | Yes |

### Coverage Summary

- Feature files: 1 active feature with 7 regression scenarios
- Step definitions: Jest behavior cases mapped to each scenario contract
- Focused delivery execution: 1 suite and 48 tests passed, including both isolated-session symlink boundary cases
- Full repository execution: 49 suites and 696 tests passed; 1 suite and 2 tests skipped
- Current-spec validation: 54 genuine issue specs, 16 required archive entries, 16 rewrite capabilities, 16 active workflow mappings, and 1 deprecated stub passed

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | Standalone `/sdlc-open-pr 293` |
| **Test Project** | `/tmp/nmg-sdlc-293-exercise.Dhrgvd` (removed after capture) |
| **Exercise Method** | `node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/exercise-omp.mjs" --cwd /tmp/nmg-sdlc-293-exercise.Dhrgvd -- /sdlc-open-pr 293` |
| **Interactive gate handling** | N/A (automated worker) |
| **Termination** | Normal controller-owned failed handoff; no wall-clock deadline |

### Captured Output Summary

The harness loaded the changed open-pr surface, initialized isolated session `dd4af34b-d95b-4f78-8df5-61362c7e8b16`, and returned the exact session handoff marker `.omp/sdlc/sessions/dd4af34b-d95b-4f78-8df5-61362c7e8b16/handoffs/293-deliver.json`. Delivery then failed closed with `reasonCode: delivery_failed` because the deliberately minimal disposable repository omitted `specs/`. The failed handoff was preserved, no PR was opened, canonical `.omp/sdlc/run.json` was not created, and the disposable project was removed.

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC3 | Standalone open-pr initializes and uses one isolated namespace | Pass | Actual harness output and handoff path used the generated UUID session namespace |
| AC1, AC2, AC4, AC5 | Remote PR/head lifecycle | Pass through deterministic fixtures | A disposable no-remote exercise cannot safely perform terminal GitHub mutation; exact PR/head behavior is covered by the passing delivery controller suite |
| AC6 | Multi-issue retained worker resume | Pass through deterministic fixtures | Requires Herdr controller state; covered by the passing execute controller regressions |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Mandatory steering runner | Prior pass | Pre-remediation execution exited 0 with `ok: true`, `ceiling: null`, and complete 2/2 provider coverage; its dirty-diff binding is superseded |
| `repository.tests` | Pass | Remediation rerun: 49 suites and 696 tests passed; 1 suite and 2 tests skipped |
| `repository.nmg-sdlc-smoke` | Prior pass | Pre-remediation artifact records `effectiveStatus: passed`; summary `nmg-sdlc-smoke status next /sdlc-draft-issue` |
| Focused delivery suite | Pass | `npm test -- --runInBand __tests__/sdlc-deliver.test.mjs`: 48/48 tests passed |
| Current specs | Pass | `node scripts/verify-current-specs.mjs` passed 54 genuine issue specs and all reported mappings |
| Plugin surface | Prior pass | `node scripts/verify-plugin-surface.mjs --root . --label repository` exited 0 |
| Skill inventory | Prior pass | `node scripts/skill-inventory-audit.mjs --check`: 43 items mapped |
| Diff hygiene | Pass | `git diff --check` exited 0 with no output |
| Workflow bundle validator | Not applicable | `skill://skill-creator` was resolved and read; its validator requires `SKILL.md`, while `workflows/open-pr` is an OMP `WORKFLOW.md` bundle |

**Gate Summary**: 8 passed, 0 failed, 0 incomplete, 1 not applicable

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| High | Security | `scripts/sdlc-deliver.mjs:204-215`, `224-239`; `scripts/__tests__/sdlc-deliver.test.mjs:513-555` | Resumed isolated sessions checked only directory segments; a symlinked session `run.json` could be read outside the namespace and a symlinked `handoffs` directory could redirect the terminal handoff | Implementation remediation requires a regular non-symlink `run.json` and real non-symlink `handoffs` directory before reading state or invoking commands; both boundary regressions prove no command or redirected write | `implementation remediation` |

## Remaining Issues

No unresolved implementation, architecture, security, performance, testability, or error-handling findings.

## Positive Observations

- Delivery state is monotonic and CAS-protected instead of reconstructed from mutable live GitHub state.
- Reconciliation is explicit, durable, and idempotent; it does not silently retry remote mutation.
- Standalone delivery preserves canonical execute state through a fixed UUID namespace.
- Exact merge and closure proof remain the only path to a passed handoff.
- Multi-issue branch restoration reuses the established dirty-work preservation contract.
- Regression tests assert absence of forbidden mutations, not only expected success output.

## Recommendations Summary

### Before PR (Must)

- [x] No unresolved required items.

### Short Term (Should)

- [x] Preserve the new symlink-boundary regression with the delivery namespace contract.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-deliver.mjs` | 1 resolved | Scope parsing, isolated namespace leaf security, CAS identity, reconciliation, version-head rebinding, exact merge proof |
| `scripts/sdlc-execute.mjs` | 0 | Explicit-path CAS and branch restoration ordering |
| `scripts/__tests__/sdlc-deliver.test.mjs` | 0 | AC1-AC5, AC7, and symlink-boundary behavior |
| `scripts/__tests__/sdlc-execute.test.mjs` | 0 | AC6 clean, dirty, retained-worker, and delivered-branch resume behavior |
| `scripts/__tests__/open-pr-delivery-contract.test.mjs` | 0 | Scope retention and handoff-only completion contract |
| `workflows/open-pr/WORKFLOW.md` | 0 | Execute/session scope selection and reuse across every rerun |
| `commands/sdlc-open-pr.md` | 0 | Packaged command synchronized with workflow behavior |
| `README.md` | 0 | Public isolated-session and exact-head completion behavior |
| `CHANGELOG.md` | 0 | Unreleased issue behavior documented |

## Recommendation

**Pass**

The implementation remediation, updated specification, prior deterministic steering evidence, and rerun executable checks satisfy issue #293 with no remaining blocker. The security fix is implementation-owned; the verifier's failed publication is not treated as delivered mutation.
