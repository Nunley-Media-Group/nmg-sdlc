# Verification Report: Fix final-head evidence hang on workflow-qualified check names

**Date**: 2026-08-31
**Issue**: #336
**Reviewer**: Codex
**Scope**: Implementation verification against the approved specification

---

## Executive Summary

The implementation satisfies the approved defect contract. GitHub workflow metadata is preserved, one shared resolver reconstructs canonical workflow-plus-job identities, terminal ambiguity fails without polling, and unique bare-name delivery remains compatible. The prior wrong-workflow ambiguity is corrected: qualified declarations skip raw bare-name matching and require authoritative canonical equality.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **4.7** |

### Implementation Status: Pass

**Total Issues**: 0 remaining.

## Deterministic Steering Artifact and Ceiling

- Artifact: `.omp/sdlc/verification/336.json`
- Head: `09069184c14848535fc4e9ef5ca2c6c6c50dd7c3`
- Coverage: `declared: 2`, `recorded: 2`, `complete: true`
- Required results: `repository.tests` passed; `repository.nmg-sdlc-smoke` passed
- Smoke result: `/sdlc-status --json` returned `nextAction.command: /sdlc-draft-issue`
- Ceiling: none
- Artifact identity: dirty tree with `dirtyDiffHash: sha256:56e47a525750c1ea59ff772978714ea84fa5a69ffcd948e73a64c830cd615a24`

## Issue Scope

- Active issue: #336
- Spec: `specs/336-fix-final-head-evidence-hang-on-workflow-qualified-check-names`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [`AC1`, `AC2`, `AC4`, `AC5`]; FR [`FR1`, `FR2`, `FR3`, `FR5`, `FR6`, `FR7`]; tasks [`T001`, `T002`, `T003`]; scenarios [`SCN001`, `SCN002`, `SCN004`, `SCN005`]
- Regression: AC [`AC3`, `AC6`]; FR [`FR4`]; scenarios [`SCN003`, `SCN006`]

<!-- nmg-sdlc-issue-scope: {"issueNumber":336,"specPath":"specs/336-fix-final-head-evidence-hang-on-workflow-qualified-check-names","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR5","FR6","FR7"],"tasks":["T001","T002","T003"],"scenarios":["SCN001","SCN002","SCN004","SCN005"]},"regression":{"acceptanceCriteria":["AC3","AC6"],"functionalRequirements":["FR4"],"scenarios":["SCN003","SCN006"]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required
- Delivery version synchronization: Pass — `VERSION` and `package.json` are synchronized delivery artifacts for the issue release.

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Qualified declarations complete H1-to-H2 collection | Pass | `canonicalCheckName` and `resolveDeclaredCheck` reconstruct `workflow / job` in `scripts/verification-readiness.mjs:12-41`; `evidenceForHead` uses the resolver in `scripts/sdlc-deliver.mjs:788-823`; the controller regression exits 0 with zero sleeps. |
| AC2 | Same job name from different workflows fails closed | Pass | `resolveDeclaredCheck` rejects multiple raw job-name candidates at `scripts/verification-readiness.mjs:24-28`; helper, controller, and hosted-state collision regressions pass. |
| AC3 | Unique bare names still match | Pass | One unique bare `contract-tests` candidate remains accepted at `scripts/verification-readiness.mjs:25-29`; exact-name controller fixtures pass. |
| AC4 | Pending stays pending; terminal mismatch does not hang | Pass | Only absent or pending snapshots return `pending` at `scripts/verification-readiness.mjs:38-41`; `evidenceForHead` throws `verification_not_ready` for terminal mismatch, wrong event, unsuccessful state, or missing URL at `scripts/sdlc-deliver.mjs:807-815`. |
| AC5 | Canonical identity is shared and fail-closed | Pass | Delivery snapshots and hosted state use `canonicalCheckName` and `resolveDeclaredCheck`; every `gh pr checks` request includes `workflow`. Direct wrong-workflow reproduction returned `mismatch` for declaration `Python CI / verify` against job `Python CI / verify` under workflow `Other CI`. |
| AC6 | Current exact-name fixtures do not regress | Pass | Focused Jest run passed 4/4 suites and 131/131 tests, including controlled-draft, #319, and #284 regressions. |

## Regression Obligations

| Obligation | Status | Evidence |
|------------|--------|----------|
| AC3 / FR4 / SCN003 | Pass | Unique `contract-tests` with empty or omitted workflow remains matched and reaches final-head validation. |
| AC6 / SCN006 | Pass | Existing exact-name controlled-draft delivery fixtures pass. |
| #319 unfiltered hosted failures | Pass | Existing non-required failure regressions pass in the focused suite. |
| #284 event enrichment | Pass | Existing Actions-run event enrichment regressions pass in the focused suite. |

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add canonical check identity and fail-closed matching | Complete | Shared helpers, workflow capture, canonical snapshot keys, fail-closed final-head matching, schema 1 markers, and producer documentation are present. No suffix matching or wall-clock deadline was added. |
| T002 | Add qualified-name and collision regressions | Complete | Helper, controller, hosted-state, and PR-dependent exercise tests cover SCN001-SCN006, including wrong-workflow full-text ambiguity. |
| T003 | Verify no regressions | Complete | The exact focused command passed 4 suites and 131 tests. |

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Canonicalization and resolution are centralized in the readiness module. |
| Open/Closed | 4 | Delivery and hosted-state consumers use the shared helpers rather than duplicating matching rules. |
| Liskov Substitution | 4 | Optional workflow metadata preserves existing bare-name fixtures. |
| Interface Segregation | 4 | Two focused exports define the identity contract. |
| Dependency Inversion | 4 | CLI execution and sleep behavior remain injectable in controller tests. |

**SOLID score**: 4/5. Module placement and dependency direction follow the existing runtime-library boundary.

### Security Assessment

**Score**: 5/5.

- GitHub values remain argument-array data; no shell interpolation was introduced.
- Canonical equality rejects collisions and wrong workflows without suffix inference.
- Exact event, head, terminal state, and evidence URL requirements remain fail-closed.
- Marker schema remains version 1 with no broadened trusted fields.

### Performance Assessment

**Score**: 4/5.

- Matching is bounded by finite check snapshots and uses linear scans.
- Snapshot deduplication uses canonical identity plus event keys.
- No additional API request or out-of-scope wall-clock deadline was introduced.
- Pending collection remains state-based and stops immediately on terminal mismatch.

### Testability Assessment

**Score**: 5/5.

- Canonicalization and resolution are deterministic exported functions.
- Controller fixtures inject command execution and sleep behavior.
- SCN001-SCN006 have behavior-focused Jest coverage, including the prior wrong-workflow ambiguity.

### Error Handling Assessment

**Score**: 5/5.

- Pending observations are distinguished from terminal mismatch.
- Terminal mismatch uses stable `verification_not_ready` handling.
- Wrong workflow, duplicate bare identity, wrong event, failing conclusion, and missing URL all reject advancement.

**Architecture average**: 4.6/5.

## Test Results

| Verification | Result | Evidence |
|--------------|--------|----------|
| Focused issue suite | Pass | Exact task command: 4 suites, 131 tests, exit 0. |
| Full repository suite | Pass | Deterministic `repository.tests`: `npm test -- --runInBand` exited 0. |
| Verify-code fixture | Pass | `node scripts/skill-exercise-runner.mjs --skill verify-code`: 14 pass, 0 fail, 0 skipped. |
| Plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository` exited 0. |
| Diff hygiene | Pass | `git diff --check` exited 0 with no output. |
| Live smoke provider | Pass | Read-only `nmg-sdlc-smoke` exercise returned valid status JSON and `/sdlc-draft-issue` as the next action. |
| Wrong-workflow ambiguity reproduction | Pass | Direct resolver invocation returned `{status: "mismatch", check: null}`. |
| Language-server diagnostics | Not applicable | No language server is configured for the changed `.mjs` files. Runtime and Jest verification supplied executable evidence. |

### BDD Coverage

| Scenario | Status | Test evidence |
|----------|--------|---------------|
| SCN001 | Pass | Qualified H1-to-H2 controller fixture and helper reconstruction. |
| SCN002 | Pass | Duplicate bare-name and authoritative wrong-workflow regressions. |
| SCN003 | Pass | Unique bare-name helper and exact-name controller fixtures. |
| SCN004 | Pass | Pending wait versus terminal mismatch assertions. |
| SCN005 | Pass | Shared canonical identity, event/head/state/URL rejection, and wrong-workflow reproduction. |
| SCN006 | Pass | Existing exact-name delivery fixtures. |

This repository has no Gherkin step runner for this feature. The approved task plan maps the scenarios to the four passing Jest suites.

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `verify-code` deterministic fixture plus installed extension status surface |
| **Exercise Method** | `node scripts/skill-exercise-runner.mjs --skill verify-code`; registered `exercise-omp /sdlc-status --json` smoke provider |
| **Result** | Fixture: 14 pass, 0 fail, 0 skipped. Live smoke: exit 0 with valid `/sdlc-` next action. |
| **State handling** | The smoke provider used state-based process completion. |

The controller behavior changed by this issue is covered by the focused delivery and PR-dependent exercise suites. No GitHub resource was mutated by exercise verification.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | Registered full suite exited 0; focused issue suite passed 131/131 tests. |
| Live smoke project | Pass | Registered `repository.nmg-sdlc-smoke` provider returned `/sdlc-draft-issue`. |
| Skill inventory and workflow fixture | Pass | Verify-code exercise passed all 14 contract and inventory criteria. |
| OMP plugin surface | Pass | Repository plugin-surface validation exited 0. |
| Prompt quality | Pass | Producer documentation defines trimmed canonical equality and explicitly forbids suffix matching. |
| Git hygiene | Pass | `git diff --check` exited 0. |

**Gate Summary**: 6 passed; 0 failed; 0 incomplete. Deterministic coverage is complete and imposes no ceiling.

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | No verification finding required a code change. | No change. | — |

## Remaining Issues

None.

## Positive Observations

- All `gh pr checks --json` requests, including reconciliation resume, now request workflow metadata.
- Qualified H1-to-H2 evidence completes without extra polling.
- Terminal collisions and wrong workflows fail before PR readiness or merge.
- Existing marker schema, exact-head binding, event provenance, URL requirements, and bare-name fixtures remain intact.

## Recommendations Summary

### Before PR (Must)

- [x] No remaining local verification obligation.

### Short Term (Should)

- [x] No unrelated refactoring is needed.

### Long Term (Could)

- [x] No broader architectural follow-up is required by the approved scope.

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/verification-readiness.mjs` | 0 | Canonical helper and fail-closed resolver. |
| `scripts/sdlc-deliver.mjs` | 0 | Workflow capture, final-head resolution, and terminal mismatch handling. |
| `scripts/pr-delivery-state.mjs` | 0 | Canonical snapshot keys and declared-name observation. |
| `scripts/__tests__/verification-readiness.test.mjs` | 0 | Canonical, collision, pending, suffix, and wrong-workflow coverage. |
| `scripts/__tests__/sdlc-deliver.test.mjs` | 0 | Qualified, collision, pending, terminal, and exact-name controller paths. |
| `scripts/__tests__/pr-delivery-state.test.mjs` | 0 | Hosted-state qualified and collision coverage. |
| `scripts/__tests__/exercise-pr-dependent-delivery.test.mjs` | 0 | Controlled-draft exercise contract. |
| `references/pr-dependent-verification.md` | 0 | Shared canonical identity rule. |
| `workflows/verify-code/references/report-format.md` | 0 | Verifier producer rule. |

## Recommendation

**Ready for PR**

All approved delivery and regression obligations pass, deterministic steering coverage is complete, and no local or architectural blocker remains.
