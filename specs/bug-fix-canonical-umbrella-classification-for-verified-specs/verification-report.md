# Verification Report: Fix Canonical Umbrella Classification for Verified Specs

**Date**: 2026-08-14
**Issue**: #159
**Reviewer**: Codex
**Scope**: Defect-fix implementation verification against the approved specification

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **4.8** |

**Status**: Pass
**Implementation Status**: defect fix
**Total Remaining Issues**: 0

The original reproduction no longer occurs: a regular lifecycle-owned `verification-report.md` is accepted in parent, publication, and audit modes, while its content remains part of exact Git tree identity. Targeted lookup now filters proven-unrelated candidates before full validation, relevant malformed evidence still fails closed, and audit mode retains valid findings alongside candidate-specific gaps.

## Spec Context

- activeSpec: `specs/bug-fix-canonical-umbrella-classification-for-verified-specs/`
- relatedSpecs:
  - `specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/` (score: strong; reason: explicit Related Spec)
  - `specs/bug-fix-sealed-umbrella-specs-stranded-outside-the-default-branch/` (score: strong; reasons: issue #157 origin and matching classifier paths)
- metadataOnlyCount: 87
- scannedSpecCount: 90
- loadedSpecCount: 3
- gaps: none

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Accept verified umbrella specs in every classifier mode and retain exact identity | Pass | Explicit allowed set in `scripts/umbrella-spec-status.mjs:21`; three-mode and content-identity tests in `scripts/__tests__/umbrella-spec-status.test.mjs:122` and `:141` |
| AC2 | Preserve strict required-file, unknown-entry, symlink, path, and no-mutation validation | Pass | Validation remains fail-closed in `scripts/umbrella-spec-status.mjs:143`; regressions in `scripts/__tests__/umbrella-spec-status.test.mjs:279`, `:312`, `:334`, and `:434` |
| AC3 | Isolate targeted parents while failing closed on relevant malformed evidence | Pass | Frontmatter-first filter and fatal distinction in `scripts/umbrella-spec-status.mjs:186` and `:272`; branch/default regressions in `scripts/__tests__/umbrella-spec-status.test.mjs:350`, `:377`, and `:390` |
| AC4 | Retain valid audit findings with candidate-specific gaps | Pass | Gap aggregation and result preservation in `scripts/umbrella-spec-status.mjs:287` and `:474`; mixed audit regression in `scripts/__tests__/umbrella-spec-status.test.mjs:403` |
| AC5 | Complete later child work without resealing or child-tree equality | Pass | Lifecycle exercise in `scripts/__tests__/exercise-write-spec-epic.test.mjs:133`; contract assertions in `scripts/__tests__/canonical-umbrella-spec-contract.test.mjs:38` and `:61` |
| AC6 | Preserve #157 canonicality and real lifecycle safety | Pass | Full Jest run: 225 passed, 12 intentional skips, 0 failures; existing #157 publication, recovery, divergence, ambiguity, symlink, idempotency, and no-mutation suites remain green |

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Recognize the lifecycle verification report | Complete | Four required blobs retained; one explicit optional regular blob added. |
| T002 | Isolate targeted candidates and audit gaps | Complete | Relevant failures remain fail-closed; unrelated failures no longer poison results. |
| T003 | Add deterministic classifier regressions | Complete | 20 classifier tests pass. |
| T004 | Exercise verified child handoff | Complete | Verified canonical baseline and different child amendment pass without reseal. |
| T005 | Verify the complete defect contract | Complete | Full suite and all applicable repository gates pass. |

---

## Architecture Assessment

### Blast Radius

- **Shared callers**: Parent readiness, spec publication, and upgrade audit all use the changed classifier. Each mode has direct deterministic regression coverage.
- **Public contract**: No CLI arguments, schema version, status values, or existing reason codes changed. Audit gaps now carry additional candidate-local evidence under the existing `audit_complete` outcome.
- **Data behavior**: The exact Git tree remains authoritative. The fix does not discard or reinterpret report content; it makes the recognized report participate in equality.
- **Mutation boundary**: The helper remains read-only apart from its existing object-only fetch. Tests confirm unchanged worktree and refs.

### Review Scores

| Area | Score | Notes |
|------|-------|-------|
| SOLID | 5 | The existing classifier module retains focused parsing, inspection, collection, and mode-classification responsibilities. |
| Security | 5 | Issue input remains numeric, paths remain normalized, Git arguments remain arrays, symlinks and unknown entries remain rejected. |
| Performance | 4 | Targeted scans now skip unrelated tree resolution earlier; bounded ref/path limits remain. The synchronous Git model is unchanged and appropriate for bounded CLI inspection. |
| Testability | 5 | Injected adapters and disposable bare-remotes provide deterministic mode, failure, and no-mutation tests. |
| Error Handling | 5 | Candidate-local gaps and fatal scan failures are explicit, stable, bounded, and exercised independently. |

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Automated Evidence | Passes |
|---------------------|-------------|--------------------|--------|
| AC1 | Yes | Classifier integration tests | Yes |
| AC2 | Yes | Strict tree and no-mutation tests | Yes |
| AC3 | Yes | Targeted branch/default tests | Yes |
| AC4 | Yes | Mixed audit test | Yes |
| AC5 | Yes | Lifecycle and static contract tests | Yes |
| AC6 | Yes | Full #157 regression suite | Yes |

### Coverage Summary

- Defect feature: 6 `@regression` scenarios for 6 acceptance criteria
- Focused suites: 31 tests passed
- Full suite: 225 tests passed; 12 intentional environment/live-only skips; 0 failures
- Regression test quality: the added cases reproduce the previously rejected report, unrelated-candidate poisoning, relevant malformed evidence, and post-verification child handoff

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `cd scripts && npm test -- --runInBand`: 26 suites passed, 225 tests passed, 12 intentional skips |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: clean, 428 items mapped |
| Codex compatibility | Pass | `node scripts/codex-compatibility-check.mjs`: passed |
| Active plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository`: passed |
| Skill creator validation | Not applicable | No skill-bundled file changed |
| Skill exercise | Not applicable | No skill contract changed; deterministic script/lifecycle exercises cover the defect |
| Prompt quality | Not applicable | No prompt contract changed |
| Git hygiene | Pass | `git diff --check`: exit 0 |

**Gate Summary**: 5/5 applicable gates passed, 0 failed, 0 incomplete

---

## Fixes Applied During Verification

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| Medium | Error Handling | `scripts/umbrella-spec-status.mjs` | Malformed default-branch frontmatter claiming the requested parent could evade scoped failure after the initial scan. | Added explicit claim detection and `default_spec_invalid` evidence, plus a regression test. | direct |
| Low | Compatibility | `scripts/umbrella-spec-status.mjs` | An unnecessary new audit reason code would have broadened the public result vocabulary. | Reused the existing `audit_complete` reason while exposing candidate details through `gaps`. | direct |

## Remaining Issues

None.

## Positive Observations

- The fix preserves exact tree identity instead of special-casing the report out of equality.
- Targeted filtering reduces both failure coupling and unnecessary Git tree inspection.
- The audit keeps deterministic ordering and returns complete actionable evidence in one run.
- Existing #157 safety coverage passed unchanged alongside the new verified-lifecycle regression.

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/umbrella-spec-status.mjs` | 0 remaining | Classifier implementation and safety boundaries |
| `scripts/__tests__/umbrella-spec-status.test.mjs` | 0 remaining | Three-mode, strictness, isolation, and audit regressions |
| `scripts/__tests__/exercise-write-spec-epic.test.mjs` | 0 remaining | Verified umbrella and child-amendment lifecycle |
| `scripts/__tests__/canonical-umbrella-spec-contract.test.mjs` | 0 remaining | No-reseal and baseline-not-equality contracts |
| `specs/bug-fix-canonical-umbrella-classification-for-verified-specs/` | 0 remaining | Approved defect requirements, design, tasks, Gherkin, and this report |

## Recommendation

**Ready for PR.** All six acceptance criteria pass, the full test suite and applicable steering gates are green, and no unresolved verification findings remain.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #159 | 2026-08-14 | Initial verification report |
