# Verification Report: Fix Start-Issue Shortlist Starvation

**Date**: 2026-08-16
**Issue**: #175
**Reviewer**: Codex
**Scope**: Implementation verification against spec

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **5** |

### Implementation Status: Pass

**Total Issues**: 0 remaining after verification fixes

The repaired discovery contract backfills a starved ten-issue window until four verified choices exist or the bounded scope is exhausted. It omits only open issues whose readable Project statuses are uniformly `Done`, preserves explicit recovery, and retains fail-closed relationship and deliverable checks for every issue evaluated before the fourth choice.

## Issue Scope

- Active issue: #175
- Spec: `specs/bug-fix-start-issue-shortlist-starvation`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5]; FR [FR1, FR2, FR3, FR4, FR5, FR6]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":175,"specPath":"specs/bug-fix-start-issue-shortlist-starvation","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Backfill after readiness filtering | Pass | Bounded constants and fresh-prefix expansion are defined in `skills/start-issue/references/milestone-selection.md:24`; the focused contract and disposable exercise passed. |
| AC2 | Exclude confirmed completed Project work | Pass | The all-readable-statuses predicate and safe unknown/mixed behavior are defined in `skills/start-issue/references/milestone-selection.md:52`; the exercise excluded #200 separately. |
| AC3 | Preserve explicit recovery | Pass | Automatic-only filtering and the explicit reopen warning are defined in `skills/start-issue/SKILL.md:118` and `skills/start-issue/SKILL.md:184`; static contract coverage passed. |
| AC4 | Preserve relationship and deliverable safety | Pass | The evaluated-prefix boundary preserves complete hydration and fail-closed checks in `skills/start-issue/SKILL.md:54`; all 398 non-opt-in tests passed and the unneeded malformed tail remained uninspected. |
| AC5 | Prove the PathCast regression without mutation | Pass | `scripts/__tests__/exercise-start-issue-backfill.test.mjs:189` exercised limits 10 then 20, returned #196-#199, excluded #200, ignored trailing #195, and recorded no write attempt. A read-only PathCast application yielded #103, #104, #105, and #107. |

## Regression Obligations

The resolver found no separately owned regression IDs. Existing start-issue relationship, deliverable, pagination, fallback, ordering, and manual-selection behavior was nevertheless exercised by the full repository suite and reviewed as blast-radius context.

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Define bounded discovery and completed-Project behavior | Complete | Four-choice target, ten-issue increments, 100-issue bound, safe metadata fallback, and distinct counts are defined. |
| T002 | Add regression and forward-exercise coverage | Complete | Five focused static tests and one opt-in disposable Codex exercise were added. |
| T003 | Validate the plugin and real PathCast behavior | Complete | Repository gates passed and the consumer result was confirmed read-only. |
| T004 | Document the repair | Complete | README, changelog, defect requirements, tasks, and Gherkin were updated. |

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Milestone-window policy remains in its existing selection reference; relationship classification remains in Step 1a and shared references. |
| Open/Closed | 5 | The existing discovery pipeline is extended through a bounded loop without changing downstream stage ownership. |
| Liskov Substitution | 5 | Not directly applicable to Markdown contracts; automatic and explicit selection modes retain their existing postconditions. |
| Interface Segregation | 5 | Project status is requested only for eligibility and is not reused as dependency or deliverable evidence. |
| Dependency Inversion | 5 | The skill continues to consume GitHub evidence through the existing `gh` interface and shared relationship contracts. |

### Layer Separation

The change affects only automatic issue discovery, its public documentation, and verification coverage. Branch creation, Project mutation, specification, implementation, and delivery stages remain unchanged and are not reached by the discovery exercise.

### Dependency Flow

Candidate enumeration feeds the existing Step 1a classifiers, automatic eligibility filtering, and then presentation. Project `Done` status can remove a candidate from automatic presentation but cannot satisfy an execution dependency, structured deliverable, or coordination identity.

## Security Assessment

- [x] Authentication: Existing authenticated `gh` access is unchanged.
- [x] Authorization: Read-only discovery adds no write authority; explicit confirmation remains required before downstream mutation.
- [x] Input validation: Limits are fixed constants and explicit issue numbers retain existing validation.
- [x] Injection prevention: Multiline or remote values are not interpolated into new shell commands.
- [x] Data protection: No secrets or additional sensitive data are requested or persisted.

## Performance Assessment

- [x] Async patterns: Not applicable to the Markdown workflow contract.
- [x] Caching: Each expansion deliberately supersedes stale classifications with fresh evidence.
- [x] Resource management: Discovery is bounded at 100 candidates and stops after four verified choices.
- [x] Query optimization: Fetches expand by ten and existing relationship metadata remains batched.

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes, SCN001 | Contract plus exercise harness | Yes |
| AC2 | Yes, SCN002 | Contract plus exercise harness | Yes |
| AC3 | Yes, SCN003 | Static contract | Yes |
| AC4 | Yes, SCN004 | Contract plus full regression suite | Yes |
| AC5 | Yes, SCN005 | Disposable Codex exercise | Yes |

### Coverage Summary

- Feature files: 1 file, 5 scenarios
- Step definitions: Implemented through deterministic contract and exercise harnesses; no standalone Gherkin runner is used for this prompt contract
- Focused tests: 5/5 passed in `start-issue-selection-contract.test.mjs`
- Full tests: 36/36 suites passed; 398 tests passed; 13 opt-in tests skipped as expected
- Exercise tests: 1/1 passed when explicitly enabled

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `start-issue` |
| **Test Project** | Disposable `nmg-sdlc-start-backfill-*` temporary repository, removed after the run |
| **Exercise Method** | `codex exec` through an opt-in Jest harness |
| **`request_user_input` Gate Handling** | N/A; the exercise intentionally stopped after automatic discovery settled |
| **Duration** | Approximately 139 seconds |

### Captured Output Summary

The exercise queried limits 10 and 20, classified #209-#201 as blocked, excluded all-Done coordination issue #200, and presented #196, #197, #198, and #199 in topological issue-number order. The malformed trailing #195 was not evaluated after the target was met. A PATH-prepended deterministic `gh` rejected every write-shaped command, and no write-attempt log was created.

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC1 | Bounded backfill | Pass | Captured `FETCH_LIMITS: 10, 20` and four later ready issues. |
| AC2 | Done exclusion | Pass | Captured `EXCLUDED_DONE: 200`. |
| AC3 | Explicit recovery | Pass | Static contract pins automatic-only exclusion and the confirmation warning. |
| AC4 | Readiness safety | Pass | Nine blockers were retained, ordering was stable, and trailing malformed #195 was absent. |
| AC5 | No mutation | Pass | No write-attempt log existed after the run. |

### Notes

The repository's generic skill-exercise runner has no `start-issue` fixture. The purpose-built opt-in Jest harness supplies the same deterministic disposable-project and `codex exec` evidence while also blocking every GitHub write path.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `cd scripts && npm test -- --runInBand`: 36 suites passed, 398 tests passed, 13 expected opt-in skips. |
| Skill inventory | Pass | `skill-inventory-audit.mjs --check`: clean inventory with 463 mapped items. |
| Codex compatibility | Pass | `codex-compatibility-check.mjs`: exit 0. |
| Active plugin surface | Pass | `verify-plugin-surface.mjs --root . --label repository`: exit 0. |
| Skill creator validation | Pass | `quick_validate.py skills/start-issue`: `Skill is valid!` |
| Skill exercise | Pass | Purpose-built deterministic `codex exec` exercise: 1/1 passed; no mutation. |
| Prompt quality | Pass | Instructions are bounded, cover success/fallback/explicit-recovery paths, preserve interactive gates, and reference packaged files. |
| Git hygiene | Pass | `git diff --check`: exit 0. |

**Gate Summary**: 8/8 gates passed, 0 failed, 0 incomplete

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| High | Error Handling | `skills/start-issue/references/milestone-selection.md` | A fetched but unneeded malformed tail could incorrectly abort after four choices were already verified. | Defined an evaluated-prefix boundary that keeps pre-target evidence fail-closed and leaves trailing records uninspected. | `skill-creator` |
| Low | Testing | `scripts/__tests__/exercise-start-issue-backfill.test.mjs` | The first exercise assertion depended on blocked-result display order even though the contract does not. | Made blocked membership order-independent while retaining exact ready-order assertions. | `direct` |
| Low | Traceability | `specs/bug-fix-start-issue-shortlist-starvation/requirements.md` | Initial requirement IDs and status did not match the normalized final delivery scope. | Normalized FR1-FR6 and marked the implemented defect contract Fixed. | `direct` |

## Remaining Issues

None.

## Positive Observations

- The repair reuses the complete existing relationship and deliverable classifiers rather than creating a weaker readiness path.
- Project status is treated conservatively: unknown and mixed states never prove completion.
- The disposable exercise makes the no-mutation boundary executable and auditable.
- The consumer dry run demonstrates that the fix addresses the exact PathCast failure without changing PathCast state.

## Recommendations Summary

### Before PR (Must)

- [x] No remaining local verification blockers.

### Short Term (Should)

- [x] Deliver the patch release through the protected-repository PR workflow.

### Long Term (Could)

- [ ] Consider promoting the purpose-built start-issue exercise into the generic fixture runner if that runner gains deterministic `gh` command interception.

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `skills/start-issue/SKILL.md` | 0 | Main discovery, filtering, ordering, and explicit-recovery contract. |
| `skills/start-issue/references/milestone-selection.md` | 0 | Bounded window and Project-completion policy. |
| `scripts/__tests__/start-issue-selection-contract.test.mjs` | 0 | Static behavior contract. |
| `scripts/__tests__/exercise-start-issue-backfill.test.mjs` | 0 | Disposable forward exercise and mutation guard. |
| `specs/bug-fix-start-issue-shortlist-starvation/requirements.md` | 0 | Acceptance criteria and functional requirements. |
| `specs/bug-fix-start-issue-shortlist-starvation/tasks.md` | 0 | Task completion evidence. |
| `specs/bug-fix-start-issue-shortlist-starvation/feature.gherkin` | 0 | Five BDD scenarios. |
| `README.md`, `CHANGELOG.md` | 0 | Public behavior and release note. |

Related-spec discovery scanned 98 requirement documents and loaded the active defect spec plus `specs/feature-start-issue-skill/`; no manifest or ownership gaps were found.

## Recommendation

**Ready for PR**

All delivery ACs, FRs, tasks, and scenarios have local evidence. The full repository verification surface is green, the real consumer regression is corrected read-only, and no unresolved architecture, security, performance, testability, or error-handling findings remain.
