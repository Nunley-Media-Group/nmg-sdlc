# Verification Report: Make per-test coverage outcome ids independent of the test file

**Date**: 2026-11-23
**Issue**: #590
**Reviewer**: Claude (nmg-sdlc verify worker, gate phase)
**Scope**: Implementation verification against spec

**Verification head**: 2f36ea25acaabc0a6d96fbdf89153f007aefcd85

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | 4.8 |

### Implementation Status: Pass
**Total Issues**: 0 blocking/major/minor (2 info notes carried from the review)

`scripts/jest-per-test-coverage.mjs` now reports each assertion outcome as `<it title>:<status>` and a suite that fails to run as `(suite):failed`, so a doc test moved into an `@SCN`-tagged bdd test in another file reproduces the same outcomes and the unchanged test-layer gate accepts the conversion. The review of this source passed (full mode, every row `pass`, no finding above `info`), and the pre-merge steering gate passed at the verification head with complete coverage.

---

## Issue Scope

- Active issue: #590
- Spec: `specs/590-make-per-test-coverage-outcome-ids-independent-of-the-test-file-so-the-test-layer-gate-can-accept-cross-file-conversions`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3, FR4, FR5]; tasks [T001, T002]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: none

<!-- nmg-sdlc-issue-scope: {"issueNumber":590,"specPath":"specs/590-make-per-test-coverage-outcome-ids-independent-of-the-test-file-so-the-test-layer-gate-can-accept-cross-file-conversions","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5"],"tasks":["T001","T002"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

### Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact

- Artifact: `.nmg-sdlc/verification/590.json`, tier `pre-merge`, base `main`, head `2f36ea25acaabc0a6d96fbdf89153f007aefcd85`, tree clean
- Coverage: declared 4, recorded 4, complete `true`; missing/duplicate/unknown none
- Ceiling: none
- Selection: `claude:haiku` at `xhigh`, reason `selected`, tests `scripts/__tests__/jest-per-test-coverage.test.mjs`, `scripts/__tests__/repository-surfaces.test.mjs`, `scripts/__tests__/upgrade-test-layers.test.mjs`; surfaces none; required surfaces none; rejection none

---

## Acceptance Criteria

Evidence comes from the review record `.nmg-sdlc/verification/590-review.json`. No criterion's tests mock the path under test: every AC was exercised through the real entry point (`collect()`, `gateBatch`, `computeCandidates`).

- [x] AC1: Outcome ids do not depend on the test file — `scripts/jest-per-test-coverage.mjs:166,170`; `@SCN001` plus a real CLI probe; a mutation probe with the main source fails all six scenario tests (real_entry_point)
- [x] AC2: A cross-file doc→bdd conversion passes the gate — `@SCN002` feeds `collect()` output to the real `gateBatch` (`scripts/upgrade-test-layers.mjs`), status accepted (real_entry_point)
- [x] AC3: Dropping an asserted outcome is still refused — `@SCN003`: `test_layers_coverage_gap` with `gap.outcomes` listing exactly the missing outcome (real_entry_point)
- [x] AC4: Candidates label a cross-file covered test as duplicate — `@SCN004`: `computeCandidates` returns the doc test as `duplicate` covered by the bdd test (real_entry_point)

### Functional Requirements

- [x] FR1 — `assertion.title`, no path or describe prefix (`scripts/jest-per-test-coverage.mjs:170`)
- [x] FR2 — `(suite):failed` with `failed=true` (`scripts/jest-per-test-coverage.mjs:165-168`)
- [x] FR3 — header comment documents the format (`scripts/jest-per-test-coverage.mjs:22-24`)
- [x] FR4 — `gateBatch` refusal unchanged (`scripts/upgrade-test-layers.mjs:390-395`), proven by `@SCN003`
- [x] FR5 — `@SCN002` and `@SCN004`

### Regression Obligations

None declared.

---

## Architecture Review

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID Principles | 5 | Single-site change in `collect()`; consumers treat outcomes as opaque strings |
| Security | 5 | No new input surface; no shell or path handling changed |
| Performance | 5 | Same per-assertion loop |
| Testability | 5 | Scenario tests drive real `collect()`, `gateBatch`, `computeCandidates`; mutation probe confirms they fail on the old behaviour |
| Error Handling | 4 | Suite-failure and failed-assertion paths preserved; title-only ids weaken outcome uniqueness (info F1) |

Consumers checked (review rows C1-C6): `scripts/upgrade-test-layers.mjs`, `src/test-coverage.mjs`, `scripts/__tests__/repository-surfaces.test.mjs` (`@SCN013` updated for the new format), `steering/test-coverage.json`, `README.md` and `workflows/upgrade-project/references/test-layer-migration.md` (format described generically, no drift), and `CHANGELOG.md` (`[Unreleased]` bullet ends with `(#590)`).

---

## Test Coverage

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | `@SCN001` | `scripts/__tests__/jest-per-test-coverage.test.mjs` | Implemented |
| AC2 | `@SCN002` | `scripts/__tests__/jest-per-test-coverage.test.mjs` | Implemented |
| AC3 | `@SCN003` | `scripts/__tests__/jest-per-test-coverage.test.mjs` | Implemented |
| AC4 | `@SCN004` | `scripts/__tests__/jest-per-test-coverage.test.mjs` | Implemented |

- Test-layer findings: none. The project keeps only `bdd`; the new tests are scenario implementations citing their `@SCN` tags, and the `repository-surfaces.test.mjs` change updates an existing scenario's assertion to the new format.
- Test execution: Pass

---

## Steering Doc Verification Gates

| Validation | Tier | Selection | Status | Evidence |
|------------|------|-----------|--------|----------|
| `repository.tests` | change | `claude:haiku`, `selected`, 3 tests | Pass | `npm test -- --runInBand` with the 3 selected tests exited 0: 3 suites, 50 tests passed (`.nmg-sdlc/verification/590/repository.tests.log`); per-test coverage hit all 5 changed executable lines (`scripts/jest-per-test-coverage.mjs:22,23,24,166,170`), 0 uncovered |
| `repository.nmg-sdlc-smoke` | — | `surface_not_selected` | Pass | No smoke surface selected: the change touches only `scripts/` and version/doc files, so no interactive surface or `execute` exercise applies |
| `repository.tests.full` | full | — | Skipped (pre-merge) | Runs under `/sdlc-verify-full` |
| `repository.nmg-sdlc-smoke.full` | full | — | Skipped (pre-merge) | Runs under `/sdlc-verify-full` |

**Gate Summary**: 2/2 applicable passed, 0 failed, 0 incomplete; 2 full-tier validations recorded as skipped before merge.

Smoke lifecycle: not required for this change (no smoke surface selected); no provisioning or surface exercise was run.

---

## Fixes Applied

None in this phase. The gate phase does not edit source.

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| info | Error handling | `scripts/jest-per-test-coverage.mjs` | Title-only outcome ids let a same-titled kept `it` reproduce a removed outcome, and same-titled `it`s in one file collapse into one outcome; lines and branches still guard | The tradeoff the approved design selected |
| info | Compatibility | `scripts/upgrade-test-layers.mjs` | A test-layers baseline recorded before this change holds old per-file outcome counts, so `test-layers-report` could flag an outcome regression against it | No such baseline exists in this repository; informational |

## Recommendation

Ready for PR.
