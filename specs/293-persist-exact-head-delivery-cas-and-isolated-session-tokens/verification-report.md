# Verification Report: Persist exact-head delivery CAS and isolated session tokens

**Date**: 2026-08-28
**Issue**: #293
**Reviewer**: Codex
**Scope**: Implementation verification against the approved specification

---

## Executive Summary

The implementation satisfies the approved delivery contract. Delivery requires exactly one controller or isolated-session scope, persists the selected pull request and expected head through checkpoint CAS, rejects unexpected identity with stable reconciliation evidence, rebinds only the controller-owned post-version head, restores a clean next-issue checkout before retained-worker matching, and persists cancellation from the latest checkpoint revision before releasing the lease.

Verification identified a real session-namespace symlink-boundary defect, but its verifier-owned implementation edit was not a valid deliverable and ended as `verification_publish_failed`. Implementation remediation intentionally adopted and refined the finding: resumed isolated sessions now require a regular non-symlink `run.json` and a real non-symlink `handoffs` directory before reading state or invoking Git or GitHub commands. A subsequent live cancellation exposed a subordinate-writer race: delivery advanced the checkpoint while execute waited, then cleanup suppressed `stale_revision` and released the lease with stale worker ownership. The amended specification owns AC7–AC8, FR8–FR9, T007 and T009, and SCN007–SCN008 for these invariants. Overall status is **Pass** after the remediation checks recorded below.

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

The current steering execution exited 0 with `ok: true`, `ceiling: null`, issue 293, and complete coverage: 2 declared, 2 recorded, no missing, duplicate, or unknown results. Artifact `.omp/sdlc/verification/293.json` binds the pass to clean head `7825b85b383c2a69c3c71d4cecc7ad1a458e0935`; both required providers passed.

## Managed Steering Runtime Alignment

Issue #293 aligns with the registered managed steering runtime in `steering/manifest.json`. The manifest registers the managed product, technical, structure, and verification modules; supplies `project.tech` to `worker:deliver`; and requires both `repository.tests` and `repository.nmg-sdlc-smoke`. This change preserves those managed files and follows their contracts rather than creating a parallel convention.

The delivery implementation specifically follows `steering/snippets/project-tech.md`: open-pr owns exact-head delivery through merge and closure; `VERSION` is the version source; `package.json` is the OMP manifest mirror; delivery synchronizes both release artifacts; Git and GitHub commands use explicit argument arrays; and namespace boundaries fail closed on symlinks. The deterministic steering run recorded above executed both registered required providers successfully, so no managed steering runtime change is required.

### Release Metadata Behavior and Executed Evidence

| Changed path | Path-specific behavior | Executed verification |
|--------------|------------------------|-----------------------|
| `VERSION` | Remains the steering-defined version source and publishes patch release `3.18.7` for issue #293 | `node --input-type=module --eval "..."` read the file and reported `VERSION=3.18.7`; exit 0 |
| `package.json` | Preserves the OMP plugin manifest and mirrors `VERSION` through `"version": "3.18.7"` | The same Node command parsed the JSON, compared `manifest.version` with `VERSION`, and reported `package.json.version=3.18.7 synchronized`; exit 0 |

The executed comparison command was:

```text
node --input-type=module --eval "import fs from 'node:fs'; const version=fs.readFileSync('VERSION','utf8').trim(); const manifest=JSON.parse(fs.readFileSync('package.json','utf8')); if (version !== manifest.version) { console.error('version mismatch'); process.exit(1); } console.log('VERSION=' + version + ' package.json.version=' + manifest.version + ' synchronized');"
```

Observed output:

```text
VERSION=3.18.7 package.json.version=3.18.7 synchronized
```

## Issue Scope

- Active issue: #293
- Spec: `specs/293-persist-exact-head-delivery-cas-and-isolated-session-tokens`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9]; tasks [T001, T002, T003, T004, T005, T006, T007, T008, T009]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008]
- Regression: issue #291 AC [AC1, AC2]; FR [FR2, FR3]; scenarios [SCN001, SCN002]

<!-- nmg-sdlc-issue-scope: {"issueNumber":293,"specPath":"specs/293-persist-exact-head-delivery-cas-and-isolated-session-tokens","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008"]},"regression":{"acceptanceCriteria":["AC1","AC2"],"functionalRequirements":["FR2","FR3"],"scenarios":["SCN001","SCN002"]}} -->

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
| AC8 | Cancellation preserves subordinate CAS writes and all settled worker paths avoid unproven future-working waits | Pass | `scripts/sdlc-execute.mjs`: `latestMatchingRunState`, `cleanupControllerWorkers`, signal cleanup, newly-created settlement, retained resume, and remediation settlement; `scripts/__tests__/sdlc-execute.test.mjs` covers subordinate revision advance, checkpoint-lock failure, and no future-working wait for newly-created, retained, and remediation workers |

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
| T004 | Add exact-head, isolation, and terminal-proof regressions | Complete | All eight scenarios map to named Jest cases; full and focused suites pass |
| T005 | Rebind an existing PR after the controller-owned version push | Complete | Persisted PR is re-read after push; stale H1 is never merged; foreign drift reconciles |
| T006 | Restore the next issue branch before retained-worker matching | Complete | Clean restoration occurs before collision/ownership checks; dirty restoration failures retain the worker and fail closed |
| T007 | Harden isolated session leaf artifact boundaries | Complete | Both unsafe leaf types fail before state use, command invocation, CAS writes, or redirected handoffs |
| T008 | Record managed steering alignment and synchronize release metadata | Complete | Registered steering consumers and validation providers are identified; `VERSION` and `package.json` both publish `3.18.7`; executed parsing and equality verification exited 0 |
| T009 | Persist cancellation after subordinate checkpoint writes | Complete | Newly-created, retained, and remediation missing-handoff workers stop without an unproven future-working wait; pasted-prompt and working-detection races still settle; cancellation refreshes the latest revision, preserves delivery state, persists `controller_cancelled`, and keeps the lease when checkpoint persistence fails |

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
| AC8 | SCN008 | Yes | Yes |

### Coverage Summary

- Feature files: 1 active feature with 8 regression scenarios
- Step definitions: Jest behavior cases mapped to each scenario contract
- Focused execute controller execution: 1 suite and 173 tests passed
- Full repository execution: 49 suites and 699 tests passed; 1 suite and 2 tests skipped by their existing applicability contracts
- Current-spec validation: 54 genuine issue specs, 16 required archive entries, 16 rewrite capabilities, 16 active workflow mappings, and 1 deprecated stub passed

- Release metadata synchronization: `VERSION=3.18.7 package.json.version=3.18.7 synchronized`; exit 0

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | Standalone `/sdlc-open-pr 293` |
| **Test Project** | `/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-293-exercise-y7IJ4A` (removed after capture) |
| **Exercise Method** | `node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/exercise-omp.mjs" --cwd /var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-293-exercise-y7IJ4A -- /sdlc-open-pr 293` |
| **Interactive gate handling** | N/A (automated worker) |
| **Termination** | Normal controller-owned failed handoff; no wall-clock deadline |

### Captured Output Summary

The harness loaded the changed open-pr surface, initialized isolated session `1b471090-56c6-4c36-8f94-9935f8b47b0a`, and returned the exact session handoff marker `.omp/sdlc/sessions/1b471090-56c6-4c36-8f94-9935f8b47b0a/handoffs/293-deliver.json`. Delivery then failed closed with `reasonCode: delivery_failed` because the deliberately minimal disposable repository omitted `specs/`. The failed handoff was preserved, no PR was opened, canonical `.omp/sdlc/run.json` was not created, and the disposable project was removed.

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
| Mandatory steering runner | Pass | Current execution exited 0 with `ok: true`, `ceiling: null`, and complete 2/2 provider coverage |
| `repository.tests` | Pass | `npm test -- --runInBand`: 49 suites and 699 tests passed; 1 suite and 2 tests skipped by existing applicability contracts |
| `repository.nmg-sdlc-smoke` | Pass | `node scripts/exercise-omp.mjs --cwd /tmp/nmg-sdlc-remediation.hM73wp/project -- /sdlc-status --json` exited 0 with `nextAction.command: /sdlc-draft-issue` |
| Focused execute controller suite | Pass | `npm test -- --runInBand __tests__/sdlc-execute.test.mjs`: 173/173 tests passed |
| Current specs | Pass | `node scripts/verify-current-specs.mjs` passed 54 genuine issue specs and all reported mappings |
| Release metadata synchronization | Pass | Node parsed `package.json`, read `VERSION`, compared both values, reported `3.18.7` for each, and exited 0 |
| Plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository` exited 0 |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: 43 items mapped |
| Diff hygiene | Pass | `git diff --check` exited 0 with no output |
| Workflow bundle validator | Not applicable | `skill://skill-creator` was resolved and read; its validator requires `SKILL.md`, while `workflows/open-pr` is an OMP `WORKFLOW.md` bundle |

**Gate Summary**: 9 passed, 0 failed, 0 incomplete, 1 not applicable

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
| `scripts/sdlc-execute.mjs` | 0 | Explicit-path CAS, branch restoration ordering, newly-created/retained/remediation settled-worker handling, and latest-revision cancellation checkpointing |
| `scripts/__tests__/sdlc-deliver.test.mjs` | 0 | AC1-AC5, AC7, and symlink-boundary behavior |
| `scripts/__tests__/sdlc-execute.test.mjs` | 0 | AC6 and AC8 branch-resume, subordinate-CAS cancellation, checkpoint-lock, prompt-race, and all settled-worker paths |
| `scripts/__tests__/open-pr-delivery-contract.test.mjs` | 0 | Scope retention and handoff-only completion contract |
| `workflows/open-pr/WORKFLOW.md` | 0 | Execute/session scope selection and reuse across every rerun |
| `commands/sdlc-open-pr.md` | 0 | Packaged command synchronized with workflow behavior |
| `README.md` | 0 | Public isolated-session, exact-head completion, and cancellation checkpoint behavior |
| `CHANGELOG.md` | 0 | Issue #293 delivery and cancellation fixes documented |
| `VERSION` | 0 | Steering-defined version source publishes `3.18.7`; executed synchronization check passed |
| `package.json` | 0 | OMP plugin manifest preserves its extension surface and mirrors version `3.18.7`; executed JSON parse and synchronization check passed |

## Recommendation

**Pass**

The implementation remediation, updated specification, prior deterministic steering evidence, and rerun executable checks satisfy issue #293 with no remaining blocker. The security fix is implementation-owned; the verifier's failed publication is not treated as delivered mutation.
