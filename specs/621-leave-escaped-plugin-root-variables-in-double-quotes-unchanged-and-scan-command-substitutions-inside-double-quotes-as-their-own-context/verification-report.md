# Verification Report: Leave escaped plugin-root variables in double quotes unchanged and scan command substitutions inside double quotes as their own context

**Date**: 2026-11-26
**Issue**: #621
**Reviewer**: Claude Code (nmg-sdlc verify worker, gate phase)
**Scope**: Implementation verification against spec
**Verification head**: dd226dc9602d1791fd70bbea42b40d52aa6a1d9a

---

## Executive Summary

The review of source head `13fbaadf34ee7759bcc1ee0b40019f1f2b08583e` passed with no finding above `info`. The gate ran once at the merge-queue head `dd226dc9602d1791fd70bbea42b40d52aa6a1d9a`, which adds only the delivery version commit (`VERSION`, `package.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md`) on top of the reviewed source. Every applicable required validation passed and coverage of the registered validations is complete.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | 4.7 |

### Implementation Status: Pass
**Total Issues**: 1 (info only)

---

## Issue Scope

- Active issue: #621
- Spec: `specs/621-leave-escaped-plugin-root-variables-in-double-quotes-unchanged-and-scan-command-substitutions-inside-double-quotes-as-their-own-context`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5]; FR [FR1, FR2, FR3]; tasks [T001, T002]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":621,"specPath":"specs/621-leave-escaped-plugin-root-variables-in-double-quotes-unchanged-and-scan-command-substitutions-inside-double-quotes-as-their-own-context","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3"],"tasks":["T001","T002"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact

- Artifact: `.nmg-sdlc/verification/621.json`, tier `pre-merge`, ceiling `null`
- Identity: head `dd226dc9602d1791fd70bbea42b40d52aa6a1d9a`, tree clean
- Coverage: declared 4, recorded 4, complete `true`, no missing, duplicate or unknown results
- Selection: `claude:haiku` at `xhigh`, mode `selected`, reason `selected`, no fallback path, no rejection, guidance not supplied. Surfaces `plugin-host`, `execute`. Tests: `plugin-root-nested-context`, `plugin-root-materialization`, `rendered-plugin-root`, `plugin-controller-path`, `execute-host`.

---

## Acceptance Criteria Verification

All acceptance criteria are exercised through the real entry point (`materializePluginRootCommand` / `materializePluginRootToolInput`); no criterion's tests mock the path under test.

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | An escaped variable inside double quotes is left unchanged | Pass | `src/host-events.mjs` `scanDoubleQuoted` copies `\$`, `\"`, `\\` as pairs; `@SCN001` passes and fails against main's module |
| AC2 | Inner double quotes inside a substitution stay one word | Pass | `scanSubstitution` -> nested `scanCommand`; `@SCN002` passes, fails against main |
| AC3 | Inner single quotes inside a substitution keep balanced quoting | Pass | nested `scanSingleQuoted` splices `'\''`; `@SCN003` passes, fails against main |
| AC4 | Unquoted operands inside a substitution follow the unquoted rules | Pass | nested operand rewrite; `@SCN004` (4 cases) passes, all fail against main |
| AC5 | Existing rewrites are preserved | Pass | `@SCN005` table (11 cases) passes on branch and main; #604 scenarios in `plugin-root-materialization.test.mjs` pass; repository-wide differential shows no output change |

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | odd vs even backslash probes behave as specified |
| FR2 | Pass | nested context ends at the matching depth-0 `)`; unmatched `$(` falls back to plain double-quoted text |
| FR3 | Pass | #604 scenarios unchanged and passing |

Design paths DP1-DP5 (unclosed double quote, unmatched `$(`, escape pairs, no-placeholder early return, nested recursion) and consumers C1-C4 (`hooks/register.ts`, `src/sdlc-commands.mjs`, `src/host-events.d.mts`, documentation) all passed review.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Scan double-quoted segments with escape pairs and nested substitutions | Complete | `src/host-events.mjs` |
| T002 | Implement the Regression Scenarios | Complete | `scripts/__tests__/plugin-root-nested-context.test.mjs` |

---

## Architecture Assessment

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID | 5 | Scanner split into single-purpose context scanners; public signature unchanged |
| Security | 5 | Single-quote splicing keeps balanced quoting; no new shell evaluation |
| Performance | 4 | Memoized by start index; 3000 nested levels in 281 ms |
| Testability | 5 | Pure function, scenario tests drive the real entry point |
| Error Handling | 4 | Unbalanced input falls back to prior behaviour; see F1 (info) |

`src/host-events.mjs` still imports no Node built-ins, preserving the hooks-module boundary.

---

## Test Coverage

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | `@SCN001` | `scripts/__tests__/plugin-root-nested-context.test.mjs` | Implemented |
| AC2 | `@SCN002` | `scripts/__tests__/plugin-root-nested-context.test.mjs` | Implemented |
| AC3 | `@SCN003` | `scripts/__tests__/plugin-root-nested-context.test.mjs` | Implemented |
| AC4 | `@SCN004` | `scripts/__tests__/plugin-root-nested-context.test.mjs` | Implemented |
| AC5 | `@SCN005` | `scripts/__tests__/plugin-root-nested-context.test.mjs` | Implemented |

Kept test types: `bdd`. Test-layer findings: no duplicate, no non-kept type, no justified extra test.

---

## Steering Doc Verification Gates

| Validation | Tier | Selection | Status | Evidence |
|------------|------|-----------|--------|----------|
| `repository.tests` | change | `claude:haiku`, `selected`, 5 tests | Pass | `npm test -- --runInBand` with the 5 selected tests exited 0: 5 suites, 138 passed, 1 skipped (Windows-only junction test on macOS). Coverage: 117 of 117 changed lines of `src/host-events.mjs` hit, none uncovered. Log `.nmg-sdlc/verification/621/repository.tests.log` |
| `repository.nmg-sdlc-smoke` | (untiered) | surfaces `plugin-host`, `execute` | Pass | "nmg-sdlc-smoke exercised execute; nmg-sdlc-smoke delivered #377": smoke issue #377 delivered through `/sdlc-execute` from this checkout, PR #382 merged, issue CLOSED |
| `repository.tests.full` | full | none | Skipped before merge | Runs under `/sdlc-verify-full` |
| `repository.nmg-sdlc-smoke.full` | full | none | Skipped before merge | Runs under `/sdlc-verify-full` |

**Gate Summary**: 2/2 applicable pre-merge validations passed, 0 failed, 0 incomplete.

### Smoke lifecycle evidence

Only the `execute` smoke surface was selected, so no interactive surface was exercised and no new issue was drafted. The main checkout's record named #311, which is CLOSED; open issue #377 already carried `spec-created` with its `docs: approve spec for #377` PR #378 merged and no delivery, so it was reused and recorded in this checkout's `.nmg-sdlc/smoke/provisioned.json`. The gate delivered it (exact closing PR #382 `MERGED`, issue `CLOSED`).

---

## Fixes Applied

None in the gate phase.

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Info | Error Handling | `src/host-events.mjs` | Recursion per nested `$("` level: a single-line command with about 5000 nested unclosed `$("` throws `RangeError`, which would propagate from the `hooks/register.ts` Bash `tool.call` handler. Main's iterative scan never threw. | Not reachable by realistic commands; recorded as info (F1) |

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `src/host-events.mjs` | 1 (info) | Scanner rewrite |
| `scripts/__tests__/plugin-root-nested-context.test.mjs` | 0 | Scenario implementations |
| `CHANGELOG.md` | 0 | `[Unreleased]` bullet ends with `(#621)` |
| `VERSION`, `package.json`, `.claude-plugin/plugin.json` | 0 | Version mirrors in sync |

---

## Recommendation

**Ready for PR**

The review passed with only an info note, and every applicable pre-merge validation passed at the queue head with complete coverage.
