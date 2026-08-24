# Verification Report: GitHub blocked-by as the sole issue dependency

**Date**: 2026-08-23
**Issue**: #236
**Reviewer**: Codex
**Scope**: Implementation verification against the approved issue specification

---

## Executive Summary

Issue #236 implements GitHub's official `blocked_by` relation as the shared production dependency authority. The implementation adds a zero-dependency REST adapter and graph validator, migrates execute/start/status/upgrade consumers, updates draft and upgrade workflow contracts, removes body-derived runtime decisions, and updates public and steering documentation.

One local defect was found and fixed during verification: status collection classified reachable cycle and dangling-edge failures as `unknown` even though the approved design requires `blocked`. The focused status suite and the full regression suite pass after the fix.

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

**Total Issues**: 0 remaining; 1 fixed during verification

---

## Issue Scope

- Active issue: #236
- Spec: `specs/236-adopt-github-blocked-by-as-the-only-issue-dependency-type`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12]; tasks [T001, T002, T003, T004, T005, T006, T007, T008]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":236,"specPath":"specs/236-adopt-github-blocked-by-as-the-only-issue-dependency-type","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10","FR11","FR12"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required
- Release artifacts: Pass — `VERSION` and `package.json` were synchronized at `3.10.0`; Node parsed `package.json` and confirmed exact equality with `VERSION`.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Official blocked-by is the sole dependency authority. | Pass | `scripts/issue-dependencies.mjs:78-149`; production search found no `parseBodyRelationships` caller and body fields remain only in upgrade migration parsing/tests. |
| AC2 | Draft applies approved official edges without a second confirmation or body relation fields. | Pass | `workflows/draft-issue/WORKFLOW.md:70-115`; `workflows/draft-issue/references/multi-issue.md`; `scripts/__tests__/interactive-plan-contract.test.mjs:35-47`. |
| AC3 | Upgrade screens every issue and reconciles approved missing edges, refusing unsafe graphs. | Pass | `scripts/sdlc-upgrade.mjs:598-665`; upgrade adapter tests cover complete listing, drift, idempotent retry, and preflight. |
| AC4 | No-argument execute presents only eligible issues and fails closed before a picker. | Pass | `scripts/sdlc-execute.mjs:86-148,429-443,690-706`; execute tests cover independent work, mixed blockers, unreadable evidence, and zero eligible rows. |
| AC5 | Explicit execute/start refuse unsafe graphs before mutation and status reports the same reason. | Pass | `scripts/sdlc-execute.mjs:725-741`; `scripts/start-issue.mjs:100-113`; `scripts/sdlc-status.mjs:240-248,492-499`; status cycle/dangling mapping fixed during verification. |
| AC6 | Validator rejects dangling targets and deterministic open cycles while accepting closed blockers and independent issues. | Pass | `scripts/issue-dependencies.mjs:165-229`; `scripts/__tests__/issue-dependencies.test.mjs:65-95`. |
| AC7 | Dependency reads fail closed everywhere without body or partial-page fallback. | Pass | `scripts/issue-dependencies.mjs:23-31,67-75,104-115`; execute/start/status/upgrade callers preserve stable dependency reason codes. |

## Regression Obligations

No neighboring spec was declared by the active package. The preserved contracts explicitly checked in issue #236 are the serial execute lifecycle, `spec-created` gate, approved-spec gate, Project Done exclusion, lowest-number ordering, and independent-issue eligibility. The full Jest suite passed with these behaviors intact.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Build official blocked-by client | Complete | Added `scripts/issue-dependencies.mjs` with complete `gh api --paginate --slurp` reads and numeric REST-id writes. |
| T002 | Implement graph validation and edge application | Complete | Recursive graph loading, deterministic cycles, dangling checks, preflight, idempotency, and rollback are implemented and tested. |
| T003 | Migrate draft-issue to official edges | Complete | Plan-local ids and `blockedBy` references replace generated body fields; approval remains the existing split/final-plan gate. |
| T004 | Add full-repository upgrade reconciliation | Complete | Detection loads all issue pages and official dependency pages; apply is digest-bound and preflighted. |
| T005 | Filter execute selection and explicit runs | Complete | Picker/backlog eligibility and explicit pre-mutation validation use the shared graph. |
| T006 | Migrate start and status to shared evidence | Complete | Both consumers use the shared adapter; status graph-level blocked classification was corrected during verification. |
| T007 | Remove dual dependency contracts | Complete | Runtime body parser removed; README, CONTRIBUTING, steering, workflows, fixtures, and changelog describe official blocked-by only. |
| T008 | Run full regression and adapter smoke | Complete | Full Jest suite, plugin surface, inventory, workflow validation, draft fixture, and OMP surface exercise were run. |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | The shared module owns one dependency domain, though it contains both transport and graph operations by design. |
| Open/Closed | 4 | Lifecycle callers consume stable graph/status functions rather than maintaining separate parsers. |
| Liskov Substitution | 5 | Injected runners preserve the same command-result contract as the production runner. |
| Interface Segregation | 4 | Callers import only the dependency operations they need. |
| Dependency Inversion | 5 | GitHub execution is injected, enabling deterministic tests without live mutation. |

### Layer Separation

The shared adapter remains in `scripts/`; workflow contracts describe lifecycle decisions and delegate deterministic graph work to that adapter. Draft and upgrade own their remote writes. Execute, start, and status remain consumers and do not emit legacy dependency fields.

### Dependency Flow

Lifecycle surfaces depend inward on `scripts/issue-dependencies.mjs`. The shared module has no dependency on workflow content or caller-specific state. No second production parser was introduced.

---

## Security Assessment

**Score: 5/5**

- Authentication and authorization remain delegated to authenticated `gh`; no secret handling was added.
- Positive safe-integer validation covers issue numbers and database ids.
- Repository identity is resolved once and cross-repository metadata fails closed.
- Every subprocess call uses explicit program and argument arrays; no shell interpolation is used.
- Writes occur only after combined-graph preflight. Rollback targets only edges added by the invocation.
- Remote mutation was not performed during verification; GitHub behavior is covered with injected runners.

---

## Performance Assessment

**Score: 4/5**

- Complete pagination is explicit and bounded to 100 records per page.
- Per-operation caches prevent repeated blocked-by page reads after normalization and are invalidated after writes.
- Graph traversal and deterministic cycle detection are linear in nodes plus edges, apart from sorting.
- Upgrade intentionally scans every repository issue and blocked-by page to satisfy the complete-reconciliation contract. These reads are sequential and may be slower on large repositories, but remain bounded by repository size and preserve fail-closed diagnostics.

---

## Testability and Error Handling

**Testability: 5/5**

The shared client accepts an injected runner. Unit fixtures cover pagination, normalization, repository mismatch, malformed responses, recursion, independent/closed/open status, canonical cycles, dangling targets, idempotent preflight, numeric database ids, apply rollback, cache invalidation, thrown transports, migration parsing, execute selection, start mutation boundaries, status output, and upgrade drift.

**Error Handling: 5/5**

Stable reason codes distinguish unreadable evidence, dangling targets, cycles, open blockers, stale plans, failed apply, and partial rollback. Callers fail before their owned mutation boundary. Status now preserves cycle/dangling as blocked and unreadable evidence as unknown.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Executable Coverage | Passes |
|---------------------|-------------|-------------------------|--------|
| AC1 | Yes, SCN001 | Yes | Yes |
| AC2 | Yes, SCN002 | Yes | Yes |
| AC3 | Yes, SCN003 | Yes | Yes |
| AC4 | Yes, SCN004 | Yes | Yes |
| AC5 | Yes, SCN005 | Yes | Yes |
| AC6 | Yes, SCN007 | Yes | Yes |
| AC7 | Yes, SCN006 | Yes | Yes |

### Coverage Summary

- Feature files: 1 file, 7 scenarios
- Step definitions: implemented as Jest ESM adapter, controller, workflow-contract, and integration tests rather than Cucumber step files
- Full test execution: 40 suites passed, 442 tests passed; 1 opt-in live exercise suite skipped because `RUN_EXERCISE_TESTS` was not enabled
- Focused post-fix status execution: 1 suite passed, 18 tests passed

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `draft-issue` |
| **Test Project** | disposable `nmg-sdlc-exercise-236-*` directory, removed after capture |
| **Exercise Method** | `node scripts/exercise-omp.mjs --cwd <project> --timeout-ms 300000 -- /sdlc-draft-issue ...` |
| **Interactive gate handling** | Expected TUI-only boundary |
| **Duration** | 300 seconds |

### Captured Output Summary

The RPC harness emitted `Run /sdlc-draft-issue in the TUI.` and then timed out waiting for `agent_end`. This is the documented fail-closed behavior for interactive `/sdlc-*` commands in `workflows/verify-code/references/exercise-testing.md:27-50`; no live GitHub mutation was attempted. The deterministic draft fixture separately passed 13 checks with 0 failures and 1 classification-not-applicable skip.

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC2 | Draft publishes approved official blocked-by edges. | Pass | TUI surface limitation recorded as required; workflow contract validation and `interactive-plan-contract.test.mjs` cover plan-local edges, body-field removal, and no second ask. |

### Notes

Interactive draft execution requires the actual TUI and cannot be driven through print/RPC. The harness observation is therefore a graceful-degradation result, not evidence of dependency publication. Publication behavior is established locally by the executable workflow contract plus injected shared-adapter tests.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `npm test -- --runInBand`: 40 suites and 442 tests passed; one explicitly opt-in live exercise suite skipped. |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: 43 items mapped, clean. |
| OMP plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository`: passed. |
| Skill creator validation | Pass | Resolved/read `skill://skill-creator`; draft, onboard, and upgrade bundles passed the validator through temporary `WORKFLOW.md` → `SKILL.md` aliases required by the generic validator. |
| Skill exercise | Pass | Draft deterministic fixture: 13 pass, 0 fail, 1 not-applicable skip; TUI-only RPC limitation captured. No fixture exists for onboard-project or upgrade-project, but their changed files are templates/contracts covered by plugin, inventory, validator, and Jest upgrade suites. |
| Prompt quality | Pass | Changed workflow contracts are ordered, explicit about approval and mutation boundaries, name exact tools/paths, and preserve interactive/automated gate separation. |
| Git hygiene | Pass | `git diff --check main...HEAD`: exit 0, no output. |

**Gate Summary**: 7/7 passed, 0 failed, 0 incomplete

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| Medium | Error Handling | `scripts/sdlc-status.mjs:244-248` | Graph-level `dependency_cycle` and `dependency_dangling` exceptions were collected as `unknown`, contrary to the approved blocked-status contract. | Map cycle and dangling reasons to `blocked`; retain unreadable evidence as `unknown`. Added parameterized status regression coverage. | `direct` |

## Remaining Issues

None.

---

## Positive Observations

- One shared adapter replaces independent production body parsers.
- Deterministic, immutable graph output and stable reason codes make failure evidence auditable.
- Explicit argv and injected runners keep tests safe from live GitHub mutation.
- Execute preserves independent eligible work when another candidate's reachable graph is cyclic.
- Documentation and steering are aligned with the runtime cutover.

---

## Recommendations Summary

### Before PR (Must)

- [x] No remaining local acceptance, architecture, or verification blocker.

### Short Term (Should)

- [ ] None required for issue #236.

### Long Term (Could)

- [ ] Consider bounded concurrency for full-repository upgrade reads if large-repository latency becomes material; preserve deterministic ordering and fail-closed aggregation.

---

## Files Reviewed

- `scripts/issue-dependencies.mjs`
- `scripts/sdlc-execute.mjs`
- `scripts/start-issue.mjs`
- `scripts/sdlc-status.mjs`
- `scripts/sdlc-upgrade.mjs`
- `scripts/epic-relationships.mjs`
- `scripts/epic-lifecycle-repair.mjs`
- `scripts/__tests__/issue-dependencies.test.mjs`
- `scripts/__tests__/sdlc-execute.test.mjs`
- `scripts/__tests__/start-issue-controller.test.mjs`
- `scripts/__tests__/sdlc-status.test.mjs`
- `scripts/__tests__/sdlc-upgrade.test.mjs`
- `scripts/__tests__/interactive-plan-contract.test.mjs`
- `workflows/draft-issue/`
- `workflows/upgrade-project/`
- `workflows/onboard-project/templates/`
- `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`
- `steering/product.md`, `steering/tech.md`, `steering/structure.md`

## Recommendation

Ready for PR. All local acceptance criteria and applicable verification gates pass after the status-classification fix. No PR-only evidence obligation applies.
