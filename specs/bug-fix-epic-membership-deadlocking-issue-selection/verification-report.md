# Verification Report: Fix Epic Membership Deadlocking Issue Selection

**Date**: 2026-08-13
**Issue**: #149
**Reviewer**: Codex
**Scope**: Defect-fix verification against the active spec and bounded related contracts

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **4.7** |

**Implementation Status**: **Pass — defect fix**
**Acceptance Criteria**: **6/6 passing**
**Tasks**: **4/4 complete**
**Total Remaining Issues**: **0**

The original failure no longer reproduces. Before the fix, `start-issue` treated every open parent as an execution dependency, so an open coordination epic filtered its children. In the disposable post-fix exercise, child `#20` remained ready while open epic `#10` was excluded from blockers, and child `#30` remained blocked by its genuine sibling dependency `#20`.

### Spec Context

- **activeSpec**: `specs/bug-fix-epic-membership-deadlocking-issue-selection/`
- **relatedSpecs**:
  - `specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/` — explicit `Related Spec` link and downstream epic-identity contract
  - `specs/feature-start-issue-skill/` — matched affected path `skills/start-issue/SKILL.md` and `parentsOf` dependency-filter contract
  - `specs/bug-drop-unsupported-parent-field-from-gh-issue-view-json-query-in-sdlc-runner/` — matched affected path `scripts/sdlc-runner.mjs` and the unsupported `gh issue view --json parent` regression
- **scannedSpecCount**: 87
- **loadedSpecCount**: 4
- **metadataOnlyCount**: 83
- **gaps**: none

The active #149 design supersedes the older fail-open and candidate-pool assumptions while preserving their valid boundaries. Native parent discovery remains available through GraphQL without reintroducing the unsupported `gh issue view --json parent` field.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Bare interactive selection does not block on epic membership | Pass | `skills/start-issue/SKILL.md:18`, `skills/start-issue/SKILL.md:57`, `skills/start-issue/SKILL.md:101`; nested exercise reported `READY: #20` and `COORDINATION: #10` |
| AC2 | Runner selection uses explicit epic semantics | Pass | `scripts/sdlc-runner.mjs:2151`, `scripts/sdlc-runner.mjs:2217`, `scripts/sdlc-runner.mjs:2321`; native-plus-body, body-only, and native-only runner tests pass |
| AC3 | Genuine dependencies still block | Pass | `scripts/sdlc-runner.mjs:2312-2328`; exercise reported `#30` blocked by `#20`, and unit coverage omits epic `#10` from blocker diagnostics |
| AC4 | Downstream epic discovery remains intact | Pass | `scripts/__tests__/epic-relationship-contract.test.mjs:37`, `scripts/__tests__/epic-relationship-contract.test.mjs:62`; producer and `write-spec`/`open-pr` consumers retain both identity forms |
| AC5 | Ambiguous parent identity fails safely | Pass | `references/epic-relationships.md:20-39`, `scripts/sdlc-runner.mjs:2315-2319`; confirmed non-epic and missing/malformed metadata tests pass with named warnings |
| AC6 | Cross-skill regression is exercised | Pass | `scripts/__tests__/select-next-issue-from-milestone.test.mjs:98-177`, `scripts/__tests__/epic-relationship-contract.test.mjs:74`, `scripts/__tests__/exercise-start-issue-epic.test.mjs:106-148`; dedicated `codex exec` exercise passed |

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Define and apply canonical epic relationship semantics | Complete | Shared reference and `start-issue` were authored through `skill-creator`; validation and inventory audit pass |
| T002 | Align deterministic runner readiness | Complete | Fresh GraphQL/native hydration, role classification, fail-safe completion, and stable return shape verified |
| T003 | Add regression and cross-skill coverage | Complete | Six one-to-one Gherkin scenarios, 26 focused assertions, and the disposable Codex exercise cover required link forms and fallbacks |
| T004 | Document and verify the correction | Complete | README and `[Unreleased]` updated; full suite, exercise, inventory, syntax, and whitespace gates pass |

---

## Architecture Assessment

### Blast Radius

- **Shared callers**: `start-issue` Step 1a and runner preselection now consume the same role decision table; downstream `draft-issue`, `write-spec`, and `open-pr` identity contracts remain unchanged.
- **Public contract**: no CLI arguments, configuration fields, persistence schema, or exported return shape changed. The intended observable change is limited to readiness classification and blocker diagnostics.
- **Data interpretation**: confirmed `epic` targets are deliberately reclassified as coordination-only. Unknown and confirmed non-epic targets remain execution dependencies, preventing silent false readiness.
- **Mutation boundary**: classification is read-only. No issue body, native parent link, project field, branch, or issue graph is modified.

### Checklist Scores

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID Principles | 4 | Role semantics are centralized and runner helpers are cohesive/injectable; the pre-existing runner remains a large orchestration module |
| Security | 5 | Only positive local issue numbers are accepted, cross-repo/self references are ignored, GraphQL aliases derive from validated integers, and milestone shell input remains escaped |
| Performance | 4 | Native parents are fetched in one GraphQL batch and target hydration is deduplicated/bounded; no persistent cache or graph-wide scan was introduced |
| Testability | 5 | GitHub execution and warning sinks are injectable; unit, cross-skill, BDD, and real nested-Codex exercise layers all pass |
| Error Handling | 5 | Native discovery degrades to body links, known metadata failures remain named blockers, warnings deduplicate, and all-blocked diagnostics remain actionable |

**Architecture score**: **4.6/5**

### Minimal-Change Review

Every implementation file maps to T001-T004: the shared role reference, `start-issue`, runner, three test files, README, and CHANGELOG. The branch also contains the committed four-file active spec. There is no version bump (`VERSION` and `.codex-plugin/plugin.json` remain `1.73.0`), delivery change, issue-graph rewrite, or unrelated refactor.

---

## Test Coverage

### BDD and Regression Mapping

| Acceptance Criterion | Gherkin Scenario | Deterministic/Exercise Evidence | Passes |
|---------------------|------------------|---------------------------------|--------|
| AC1 | Yes | `start-issue` contract + nested Codex exercise | Yes |
| AC2 | Yes | Runner native-plus-body/body-only/native-only tests | Yes |
| AC3 | Yes | Genuine sibling and non-epic blocker tests + exercise | Yes |
| AC4 | Yes | Cross-skill producer/consumer contract test | Yes |
| AC5 | Yes | Non-epic, missing, and malformed metadata tests | Yes |
| AC6 | Yes | Full cross-skill matrix + disposable exercise | Yes |

- **Feature file**: 6 `@regression` scenarios for 6 ACs
- **Step definitions**: N/A for Markdown plugin contracts; Jest assertions and `codex exec` exercise provide executable mappings
- **Focused tests**: 26 passed across runner and cross-skill suites
- **Full suite**: 23 suites passed; 492 tests passed; 18 opt-in tests skipped by design
- **Syntax/whitespace**: `node --check` and `git diff --check` passed

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `start-issue` |
| **Test Project** | Disposable `os.tmpdir()` Git repository, cleaned in `finally` |
| **Exercise Method** | Nested `codex exec` with PATH-prepended fake `gh` |
| **User Gate Handling** | Stopped after Step 1a; no `request_user_input` call |
| **Duration** | 117.6 seconds on the final run |
| **GitHub Safety** | Write-shaped fake-`gh` calls create a sentinel and fail; final run created no sentinel |

### Captured Output Summary

- `READY`: included child `#20` while open epic `#10` remained coordination-only.
- `BLOCKED`: child `#30` was blocked by genuine sibling `#20`.
- `COORDINATION`: epic `#10` was excluded from blockers.
- No GitHub write command was attempted.

### Exercise AC Evaluation

| AC | Verdict | Evidence |
|----|---------|----------|
| AC1 | Pass | Ready child remained selectable while epic stayed open |
| AC2 | Pass | Coordination role was explicit rather than inferred from candidate-pool absence |
| AC3 | Pass | Genuine sibling remained the named blocker |
| AC4 | Pass | Cross-skill contract suite preserved downstream identity consumers |
| AC5 | Pass | Deterministic tests cover confirmed non-epic and failed metadata paths |
| AC6 | Pass | Current dual-link graph exercised end-to-end; all degraded forms covered deterministically |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| SDLC runner tests | Pass | `cd scripts && npm test -- --runInBand`: 23 suites, 492 tests passed |
| Skill exercise test | Pass | `RUN_EXERCISE_TESTS=1 npm test -- --runInBand exercise-start-issue-epic`: 1/1 passed |
| Skill inventory audit | Pass | `Skill inventory audit: clean (569 items mapped)` |
| Prompt quality review | Pass | Instructions are unambiguous, complete across manual/unattended/fallback paths, Codex-native, ordered, and reference-valid |
| Behavioral contract review | Pass | Preconditions, postconditions, invariants, downstream identity, read-only boundaries, and no-cache rule all addressed |

**Gate Summary**: **5/5 passed, 0 failed, 0 incomplete**

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| Medium | Testing | `scripts/__tests__/exercise-start-issue-epic.test.mjs:35-143` | Exercise output echoed the fake `gh` source, so a substring assertion mistook the guard text for an executed write | Record actual write attempts in an environment-scoped sentinel file and assert that the sentinel was not created | `direct` |

The required post-fix `nmg-sdlc:simplify` review found no additional worthwhile cleanup. The final focused exercise and full suite both pass.

## Remaining Issues

None.

## Positive Observations

- A single shared decision table prevents prompt/code semantic drift.
- Unknown relationship metadata fails safe and names the exact child/target pair.
- Native discovery uses GraphQL without violating the issue #91 CLI-field regression.
- The real nested Codex exercise verifies prompt interpretation while the fake `gh` blocks all writes.

## Recommendation

**Ready for PR.** All six acceptance criteria and all four tasks pass; all steering gates are green; the one verification-harness finding was fixed and reverified; no remaining issues are known.
