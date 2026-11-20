# Verification Report: Add an /sdlc-upgrade-project item that migrates non-kept test layers into BDD scenarios under a coverage guarantee

**Date**: 2026-11-19
**Issue**: #572
**Reviewer**: Claude (nmg-sdlc verify worker, gate phase)
**Scope**: Implementation verification against spec

**Verification head**: 67f846e0cafea33ecc07f7365b360de5fdbcdd93

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 4 |
| Error Handling | 5 |
| **Overall** | 4.8 |

### Implementation Status: Pass
**Total Issues**: 2 (both `info`; no blocking, major or minor findings)

The review phase passed at reviewed head `46810e08670d2d2ed64fa636a903801f76223b45` (scoped review after two repair rounds; record `.nmg-sdlc/verification/572-review.json`). The gate ran once at the merge-queue head `67f846e0cafea33ecc07f7365b360de5fdbcdd93` (default branch integrated, version prepared). Both registered pre-merge validations passed with complete coverage.

---

## Issue Scope

- Active issue: #572
- Spec: `specs/572-add-an-sdlc-upgrade-project-item-that-migrates-non-kept-test-layers-into-bdd-scenarios-under-a-coverage-guarantee`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1-AC10]; FR [FR1-FR8]; tasks [T001-T008]; scenarios [SCN001-SCN010]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":572,"specPath":"specs/572-add-an-sdlc-upgrade-project-item-that-migrates-non-kept-test-layers-into-bdd-scenarios-under-a-coverage-guarantee","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/572.json` (generated 2026-11-20T00:35:53Z)
- Identity: head `67f846e0cafea33ecc07f7365b360de5fdbcdd93`, steering `sha256:cc80105a430c7fd1d914c6e253145b44d198660fb624848c166e778d00887aba`, spec `sha256:fae4478c75a0ef1be75f55395d702e13fc67235ddb5c03b7e5efdf751dd60067`, tree clean
- Coverage: declared 2, recorded 2, complete true; no missing, duplicate or unknown results
- Ceiling: none (`ok: true`)

---

## Acceptance Criteria Verification

Evidence comes from the passed review record. No criterion's tests mock the path under test.

| AC | Description | Status | Exercised | Evidence |
|----|-------------|--------|-----------|----------|
| AC1 | Operator chooses kept test types | Pass | not_exercisable | `workflows/upgrade-project/WORKFLOW.md` multi-select question (bdd recommended, detected types only); `apply --approve test-layers:<digest> --kept` through `scripts/sdlc-upgrade.mjs`; `scripts/test-layers.mjs` writer always keeps bdd; @SCN001 tests. The AskUserQuestion runs only in the interactive TUI (info N3). |
| AC2 | Non-interactive run without a recorded choice changes nothing | Pass | real_entry_point | `applyTestLayers` returns `skipped:kept_types_unrecorded` before any write; tree byte-identical in test and probe |
| AC3 | Duplicate layers detected only for non-kept types | Pass | real_entry_point | `computeCandidates` in `scripts/upgrade-test-layers.mjs`; @SCN003 CLI tests for kept [bdd] and [bdd,unit] |
| AC4 | Fully duplicated tests deleted with evidence | Pass | real_entry_point | `gateBatch` records `{id,file,coveredBy,lines}`; @SCN004 begin/rm/gate via CLI |
| AC5 | Uncovered behavior converted before deletion | Pass | real_entry_point | Conversion then delete path; retired accepted ids re-list a partly migrated file under a new batch id (@SCN005 rerun test) |
| AC6 | Coverage gap refuses the batch | Pass | real_entry_point | `test_layers_coverage_gap` with gap list; `restore()` scoped to the project root, including a root below the work-tree top (@SCN006, mutation-checked) |
| AC7 | Red suite refuses the batch | Pass | real_entry_point | `test_layers_suite_failed` with pre-batch tree restored (@SCN007) |
| AC8 | Missing coverage command refuses deletion | Pass | real_entry_point | Missing or invalid `steering/test-coverage.json` makes candidates/begin/gate/report refuse with `{reasonCode,path,key}` (@SCN008) |
| AC9 | Before/after report | Pass | real_entry_point | `testLayersReport` prints before/after counts, wall time, lines, branches, outcomes, accepted evidence, refused records and `test_layers_coverage_regressed` |
| AC10 | Choice can be changed by rerunning | Pass | real_entry_point | `apply --kept` rewrites through `writeTestLayers`; candidates read the live kept set (@SCN010) |

### Functional Requirements

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | Detector with Git-aware `listFiles()` and digest-bound `test-layers:<sha256>` |
| FR2 | Pass | One multi-select question; `--kept` parsed and validated; writer validates through #571 `validateTestLayers` |
| FR3 | Pass | `scripts/test-coverage.mjs` validator, loader (missing, symlink, non-file, invalid JSON) and argv runner (`shell:false`) |
| FR4 | Pass | `workflows/upgrade-project/references/test-layer-migration.md` batch loop |
| FR5 | Pass | Deterministic gate restores on every refusal |
| FR6 | Pass | Per-test evidence, refused gaps and before/after kept across reruns |
| FR7 | Pass | Proposal only without a kept set |
| FR8 | Pass | README and upgrade workflow document the item, refusal codes and `steering/test-coverage.json` |

---

## Architecture Review

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID Principles | 5 | Inventory, candidates, snapshot, gate and report are separate functions in `scripts/upgrade-test-layers.mjs`; steering validation in `scripts/test-coverage.mjs`; kept-types writer shared in `scripts/test-layers.mjs` |
| Security | 5 | Argv arrays with `shell:false`; symlinked and non-regular steering targets refused; restore limited to the project root |
| Performance | 5 | Git prunes ignored directories instead of a full walk |
| Testability | 4 | Every AC has a CLI-driven test; AC1's interactive question is verified only by contract text (N3) |
| Error Handling | 5 | Stable `test_layers_*` reason codes; restore on every refusal, including broken steering after begin |

### Findings

| ID | Severity | Lens | Location | Summary |
|----|----------|------|----------|---------|
| N3 | info | test-quality | `workflows/upgrade-project/WORKFLOW.md` | The AC1 kept-types question is verified by contract text because `/sdlc-upgrade-project` is interactive and cannot run under `claude -p`; the `apply --kept` persistence it feeds is tested through the real CLI |
| I1 | info | failure-paths | `scripts/upgrade-test-layers.mjs` | `listFiles()` uses `git ls-files`, so test files inside a nested repository or submodule are no longer inventoried; arguably safer because restore cannot cover nested repositories, but not documented |

---

## Test Coverage

- BDD scenarios: 10/10 acceptance criteria covered (SCN001-SCN010)
- Step definitions: Implemented (`scripts/__tests__/upgrade-test-layers.test.mjs`, `scripts/__tests__/upgrade-test-layers-contract.test.mjs`)
- Test execution: Pass

## Steering Doc Verification Gates

Pre-merge validations from `steering/manifest.json`, run once by `sdlc-verify-steering.mjs` at the verification head. The project declares no tiers, so each result records `tier: null` and `selection: null`.

| Gate | Status | Tier | Selection | Evidence |
|------|--------|------|-----------|----------|
| `repository.tests` (builtin.command, required) | Pass | null | null | `npm test -- --runInBand` in `scripts/` exited 0: 73 suites passed (1 skipped), 1752 tests passed (2 skipped), 1475.9 s. Log `.nmg-sdlc/verification/572/repository.tests.log` |
| `repository.nmg-sdlc-smoke` (project.nmg-sdlc-smoke, required) | Pass | null | null | "nmg-sdlc-smoke delivered #329": closing-PR baseline empty; headless `/sdlc-execute #329` (session `8d22017c-a978-4ac0-8116-1bd1c35373d3`) with this checkout as plugin; PR #331 MERGED at `47f46ba473802993d093110287c99ef67c50016f`, issue #329 CLOSED |

**Gate Summary**: 2/2 passed, 0 failed, 0 incomplete

### Real Smoke Lifecycle Evidence

- Provisioning (per `steering/snippets/project-smoke.md`): the recorded issue #311 was closed, so a fresh issue was drafted through the real `/sdlc-draft-issue` in an interactive `claude --plugin-dir <this checkout>` session in tmux. It produced issue #329 "Add greeting_char_frequency library helper" (one small issue, enhancement, milestone v3). `/sdlc-write-spec #329` then published and merged spec PR #330 and applied `spec-created`. The record `.nmg-sdlc/smoke/provisioned.json` names #329; the tmux session and clone were removed afterwards.
- Delivery: the gate delivered #329 through PR #331 at exact head `47f46ba473802993d093110287c99ef67c50016f`, outside the pre-run baseline; issue CLOSED.

## Fixes Applied

None in the gate phase. The earlier review rounds sent findings F1, F2, F6, N1 and N2 back to implement; all were repaired and re-checked before the review passed.

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| info | Testability | `workflows/upgrade-project/WORKFLOW.md` | N3: AC1 question verified by contract text only | Interactive plan-mode question cannot run headless |
| info | Error handling | `scripts/upgrade-test-layers.mjs` | I1: nested repositories are not inventoried and this is undocumented | Informational; not a defect against the spec |

## Overall Status

**Pass**

## Recommendation

Ready for PR.
