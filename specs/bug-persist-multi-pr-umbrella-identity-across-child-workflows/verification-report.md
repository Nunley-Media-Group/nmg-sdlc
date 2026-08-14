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
**Total Issues Found During Review**: 38
**Issues Fixed**: 38
**Review Findings Rejected After Verification**: 2
**Remaining Issues**: 0

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Umbrella identity is durable | Pass | The tuple and producer invariants are canonical in `references/epic-relationships.md`; `skills/draft-issue/references/multi-issue.md:309-316` persists child body/label/queue identity and `skills/draft-issue/references/multi-issue.md:353-360` re-fetches and verifies the full relationship; `skills/write-spec/SKILL.md` enforces the same tuple; the fresh-session fixture passes. |
| AC2 | Lifecycle consumers share one classification | Pass | Shared role, parent, identity, consistency, native-authority, degradation, dependency, sibling, and gap fields are defined in `references/epic-relationships.md`; cross-skill contract covers start/spec/code/verify/status/open-pr; `scripts/sdlc-status.mjs` imports and executes the deterministic classifier. |
| AC3 | Genuine dependencies still block | Pass | `scripts/epic-relationships.mjs:185` separates coordination from execution dependencies; unit and lifecycle tests prove an open non-epic sibling blocks while parent #108 does not. |
| AC4 | Canonical specs are not resealed per child | Pass | Write-spec retains the canonical parent gate and child no-reseal handoff; the fresh-session exercise asserts the normal `$nmg-sdlc:write-code #N` next stage and absence of child sealing. |
| AC5 | Sibling discovery uses authoritative relationships | Pass | `scripts/epic-relationships.mjs` reconciles native/checklist sets; `skills/open-pr/references/version-bump.md:37` pages native `subIssues` to exhaustion; status pages both labels and sub-issues for every hydrated active, parent, and alias issue; unit/status tests cover native-only, checklist-only, alias pagination, and fallback states. |
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
| T001 | Add shared durable relationship classifier | Complete | Zero-dependency pure module, shared reference, and focused unit coverage for complete, missing, conflicting, and degraded tuples. |
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

- Feature file: 11 regression scenarios cover all 7 acceptance criteria, including legacy, conflict, ambiguity, native degradation, and partial writes.
- Focused final suite: 63/63 relationship/status/canonical-readiness contract tests passed after final hardening.
- Full final suite: 254 passed, 12 intentional opt-in live-Codex skips, 0 failures (28 suites passed, 3 opt-in suites skipped).
- New direct classifier coverage: durable, legacy, ordinary, real dependency, stale nested stub, incomplete labeled tuples, inconsistent label, unknown target, multiple parents, native authority, and report-only checklist fallback.
- New status coverage: explicit shared fields in text/JSON, incomplete active/parent/alias pagination, 100-target query bound, 8-target fallback bound, read-only behavior, and unchanged lifecycle inference.

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
| Contract tests | Pass | `cd scripts && npm test -- --runInBand`: 254 passed, 12 intentional skips, 0 failures. |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: clean, 439 items mapped. |
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
| High | Identity correctness | classifier, shared contract, producer gates | A matching child label plus only one relationship class could be reported durable. | Durable identity now requires agreeing label, native link, and supported body signal; incomplete tuples are inconsistent or unverifiable and have direct tests. | direct + skill-creator |
| High | Producer correctness | draft-issue and upgrade recovery | The proposed child-side `--add-parent` command is unsupported and inverted. | Native membership writes now use the verified parent-side `gh issue edit P --add-sub-issue C` form and post-write durable proof. | skill-creator |
| High | Pagination correctness | `scripts/sdlc-status.mjs` | Labels or sub-issues on alias-only targets could remain truncated while classification continued. | Every unique hydrated active, parent, and alias issue now pages both connections within a safe bound; any malformed or incomplete page fails closed. | direct |
| High | Shared result consistency | classifier, status, references | Lifecycle consumers lacked explicit consistency, authority, and degradation fields. | Added `consistency`, `nativeAuthority`, and `degraded` to every result and exposed them in status text/JSON and contracts. | direct + skill-creator |
| High | Sibling diagnostics | classifier | Parent-side drift was omitted, while fallback could emit misleading native/checklist mismatches. | Shared diagnostics now report both native drift directions for parents and children, but emit only an authority-degradation warning under checklist fallback. | direct |
| Medium | Recovery completeness | upgrade recovery | A label-only legacy repair could not reach the newly required full durable tuple. | Tightened label repairs to require both relationship classes and added an exact approval-gated missing-body repair alongside missing-native repair. | skill-creator |
| High | Delivery readiness | open-pr versioning | Epic-child PR preparation could classify sibling completion before proving the parent spec canonical on refreshed default. | Added the parent-mode canonical umbrella gate before sibling, version, commit, push, or PR mutation. | skill-creator |
| High | Selection completeness | start-issue relationship hydration | Candidate sub-issue and label connections could be truncated, and native pairs were described as directly populating blockers before coordination classification. | Added bounded cursor pagination with fail-closed evidence and made `parentsOf` derive only from classified execution dependencies. | skill-creator |
| High | Producer relationship integrity | draft-issue multi-issue batch | Ordinary DAG edges were eligible for native parent writes even though GitHub provides one native parent and those edges are execution prerequisites. | Reserved native parent writes for synthesized epic membership, kept ordinary DAG edges in body dependencies, and required a fresh complete edge-set comparison. | skill-creator |
| High | Producer sequencing | draft-issue multi-issue batch | The native-link phase could run before epic fan-out populated its membership queue, and queue ownership was absent from the formal state model. | Reordered the batch into prepare, probe, write, body resolution, and complete re-fetch phases; initialized the queue explicitly and assigned one append owner. | skill-creator |
| High | Native authority | classifier and shared contract | Native discovery failure could still produce legacy or epic identity, and checklist fallback could appear mutation-capable. | Native failure now yields `unverifiable`; fallback is report-only and blocks completion, versioning, delivery, and all consuming mutation. | direct + skill-creator |
| High | Nested dependency integrity | draft-issue epic fan-out | Child prerequisites had no child-scoped DAG after preserving the outer immutable session DAG. | Added a step-local per-epic child DAG used for deterministic child ordering, sibling body placeholders, and final edge verification without mutating the outer graph. | skill-creator |
| High | Audit and entry completeness | upgrade-project and write-spec | Partial issue-graph pages could look clean, and canonical parent-spec proof could outlive conflicting child identity fields. | Upgrade now proves full paginated graph hydration; write-spec uses an explicit identity/consistency/authority matrix before accepting canonical parent readiness. | skill-creator |
| High | Non-happy-path coverage | requirements, Gherkin, and contracts | Legacy, conflict, degradation, ambiguity, unverifiability, and partial writes were not all explicit lifecycle scenarios. | Expanded AC7 with four regression scenarios and contract assertions for exact evidence preservation, safe stopping, no replacement child, and idempotent rerun. | direct |
| High | Nested producer inputs | draft-issue Step 6 and multi-issue flow | The child-scoped DAG and epic membership source were not explicitly distinct at the nested Per-Issue Loop boundary. | Added read-only `activeDag` plus separate `coordinationParentNumber` inputs, aligned body generation and placeholder resolution, corrected step references, and removed an unused output field. | skill-creator |
| High | Nested batch isolation | draft-issue multi-issue flow | Reused plan IDs could cross-resolve between outer and child batches, child fan-out could overwrite the outer plan, and abandoned endpoints were counted as missing concrete edges. | Added collision-safe `scopeId`, child-local plans/DAGs, same-scope placeholder lookup, independent per-epic summary inputs, and planned-marker accounting distinct from concrete edges. | skill-creator |
| Low | Documentation / evidence | tasks, verification, and upgrade reporting | One unchanged exercise path remained in task scope, task/report metadata and one evidence anchor were stale, a command fence was untyped, and preserved unverifiable findings were unnamed. | Removed the unchanged path, marked tasks complete, refreshed the evidence anchor, typed the Bash fences, and added the exact preserved-unverifiable outcome. | direct + skill-creator |

---

## Remaining Issues

None.

## Rejected Review Finding

- A local review claimed `scripts/__tests__/epic-relationships.test.mjs:182-193` contained duplicated trailing content. Direct inspection shows one complete, distinct regression test for hydrated target precedence, JavaScript syntax is valid, and the assertion passes in focused and full suites. Removing it would delete required regression coverage, so no code change was made for that finding.
- A later local review claimed this report contained duplicate Positive Observations and Recommendation tails. Direct inspection of the complete file shows exactly one of each section, so no content was removed.

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
