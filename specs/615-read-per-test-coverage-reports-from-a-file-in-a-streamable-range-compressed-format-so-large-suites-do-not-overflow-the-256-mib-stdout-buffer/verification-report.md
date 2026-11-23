# Verification Report: Read per-test coverage reports from a file in a streamable, range-compressed format

**Date**: 2026-11-23
**Issue**: #615
**Reviewer**: Claude (nmg-sdlc verify worker, gate phase)
**Scope**: Pre-merge gate at the merge-queue head
**Verification head**: ead407fcc57d260a2d73fab21c85c085419facf6

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | 4.7 |

### Implementation Status: Pass
**Total Issues**: 0 blocking, 0 major, 0 minor; 4 info-level review notes

The review of this source passed (record `.nmg-sdlc/verification/615-review.json`, scoped review at `ead407f`, no finding above `info`, no criterion with mocked tests). The pre-merge gate ran once at `ead407fcc57d260a2d73fab21c85c085419facf6`. Both applicable required validations passed: the 17 selected test suites (468 tests) passed and their per-test coverage hit every changed executable line, and the live smoke run exercised `upgrade-project` and `steering` and delivered smoke issue #368 end to end. Coverage of declared validations is complete (4 of 4 recorded). The previous gate's `selection_uncovered` rejection is resolved by commit `ead407f`, which covers the v2 reader's error branches and the `coveredBy` fallback in-process.

---

## Issue Scope

- Active issue: #615
- Spec: `specs/615-read-per-test-coverage-reports-from-a-file-in-a-streamable-range-compressed-format-so-large-suites-do-not-overflow-the-256-mib-stdout-buffer`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6]; FR [FR1–FR7]; tasks [T001–T005]; scenarios [SCN001–SCN006]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":615,"specPath":"specs/615-read-per-test-coverage-reports-from-a-file-in-a-streamable-range-compressed-format-so-large-suites-do-not-overflow-the-256-mib-stdout-buffer","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7"],"tasks":["T001","T002","T003","T004","T005"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/615.json` at head `ead407fcc57d260a2d73fab21c85c085419facf6` (steering `sha256:8f9a99e3…`, spec `sha256:512016dd…`)
- Coverage: declared 4, recorded 4, complete `true`
- Ceiling: none
- Selection: mode `selected`, reason `selected`, model `haiku` at `xhigh`, 17 tests; surfaces `shared-references`, `upgrade-project`, `steering`, `execute`, `verify-full`; required surfaces `upgrade-project`, `shared-references` (both selected); rejection: none

---

## Acceptance Criteria Verification

From the passed review record (`.nmg-sdlc/verification/615-review.md`, reviewed head `ead407f`).

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | A >256 MiB v2 report written to `NMG_SDLC_COVERAGE_OUTPUT` is read and the batch proceeds | Pass | `scripts/__tests__/coverage-report-v2.test.mjs` @SCN001, real child coverage process; `scripts/upgrade-test-layers.mjs`; `src/test-coverage.mjs` `readCoverageRun` |
| AC2 | A v1 report on stdout keeps working unchanged | Pass | `coverage-report-v2.test.mjs` @SCN002; v1 fallback in `src/test-coverage.mjs` |
| AC3 | Malformed v2 lines are refused with a line number | Pass | `coverage-report-v2.test.mjs` @SCN003; `lineError` in `src/test-coverage.mjs` |
| AC4 | v1 and v2 of the same coverage give identical decisions | Pass | `coverage-report-v2.test.mjs` @SCN004 |
| AC5 | Large suites keep begin state in a sidecar and no huge string is built | Pass | `coverage-report-v2.test.mjs` @SCN005 |
| AC6 | References document the v2 format and the v1 fallback | Pass | `coverage-report-v2.test.mjs` @SCN006; `references/verification-scope.md`, `references/steering-schema.md`, `workflows/upgrade-project/references/test-layer-migration.md` |

Every acceptance criterion is exercised through its real entry point. No criterion's tests mock the path under test (`mockedEntryPoints` is empty).

## Task Completion

| Task | Status | Notes |
|------|--------|-------|
| T001 | Complete | v2 reader and compact range model in `src/test-coverage.mjs` |
| T002 | Complete | Upgrade begin/gate sidecar in `scripts/upgrade-test-layers.mjs` |
| T003 | Complete | Gate coverage check reads the output file in `src/sdlc-verification-runtime.mjs` |
| T004 | Complete | References, README, CHANGELOG (bullet ends with `(#615)`) |
| T005 | Complete | `scripts/__tests__/coverage-report-v2.test.mjs` scenarios, extended in `ead407f` to cover error branches in-process |

---

## Architecture Assessment

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID | 4 | Reader, range model and consumers are separated; `src/test-coverage.mjs` grew large |
| Security | 5 | Output in a private `mkdtemp` directory; symlinked/directory output refused; path rule enforced; `__proto__` keys stored as own properties |
| Performance | 5 | 1 MiB chunked streaming reads; range compression; per-line sidecar writes; no huge string built |
| Testability | 5 | Real child-process scenarios plus in-process coverage of the error branches; every changed executable line hit by the selected tests |
| Error Handling | 4 | Line-numbered refusals; a manually deleted v2 sidecar throws an uncaught ENOENT (F2, info) |

---

## Test Coverage

### Scenario Coverage

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | `@SCN001` | `scripts/__tests__/coverage-report-v2.test.mjs` | Implemented |
| AC2 | `@SCN002` | `scripts/__tests__/coverage-report-v2.test.mjs` | Implemented |
| AC3 | `@SCN003` | `scripts/__tests__/coverage-report-v2.test.mjs` | Implemented |
| AC4 | `@SCN004` | `scripts/__tests__/coverage-report-v2.test.mjs` | Implemented |
| AC5 | `@SCN005` | `scripts/__tests__/coverage-report-v2.test.mjs` | Implemented |
| AC6 | `@SCN006` | `scripts/__tests__/coverage-report-v2.test.mjs` | Implemented |

### Test-Layer Findings

Kept test types: `bdd`. Among the test files the branch added or changed:

- Duplicate: none
- Non-kept type: none (edits to `jest-per-test-coverage.test.mjs`, `repository-surfaces.test.mjs` and `test-selection-gate.test.mjs` adapt existing scenario tests)
- Justified: none
- Test execution: Pass

---

## Steering Doc Verification Gates

| Gate | Tier | Selection | Status | Evidence |
|------|------|-----------|--------|----------|
| `repository.tests` | change | `claude:haiku`, selected, 17 tests | Pass | `npm test -- --runInBand <17 selected>` exited 0: 17 suites, 468 tests passed; per-test coverage: every changed executable line hit, 0 uncovered (log `.nmg-sdlc/verification/615/repository.tests.log`) |
| `repository.nmg-sdlc-smoke` | — | surfaces `upgrade-project`, `steering`, `execute` | Pass | Surfaces exercised live at `ead407f`; smoke issue #368 delivered: PR Nunley-Media-Group/nmg-sdlc-smoke#370 `MERGED` at `81c1079abf4fddca0b1a943934306c4e3198dc3d`, issue `CLOSED` |
| `repository.tests.full` | full | — | Skipped before merge | `/sdlc-verify-full` runs it on demand |
| `repository.nmg-sdlc-smoke.full` | full | — | Skipped before merge | `/sdlc-verify-full` runs it on demand |

**Gate Summary**: 2/2 applicable gates passed, 0 failed, 0 incomplete

---

## Exercise Test Results (Smoke Surfaces)

Live surface exercises ran at head `ead407fcc57d260a2d73fab21c85c085419facf6` before the gate, each in an interactive `claude --plugin-dir <checkout>` session in detached tmux against a fresh clone of `Nunley-Media-Group/nmg-sdlc-smoke`:

| Surface | Command | Result | Record |
|---------|---------|--------|--------|
| `steering` | `/sdlc-steering add sdlc-verify-code and sdlc-open-pr as consumers of the project.tech snippet` | passed: plan approved → apply → validate; only `steering/manifest.json` changed in the clone; no remote mutation | `.nmg-sdlc/smoke/surfaces/steering.json` |
| `upgrade-project` | `/sdlc-upgrade-project` | passed: detect → interview (models defaults, kept `bdd,unit`, verification scope) → plan → apply; smoke pytest 1109 passed; `spec-created` backfill was a no-op | `.nmg-sdlc/smoke/surfaces/upgrade-project.json` |
| `execute` | gate-run `/sdlc-execute #368` (reused provisioned issue #368, spec PR #369 merged) | passed: PR #370 merged at the recorded delivery head, issue #368 closed | `.nmg-sdlc/verification/615.json` |

Note: inside `/sdlc-steering`, auto mode blocked one combined plan-extract/apply shell command and the session recovered by writing the plan file and running the two steps separately, as the workflow allows. Environmental, not an nmg-sdlc defect.

---

## Fixes Applied

None in this gate phase.

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Info | Testing | `scripts/__tests__/coverage-report-v2.test.mjs` | F1: no test gates a legacy version 1 begin record | Review info note; probe-verified |
| Info | Error Handling | `scripts/upgrade-test-layers.mjs` | F2: missing v2 sidecar throws uncaught ENOENT | Reachable only by manual deletion |
| Info | Error Handling | `scripts/upgrade-test-layers.mjs`, `src/sdlc-verification-runtime.mjs` | F3: `mkdtemp` failure handling and temp-dir removal untested | Review info note |
| Info | Testing | `scripts/__tests__/coverage-report-v2.test.mjs` | F4: error-branch tests filed under @SCN003 | Review info note |

## Recommendation

**Ready for PR**: the review passed and every applicable pre-merge validation passed at the exact head.
