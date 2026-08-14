# Verification Report: Require Deliverable Dependencies in Multi-PR Child Plans

**Date**: 2026-08-14
**Issue**: #163
**Reviewer**: Codex
**Scope**: Defect-fix implementation verification against the approved specification

<!-- nmg-sdlc-issue-scope: {"issueNumber":163,"specPath":"specs/bug-require-deliverable-dependencies-in-multi-pr-child-plans","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

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
| **Overall** | **5.0** |

**Status**: Pass
**Implementation Status**: defect fix
**Total Remaining Issues**: 0

The reproduction is closed by one shared fail-closed classifier and consistent planning, start, status, and recovery contracts. A downstream child is now ready only when its structured prerequisite has a whole-issue execution edge and a closing pull request merged to the live default branch. The independent-branch exercise proves that the prerequisite is absent before merge, readiness is blocked, and a newly created consumer branch can read the artifact after merge.

## Spec Context

- activeSpec: `specs/bug-require-deliverable-dependencies-in-multi-pr-child-plans/`
- relatedSpecs:
  - `specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/` (score: strong; reason: explicit Related Spec and matching epic/multi-PR planning contracts)
- metadataOnlyCount: 92
- scannedSpecCount: 94
- loadedSpecCount: 2
- gaps: none

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Detect sibling-owned task and artifact prerequisites | Pass | Planning inventory and detection rules in `references/deliverable-dependencies.md:65` and consumer assertions in `scripts/__tests__/deliverable-dependency-contract.test.mjs:36` |
| AC2 | Require a real deliverable boundary | Pass | Whole-issue and extracted-baseline shapes in `references/deliverable-dependencies.md:33`; midpoint-only plans stop before creation at `:42` |
| AC3 | Keep spec ownership, child records, and execution edges consistent | Pass | Planning postcondition in `references/deliverable-dependencies.md:67` and cross-consumer contract test at `scripts/__tests__/deliverable-dependency-contract.test.mjs:36` |
| AC4 | Report ready only after merged default-branch delivery | Pass | Classifier in `scripts/deliverable-dependencies.mjs:175`, start/status behavior in `references/deliverable-dependencies.md:77`, and fail-closed unit coverage in `scripts/__tests__/deliverable-dependencies.test.mjs:87` |
| AC5 | Audit existing prose-only plans | Pass | Bounded candidate discovery and report-only ambiguity rules in `skills/upgrade-project/references/deliverable-dependency-recovery.md:20` |
| AC6 | Apply only approved, drift-free, idempotent manual repairs | Pass | Exact proposal, full snapshot revalidation, manual line-edit handoff, post-edit verification, and second-run proof in `skills/upgrade-project/references/deliverable-dependency-recovery.md`; contract assertions in `scripts/__tests__/deliverable-dependency-contract.test.mjs` |
| AC7 | Exercise independent branch availability | Pass | Disposable Git exercise proves blocked-before-merge and readable-after-merge behavior in `scripts/__tests__/deliverable-dependency-contract.test.mjs:70` |

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add the shared contract and classifier | Complete | Bounded parser, stable statuses/reason codes, merged-default-branch proof, and shared reference implemented. |
| T002 | Enforce planning and readiness boundaries | Complete | Draft, write-spec, start, status, and status CLI consume one contract; epic coordination identity remains separate. |
| T003 | Add initialized-project audit and repair | Complete | Audit is bounded; the manual handoff is exact, approval-scoped, fully revalidated, post-edit checked, and idempotent without an unconditional full-body overwrite. |
| T004 | Add regression, exercise, docs, and evidence | Complete | Seven scenarios, focused/full tests, branch exercise, README, changelog, and inventory updates are present. |

---

## Architecture Assessment

### Blast Radius

- **Shared callers**: `draft-issue`, `write-spec`, `start-issue`, `status`, and `upgrade-project` consume the same record/result contract.
- **Public contract**: `status` adds `issue.deliverableDependencies`; ordinary issues retain `status: none` and their prior readiness behavior.
- **Data behavior**: issue closure alone no longer implies artifact availability. Malformed, incomplete, or contradictory GitHub evidence fails closed.
- **Mutation boundary**: planning and status paths are non-mutating at failure; upgrade renders only an exact preapproved manual line-edit handoff and never performs an unconditional issue-body overwrite without documented server-side compare-and-set.

### Review Scores

| Area | Score | Notes |
|------|-------|-------|
| SOLID | 5 | The pure classifier owns parsing/classification; each skill reference owns only its lifecycle stage; shared semantics are not duplicated. |
| Security | 5 | Inputs are bounded and validated, issue numbers are positive integers, GraphQL values use arguments, issue text is never executed, and recovery avoids the revalidation-to-full-body-write race. |
| Performance | 5 | Body, requirement, page, issue, and request counts are bounded; no new runtime dependency or unbounded scan was introduced. |
| Testability | 5 | Pure inputs, stable result codes, injected status adapters, fixtures, and a disposable Git repository cover success and failure states deterministically. |
| Error Handling | 5 | Missing targets, malformed states/merges, incomplete pagination, drift, and partial graphs return named fail-closed gaps without silent fallback. |

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Scenario | Automated Evidence | Passes |
|---------------------|----------|--------------------|--------|
| AC1 | SCN001 | Planning contract assertions | Yes |
| AC2 | SCN002 | Boundary contract assertions | Yes |
| AC3 | SCN003 | Cross-consumer record/edge assertions | Yes |
| AC4 | SCN004 | Classifier and status tests | Yes |
| AC5 | SCN005 | Recovery contract assertions | Yes |
| AC6 | SCN006 | Exact repair/idempotence assertions | Yes |
| AC7 | SCN007 | Disposable independent-branch exercise | Yes |

### Coverage Summary

- Defect feature: 7 stable `@SCN... @regression` scenarios for 7 acceptance criteria
- Review-focused suites: 5 suites and 78 tests passed
- Full suite: 33 suites passed, 3 environment/live-only suites skipped; 322 tests passed, 12 intentional skips, 0 failures
- Regression states: no requirement, ready, open owner, missing edge, coordination-only evidence, manual closure, unmerged/wrong-base PR, malformed merge evidence, incomplete pagination, cross-repository records, case-distinct descriptions, complete early-error schemas, failed issue hydration, manual audit/repair contracts, and independent branch availability

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skills Exercised** | `draft-issue`, `status`, plus deterministic write-spec and independent-branch Jest exercises |
| **Method** | Repository skill-exercise runner and disposable deterministic fixtures |
| **Decision-gate Handling** | N/A; these deterministic exercise paths do not make live GitHub mutations or require an unanswered decision |
| **Result** | `draft-issue`: 13 pass, 0 fail, 1 not-applicable skip; `status`: 14 pass, 0 fail; independent-branch contract: pass |

The generic skill-exercise runner has no fixture directories for `write-spec`, `start-issue`, or `upgrade-project`. This is recorded as an evidence limitation rather than an implicit pass. The full Jest suite supplies deterministic `write-spec` exercise coverage, and the new contract/branch suites directly cover start and upgrade behavior required by #163. No installed-plugin or published-release behavior is claimed by this local-source report.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `cd scripts && npm test`: 33 suites passed; 322 tests passed; 12 intentional skips; 0 failures |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: clean, 453 items mapped |
| Codex compatibility | Pass | `node scripts/codex-compatibility-check.mjs`: passed |
| Active plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository`: passed |
| Skill creator validation | Pass | `quick_validate.py` passed for `draft-issue`, `write-spec`, `start-issue`, `status`, and `upgrade-project` |
| Skill exercise | Pass | Every changed skill with an existing deterministic runner fixture passed; missing generic fixtures are named above and alternative deterministic coverage is green |
| Prompt quality | Pass | Changed contracts are bounded, ordered, preserve explicit gates, cover success/failure/decline paths, use valid references, and satisfy downstream postconditions |
| Git hygiene | Pass | `git diff --check`: exit 0; changed scripts pass `node --check`; issue-scope resolver reports no gaps |

**Gate Summary**: 8/8 applicable gates passed, 0 failed, 0 incomplete

---

## Fixes Applied During Verification

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| Medium | Error Handling | `scripts/deliverable-dependencies.mjs` | A connection object without explicit pagination metadata, or an owner with an unknown state, could leave evidence completeness ambiguous. | Require `pageInfo.hasNextPage` to be boolean and owner state to be `OPEN` or `CLOSED`; return `unverifiable` otherwise and add focused regressions. | direct |
| Low | Compatibility | `skills/draft-issue/references/multi-issue.md` | An established exact invariant sentence used by the epic contract suite was lost during the planning-contract extension. | Restored the invariant verbatim while retaining the new deliverable-boundary rules. | `skill-creator` |
| Low | Parsing | `scripts/deliverable-dependencies.mjs` | Recognized cross-repository prerequisite bullets were treated as malformed local records. | Ignore bounded owner/repository and GitHub issue forms before local-record validation; add regression coverage. | direct |
| Low | Data Integrity | `scripts/deliverable-dependencies.mjs` | Case-folded deduplication removed case-distinct artifact descriptions. | Deduplicate only unchanged case-sensitive owner/description pairs and test both values. | direct |
| High | Result Contract | `scripts/deliverable-dependencies.mjs` | Early error paths returned raw requirement objects without stable availability fields. | Normalize every parsed requirement before any return and assert complete schemas for default-branch, relationship, and self-reference errors. | direct |
| High | Fail-Closed Status | `scripts/sdlc-status.mjs` | Failed active-issue hydration left deliverables nullable and could advance an issue whose body actually declared prerequisites. | Initialize an `unverifiable` sentinel, block lifecycle inference, and update deterministic status tests/exercises. | direct |
| High | Planning Boundary | `skills/draft-issue/references/multi-issue.md` | Baseline extraction could revise the active split without a separate reviewed plan or guaranteed structured record. | Stop with a separate draft/spec proposal; later approved plans must persist `boundary: "baseline"` records before drafting. | `skill-creator` |
| High | Concurrency Safety | `skills/upgrade-project/references/deliverable-dependency-recovery.md` | Revalidation followed by unconditional full-body edit left a compare-and-set race. | Capture the full ownership/body/label/state/relationship/default/merge snapshot and render a manual line-edit handoff; verify only after operator confirmation. | `skill-creator` |
| Low | Compatibility Contract | `specs/bug-require-deliverable-dependencies-in-multi-pr-child-plans/` | Legacy audit heuristics did not explicitly state their pre-repair readiness behavior. | Clarified that legacy prose remains audit-only and does not gate start/status until approved structured repair. | direct |
| Low | Specification Accuracy | `specs/bug-require-deliverable-dependencies-in-multi-pr-child-plans/requirements.md` | Expected behavior implied an open owner made the plan invalid rather than truthfully blocked. | State that merged evidence gates `ready`; a valid graph may remain `blocked`. | direct |

## Remaining Issues

None.

## Positive Observations

- The classifier is pure, zero-dependency, deterministic, and independently testable.
- Coordination membership and execution dependency identity remain deliberately separate.
- Availability proof uses the repository's live default branch and merge commit, preventing manual closure or wrong-base delivery from appearing ready.
- Recovery is deliberately narrower than detection: ambiguous legacy prose is reported but never silently converted into authority.
- The disposable Git exercise validates the actual branch-point property, not only Markdown wording.

## Files Reviewed

| Area | Issues | Notes |
|------|--------|-------|
| `scripts/deliverable-dependencies.mjs` and status integration | 0 remaining | Parser, classifier, GraphQL hydration, lifecycle projection |
| Planning/start/status/upgrade skill contracts | 0 remaining | Shared semantics and stage-specific behavior |
| Deliverable dependency references | 0 remaining | Authoring, audit, repair, bounds, and idempotence |
| Jest tests and fixtures | 0 remaining | 78 review-focused and 322 full-suite passes |
| README, changelog, inventory, and #163 spec | 0 remaining | Public behavior and delivery evidence synchronized |

## Recommendation

**Ready for PR.** All seven acceptance criteria and four tasks pass, every applicable steering gate is green, the exercise limitation is explicitly bounded to absent generic fixtures, and no unresolved verification finding remains.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #163 | 2026-08-14 | Initial verification report |
