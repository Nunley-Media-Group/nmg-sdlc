# Verification Report: Non-issue legacy dependency references abort upgrade detection

**Date**: 2026-10-25
**Issue**: #485
**Reviewer**: Claude Code (architecture-reviewer, verify worker)
**Scope**: Implementation verification against spec

**Verification head**: 78139d92c1ac29159bc1a15c04864ff378022a3d

---

## Executive Summary

The implement stage never ran for #485. The only branch commit beyond `origin/main` is `78139d9 fix: deliver issue #485`, which changes only `VERSION`, `CHANGELOG.md`, `package.json`, and `.claude-plugin/plugin.json`. None of tasks T001–T004 have been implemented. `scripts/issue-dependencies.mjs`, `scripts/sdlc-upgrade.mjs`, the upgrade-project references, and the tests are unchanged from `main`. No `dependency_dangling_candidate` code exists anywhere. Running the parser against the defect inputs at this head still reproduces the reported behavior.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 1 |
| Architecture (SOLID) | N/A (no implementation) |
| Security | N/A (no implementation) |
| Performance | N/A (no implementation) |
| Testability | 1 (no regression coverage) |
| Error Handling | 1 (defect still aborts detection) |
| **Overall** | 1 |

### Implementation Status: Fail
**Total Issues**: 4 (T001–T004 unimplemented)

---

## Issue Scope

- Active issue: #485
- Spec: `specs/485-reject-non-issue-legacy-dependency-references-instead-of-aborting-upgrade-detection`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":485,"specPath":"specs/485-reject-non-issue-legacy-dependency-references-instead-of-aborting-upgrade-detection","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Not complete
- PR evidence: Not required

---

## Acceptance Criteria Verification

The evidence below comes from calling `parseLegacyDependencyEvidence` from `scripts/issue-dependencies.mjs` at the verification head.

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | PR and table-row references create no candidate | Fail (not implemented) | `\| **Version / Commit** \| Main after merged PR #307 \|` → `edges:[{blockedBy 307}]`; `requires the fix after PR #307` → `edges:[{blockedBy 307}]` |
| AC2 | Other-project/repository references create no candidate | Fail (not implemented) | `depends on Other-Org/other-repo#12` → `edges:[{blockedBy 12}]`. `PennyScan issue #102 therefore fails` already yields no edge, but only by accident, since no qualification rule exists |
| AC3 | Dangling legacy candidate becomes a `dependency_dangling_candidate` finding; detect completes | Fail (not implemented) | `scripts/sdlc-upgrade.mjs:1523` still passes every candidate to `preflightBlockedByEdges`, which throws `dependency_dangling` ("Proposed dependency edge is dangling", `scripts/issue-dependencies.mjs:244`). `dependency_dangling_candidate` appears nowhere in the code |
| AC4 | Genuine sequencing clauses and field lines preserved | Fail (not implemented) | The current parser does still return `blockedBy #394` and `#10`/`#11`, but none of the AC4 regression coverage required by T004 exists, so the AC is not delivered |
| AC5 | Dangling existing official edges still fail closed | Fail (not implemented) | Existing `dependency_dangling` paths are unchanged (`scripts/issue-dependencies.mjs:60,105,181,244`), but none of the AC5 tests required by T004 exist |

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Not implemented | `scripts/issue-dependencies.mjs` is unchanged from `main` (`git diff origin/main...HEAD` is empty) |
| FR2 | Not implemented | `scripts/sdlc-upgrade.mjs` is unchanged from `main` |
| FR3 | Not implemented (no delivered coverage) | Existing behavior is unchanged; none of the required tests exist |
| FR4 | Not implemented | `workflows/upgrade-project/**` is unchanged from `main` |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Ignore table rows and qualified references in legacy parsing | Incomplete | No change to `scripts/issue-dependencies.mjs` |
| T002 | Report dangling legacy candidates as findings | Incomplete | No change to `scripts/sdlc-upgrade.mjs` |
| T003 | Document report-only dangling candidates | Incomplete | No change to the upgrade-project workflow or references. The CHANGELOG has only a delivery-prepared `### Changed` entry under `[4.4.2]`, not the required `[Unreleased]` `### Fixed` entry |
| T004 | Regression coverage | Incomplete | No change to `issue-dependencies`, `body-relationships`, or `sdlc-upgrade` tests |

---

## Architecture Assessment

There is no #485 implementation to review. The checklists (SOLID, security, performance, testability, error handling) were loaded but have nothing in the branch diff to score. The diff contains only version mirrors and a CHANGELOG heading.

### Layer Separation

Not applicable: no change.

### Dependency Flow

Not applicable: no change.

---

## Security Assessment

No new code. Not applicable.

## Performance Assessment

No new code. Not applicable.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | No | No |
| AC2 | Yes (SCN002) | No | No |
| AC3 | Yes (SCN003) | No | No |
| AC4 | Yes (SCN004) | No | No |
| AC5 | Yes (SCN005) | No | No |

### Coverage Summary

- Feature files: 5 scenarios in `feature.gherkin`
- Step definitions / Jest coverage for #485: Missing
- Existing suite: `cd scripts && npm test -- --runInBand` exits 0. This only shows the unchanged code still passes its existing tests, not that #485 was delivered

---

## Exercise Test Results

Not performed. The branch changes no `workflows/` or `agents/` files, so there is no changed skill to exercise.

---

## Steering Doc Verification Gates

The deterministic artifact is `.nmg-sdlc/verification/485.json` (runner `sdlc-verify-steering.mjs`, controller run `59a1b2a1-6bf3-4e97-b7b8-8451e4d3c1bf`). Coverage: declared 2, recorded 2, complete true, ceiling none.

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (builtin.command) | Pass | `npm test -- --runInBand` exited 0 at head `78139d9` |
| `repository.nmg-sdlc-smoke` (project.nmg-sdlc-smoke) | Pass | `nmg-sdlc-smoke delivered #248` at head `78139d9` |
| Git hygiene | Pass | `git diff --check origin/main...HEAD` exit 0 |

**Gate Summary**: 3/3 gates passed, 0 failed, 0 incomplete. The gates passing does not lift the status above Fail, because every delivery AC is unimplemented.

---

## Fixes Applied

None. Implementing the approved tasks belongs to the implement stage, not verification.

## Remaining Issues

### Critical Issues

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Spec compliance |
| **Location** | `scripts/issue-dependencies.mjs:302` (`parseLegacyDependencyEvidence`) |
| **Issue** | T001 not implemented: table rows and PR/other-repository-qualified `#N` references still produce candidate edges |
| **Impact** | AC1/AC2/FR1 fail |
| **Reason Not Fixed** | The implement stage never ran. Routed to implementation |

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Category** | Error handling |
| **Location** | `scripts/sdlc-upgrade.mjs:1523` (`detectIssueDependencyUpgrade`) |
| **Issue** | T002 not implemented: dangling legacy candidates still throw `dependency_dangling` and abort `detect`/`apply` |
| **Impact** | AC3/FR2 fail. The defect is still reproducible |
| **Reason Not Fixed** | The implement stage never ran. Routed to implementation |

### High Priority

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Testing |
| **Location** | `scripts/__tests__/issue-dependencies.test.mjs`, `body-relationships.test.mjs`, `sdlc-upgrade.test.mjs` |
| **Issue** | T004 not implemented: no regression tests for AC1–AC5 |
| **Impact** | AC4/AC5/FR3 not delivered |
| **Reason Not Fixed** | The implement stage never ran. Routed to implementation |

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Documentation |
| **Location** | `workflows/upgrade-project/WORKFLOW.md`, `references/detection.md`, `references/v3-detectors.md`, `CHANGELOG.md` |
| **Issue** | T003 not implemented: no report-only `dependency_dangling_candidate` documentation and no `[Unreleased]` `### Fixed` entry |
| **Impact** | FR4 fails |
| **Reason Not Fixed** | The implement stage never ran. Routed to implementation |

---

## Positive Observations

- The version mirrors (`VERSION`, `package.json`, `.claude-plugin/plugin.json`) are synchronized at 4.4.2.
- The registered gate, including the live smoke delivery, passes on the unchanged tree.

## Recommendations Summary

### Before PR (Must)
- [ ] Run the implement stage for T001–T004, then rerun the full registered gate and verification at the new head.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/issue-dependencies.mjs` | 1 | Unchanged; defect reproduced |
| `scripts/sdlc-upgrade.mjs` | 1 | Unchanged; throws on dangling candidates |
| `VERSION`, `package.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md` | 0 | The only files in the branch diff |

---

## Recommendation

**Major rework needed**

No #485 implementation exists at `78139d92c1ac29159bc1a15c04864ff378022a3d`. Route this to the implement stage.
