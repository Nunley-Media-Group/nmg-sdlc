# Verification Report: Persist Multi-PR Umbrella Identity Across Child Workflows

**Date**: 2026-08-14
**Issue**: #160
**Reviewer**: Codex
**Scope**: Defect-fix implementation verification against the approved issue #160 specification
**Implementation Status**: **Pass**
**Related Specs**: `specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/`, `specs/bug-fix-epic-membership-deadlocking-issue-selection/`, `specs/bug-fix-sealed-umbrella-specs-stranded-outside-the-default-branch/`, `specs/bug-fix-canonical-umbrella-classification-for-verified-specs/`

---

## Executive Summary

Issue #160 is implemented and locally verified. New umbrella producers persist the parent label, matching child label, native relationship, and supported body representation; every manual lifecycle consumer uses the shared classification result; status exposes the same result without changing stage inference; native sub-issues are authoritative for sibling delivery; and upgrade owns exact approval-gated legacy repair.

The original failure was reproduced from the pre-fix contracts: parent identity could remain in session state, draft fan-out did not require `epic-child-of-N`, status exposed no coordination evidence, and open-pr enumerated only the body checklist. The new deterministic fixture reconstructs the same parent independently for planning, start, spec, code, verify, status, and PR preparation and proves real sibling dependencies remain blocking.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **5.0** |

**Status**: Pass (defect fix)
**Total Issues Found During Review**: 2
**Issues Fixed**: 2
**Remaining Issues**: 0

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Umbrella identity is durable | Pass | The tuple and producer invariants are canonical in `references/epic-relationships.md:7`; producer contracts persist and re-fetch labels/relationships in `skills/write-spec/SKILL.md:254` and `skills/draft-issue/references/multi-issue.md:333`; fresh-session fixture passes. |
| AC2 | Lifecycle consumers share one classification | Pass | Shared fields are defined in `references/epic-relationships.md:41`; cross-skill contract covers start/spec/code/verify/status/open-pr; `scripts/sdlc-status.mjs:247` imports and executes the deterministic classifier. |
| AC3 | Genuine dependencies still block | Pass | `scripts/epic-relationships.mjs:185` separates coordination from execution dependencies; unit and lifecycle tests prove an open non-epic sibling blocks while parent #108 does not. |
| AC4 | Canonical specs are not resealed per child | Pass | Write-spec retains the canonical parent gate and child no-reseal handoff; the fresh-session exercise asserts the normal `$nmg-sdlc:write-code #N` next stage and absence of child sealing. |
| AC5 | Sibling discovery uses authoritative relationships | Pass | `scripts/epic-relationships.mjs:164` reconciles native/checklist sets; open-pr pages native `subIssues` to exhaustion at `skills/open-pr/references/version-bump.md:36`; unit/status tests cover native-only, checklist-only, pagination, and fallback states. |
| AC6 | Existing umbrellas can be recovered safely | Pass | Upgrade Step 3.6 is defined at `skills/upgrade-project/SKILL.md:96`; `skills/upgrade-project/references/epic-identity-recovery.md` requires exact per-parent approval, evidence re-fetch, drift abort, narrow commands, and a clean second audit. |
| AC7 | Complete lifecycle is exercised | Pass | `scripts/__tests__/exercise-persisted-umbrella-identity.test.mjs:64` runs independent phase evaluations with multiple children, a real dependency, and stale checklist metadata; all scenarios pass. |

## Reproduction and Regression Evidence

| Check | Before Fix | After Fix |
|-------|------------|-----------|
| Parent persistence | Umbrella transition could retain only `epicParentNumber` in session state. | Parent `epic` and child `epic-child-of-N` are written and revalidated from GitHub. |
| Cross-stage identity | Verify/status lacked the shared child gate or result. | All six consumers use the shared role/parent/identity/dependency/sibling/gap fields. |
| Sibling enumeration | Open-pr used only the parent's checklist. | Native sub-issues are authoritative; checklist drift is reported and fallback is explicit. |
| Fresh-session lifecycle | No deterministic end-to-end identity fixture existed. | Seven phase evaluations independently derive durable parent #108; later child remains blocked by child #122 until it closes. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add shared durable relationship classifier | Complete | Zero-dependency pure module, shared reference, 13 focused unit tests. |
| T002 | Persist and consume identity across the manual lifecycle | Complete | Producers, six consumers, status output, canonical routing, and sibling authority aligned. |
| T003 | Add recovery, documentation, and regression coverage | Complete | Approval-gated upgrade reference, README, contract tests, and lifecycle fixture added. |
| T004 | Verify complete defect fix | Complete | Full and focused suites plus all applicable steering gates pass. |

---

## Architecture and Blast-Radius Assessment

### Defect Blast Radius

- **Shared callers**: prompt-defined start/spec/code/verify/status/open-pr workflows and the status CLI now consume the same classification semantics.
- **Public contract**: status schema remains version 1 with unchanged top-level fields; a backward-compatible nullable `issue.coordination` object is added and documented.
- **Silent data changes**: none. Classification and status are read-only. Remote repair remains inside upgrade and cannot run before an exact user gate plus immediate revalidation.
- **Scope discipline**: changes are limited to umbrella identity, sibling reconciliation, lifecycle entry gates, upgrade recovery, tests/specs/docs, and inventory metadata.

### Checklist Scores

| Area | Score | Evidence |
|------|-------|----------|
| SOLID | 5/5 | Pure normalization/classification is isolated in one module; status owns hydration only; prompt skills reference rather than duplicate the decision table. |
| Security | 5/5 | Positive issue-number validation, GraphQL variables for repository names, argument arrays rather than shell interpolation, no secrets, and exact approval-gated remote writes. |
| Performance | 5/5 | Target hydration is capped at 100, fallback is capped at 8 with five-second calls, duplicate pairs are collapsed, and incomplete native pagination fails closed. |
| Testability | 5/5 | Pure exported functions, injected status adapters, deterministic GitHub-shaped fixtures, independent phase copies, and no network in required tests. |
| Error Handling | 5/5 | Ambiguous/inconsistent/unverifiable states are explicit; unknown dependencies stay blocking; API degradation, pagination, partial repair, and concurrent drift have named outcomes. |

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Deterministic Evidence | Passes |
|---------------------|-------------|------------------------|--------|
| AC1 | Yes | Classifier unit tests + fresh-session fixture | Yes |
| AC2 | Yes | Cross-skill contract + status fixture | Yes |
| AC3 | Yes | Open/closed sibling dependency tests | Yes |
| AC4 | Yes | Canonical no-reseal contract exercise | Yes |
| AC5 | Yes | Reconciliation, pagination, and fallback tests | Yes |
| AC6 | Yes | Upgrade recovery contract assertions | Yes |
| AC7 | Yes | Multi-phase persisted-identity exercise | Yes |

### Coverage Summary

- Feature file: 7/7 acceptance-criterion scenarios, all tagged `@regression`.
- Focused final suite: 49/49 relationship/status/contract tests passed after final hardening.
- Full final suite: 249 passed, 12 intentional opt-in live-Codex skips, 0 failures (28 suites passed, 3 opt-in suites skipped).
- New direct classifier coverage: durable, legacy, ordinary, real dependency, stale nested stub, inconsistent label, unknown target, multiple parents, native authority, checklist fallback.
- New status coverage: durable output, incomplete native pagination, 100-target query bound, 8-target fallback bound, read-only behavior, and unchanged lifecycle inference.

---

## Exercise Test Results

| Exercise | Method | Result | Evidence |
|----------|--------|--------|----------|
| Persisted umbrella lifecycle | Deterministic Jest fixture with fresh JSON state per phase | Pass | Planning through PR preparation derives one durable parent; real sibling blocking and stale checklist reconciliation pass. |
| Status skill | `skill-exercise-runner.mjs --skill status` | Pass | 14 rubric checks passed, including stable schema, conflict handling, GitHub degradation, and no mutation. |
| Draft issue skill | `skill-exercise-runner.mjs --skill draft-issue` | Pass | 13 rubric checks passed; one bug-only rubric item correctly skipped for the feature fixture. |
| Specialized umbrella suites | Jest contract and disposable Git fixtures | Pass | Write-spec publication, canonical gate, start-issue, status, and cross-skill contracts passed. |
| Generic runner for start/spec/code/verify/open-pr/upgrade | Not registered | Not applicable | No generic `scripts/__fixtures__/skill-exercise/<name>` exists; behavior is covered by the specialized deterministic suites above. |
| Live Codex exercises | Opt-in (`RUN_EXERCISE_TESTS=1`) | Intentionally skipped | Required local evidence is deterministic; 12 network/session-sensitive tests remain opt-in and were not counted as passes. |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `cd scripts && npm test -- --runInBand`: 249 passed, 12 intentional skips, 0 failures. |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: clean, 437 items mapped. |
| Codex compatibility | Pass | `node scripts/codex-compatibility-check.mjs`: passed. |
| Active plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository`: passed. |
| Skill creator validation | Pass | `quick_validate.py` passed for draft-issue, start-issue, write-spec, write-code, verify-code, status, open-pr, and upgrade-project. |
| Skill exercises | Pass | Registered draft-issue and status runner fixtures pass; specialized umbrella Jest fixtures pass. |
| Prompt quality | Pass | Instructions cover success, legacy, ambiguity, API failure, pagination, user decline, partial write, concurrent drift, and post-apply proof with safe argument forms and valid references. |
| Git hygiene | Pass | JavaScript syntax checks and `git diff --check` pass. |

**Gate Summary**: 8/8 passed, 0 failed, 0 incomplete.

---

## Fixes Applied During Review

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| High | Correctness | `scripts/epic-relationships.mjs` | A stale nested sub-issue stub could override a fully hydrated dependency state when records arrived in parent-first order. | Indexed complete top-level issues before merging sparse nested records and added a closed-target regression test. | direct |
| Medium | Performance / Error Handling | `scripts/sdlc-status.mjs`, shared/open-pr contracts | Large target sets could produce unbounded fallback calls, and an unconsumed native sibling page could look complete. | Added 100-target and 8-fallback bounds, five-second fallback calls, page-info detection, fail-closed results, contract requirements, and regression tests. | direct + skill-creator |

---

## Remaining Issues

None.

---

## Positive Observations

- Coordination semantics now have a pure executable core and one shared prompt contract.
- Backward-compatible legacy behavior remains usable while repair is visible and separately authorized.
- Status preserves its observational boundary and stable top-level schema.
- Native relationship authority prevents stale prose from silently shrinking delivery scope.
- Repair instructions preserve exact evidence, concurrency safety, partial-write truth, and idempotence.

---

## Recommendation

**Ready for PR.** All seven acceptance criteria pass, all implementation tasks are complete, all applicable verification gates are green, and no unresolved finding remains.
