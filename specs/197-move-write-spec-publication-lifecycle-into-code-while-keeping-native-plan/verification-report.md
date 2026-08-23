# Verification Report: Move write-spec publication lifecycle into code while keeping native plan

**Date**: 2026-08-23
**Issue**: #197
**Reviewer**: Codex
**Scope**: Implementation verification against the approved specification

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
| **Overall Average** | **4.8** |

The implementation satisfies AC1-AC5 after two safe local verification fixes. Deterministic discovery and candidate filtering now live in `scripts/publish-approved-spec.mjs`, reuse `resolveSpecDir` and `specStatus`, preserve the existing publication lifecycle, and leave native plan authoring and continue-loop presentation in the workflow. The final repository suite passes 413 tests. The live RPC exercise emitted the exact TUI-only denial and left the disposable repository clean on `main`.

**Overall Status**: **Pass**

## Issue Scope

- Active issue: #197
- Spec: `specs/197-move-write-spec-publication-lifecycle-into-code-while-keeping-native-plan`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC1-AC5; FR1-FR6; tasks T001-T008; scenarios SCN001-SCN009
- Regression: publication mutation contract, shared approval status contract, native planning contract, TUI-only public surface

<!-- nmg-sdlc-issue-scope: {"issueNumber":197,"specPath":"specs/197-move-write-spec-publication-lifecycle-into-code-while-keeping-native-plan","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009"]},"regression":{"acceptanceCriteria":["publication mutation contract","shared approval status contract","native planning contract","TUI-only public surface"],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required by the approved specification

## Acceptance Criteria

- [x] **AC1 — one lifecycle helper owns deterministic discovery.** `scripts/publish-approved-spec.mjs:93-140` validates `discover --issue N`, reads the exact issue fields, applies the specified slug and bug-label rules, and returns issue metadata, classification, target directory, and shared status. `scripts/publish-approved-spec.mjs:118-121` calls `resolveSpecDir` and `specStatus`; failures retain stable reason codes. Regression coverage: `scripts/__tests__/publish-approved-spec.test.mjs:191-302`.
- [x] **AC2 — helper returns sorted continue candidates.** `scripts/publish-approved-spec.mjs:143-178` accepts repeated published numbers, calls the exact 100-item open-issue query, validates and deduplicates rows, sorts numerically, and excludes shared-status Approved issues without presentation truncation. Workflow presentation remains at most three candidates plus Finished in `workflows/write-spec/WORKFLOW.md:130-143`. Regression coverage: `scripts/__tests__/publish-approved-spec.test.mjs:304-369`.
- [x] **AC3 — publication behavior remains exact.** `workflows/write-spec/WORKFLOW.md:110-128` retains prepare → four Approved writes → commit-push → merge. Existing helper tests cover clean branch preparation, exact directory staging and commit subject, non-force push behavior, docs-only non-closing PR merge, default-branch return, and recoverable post-merge failures. No `git add -A`, force-push, or guessed `main` was introduced.
- [x] **AC4 — native plan and interview behavior remain.** `workflows/write-spec/WORKFLOW.md:47-108` retains the per-issue three-ask maximum, full four-file bodies in `local://spec-{N}-plan.md`, singular issue/status metadata, and one initial `xd://propose`; continuation explicitly receives no second proposal. `scripts/__tests__/interactive-plan-contract.test.mjs:116-139` enforces the contract.
- [x] **AC5 — public surfaces and finish text remain.** `src/sdlc-commands.mjs:58-77` now distinguishes RPC/print process modes before the input rewrite, preventing headless RPC from entering native plan execution even when OMP exposes a UI-like context. The live harness emitted `Run /sdlc-write-spec in the TUI.` and left the disposable repository clean on `main`. No `commands/sdlc-write-spec.md` exists. Exact finish text remains in `workflows/write-spec/WORKFLOW.md:145-152`.

## Regression Obligations

- [x] Existing `prepare`, `commit-push`, `merge`, and `default-branch` behavior remains covered by the unchanged and extended publication-helper suite.
- [x] Shared worktree/local/remote approval detection remains centralized in `scripts/sdlc-execute.mjs:202-325` and covered by execute-status tests.
- [x] Native planning retains the complete four-file plan, interview budget, one-proposal rule, candidate ask shape, and exact finish text.
- [x] Print/RPC routing does not create a generated command markdown surface or bypass native TUI planning.

## Task Output Verification

| Task | Status | Evidence |
|------|--------|----------|
| T001 | Pass | `discover` implementation and issue/slug/classification tests |
| T002 | Pass | Shared resolver imports/calls and worktree/local/remote/ambiguity tests |
| T003 | Pass | `candidates` implementation with published filtering, sorting, and shared status |
| T004 | Pass | Extended `publish-approved-spec.test.mjs` read-path and no-mutation coverage |
| T005 | Pass | Compact helper-driven discovery and continue loop in `WORKFLOW.md` |
| T006 | Pass | Full native plan and six-command publication reference preserved |
| T007 | Pass | TUI rewrite, exact headless denial, and absent command markdown verified |
| T008 | Pass | Final focused and full Jest suites exit 0 |

## Architecture Review

| Area | Score (1-5) | Findings |
|------|-------------|----------|
| SOLID Principles | 5 | Read-only lifecycle operations are cohesive and shared approval resolution is imported rather than duplicated. Workflow presentation remains outside the helper. |
| Security | 5 | Positive safe-integer and path validation, explicit executable/argv spawning, no shell interpolation, bounded GitHub reads, no force push, and scoped staging. |
| Performance | 4 | Candidate processing is bounded to 100 issues and deterministic. Shared status checks are sequential and may invoke several Git commands per candidate, acceptable for the bounded interactive path but not maximally efficient. |
| Testability | 5 | Stable JSON contracts, injected subprocess fixtures, isolated temporary repositories, explicit error codes, and focused contract tests cover success and failure paths. |
| Error Handling | 5 | Fail-closed reason codes, malformed-output checks, ambiguity propagation, recoverable branch/file preservation, and post-merge state reporting are explicit. |

**Architecture Average**: **4.8 / 5.0**

### Prompt Quality

All eight steering criteria pass: instructions are unambiguous; success, empty, failure, and decline paths exist; tool references are current; ordering follows available evidence; native `/plan` remains the gate; outputs feed publication and execute; referenced files exist; historical specs remain bounded.

## Test Coverage

- BDD scenarios: 9/9 mapped to deterministic helper, workflow-contract, command-routing, and publication regression evidence.
- Step definitions: represented by Jest contract tests rather than a separate Gherkin runner, consistent with repository practice.
- Final execution: **Pass** — 38 suites passed, 1 skipped; 413 tests passed, 1 skipped; 0 snapshots; exit 0.
- Focused post-fix execution: **Pass** — 3 suites and 18 tests passed.

## Exercise Test Results

- Skill: `/sdlc-write-spec #197`
- Method: disposable Git repository via `node scripts/exercise-omp.mjs --cwd <project> --timeout-ms 300000 -- /sdlc-write-spec '#197'`, extension loaded by the harness with the required five-minute bound.
- Output: `Run /sdlc-write-spec in the TUI.`
- State check: no working-tree changes; branch remained `main`.
- Harness note: the registered local command does not emit `agent_end`, so the generic RPC harness reached its preserved five-minute bound after capturing the exact denial. This is the documented interactive-command harness limitation; no workflow or agent execution occurred after the routing fix.
- AC evaluation: SCN008 / AC5 Pass. Earlier exercise runs exposed the RPC input-rewrite defect by executing discovery/publication; the source fix prevents that path.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `cd scripts && npm test -- --runInBand`: 413 passed, 1 skipped |
| Skill inventory | Pass | `Skill inventory audit: clean (43 items mapped).` |
| OMP plugin surface | Pass | `Plugin surface validation passed: repository` |
| Skill creator validation | Not applicable | Verification fixes touched `src/` and tests, not the workflow bundle. The repository workflow uses `WORKFLOW.md`, not the Pi Agent Skill `SKILL.md` format accepted by the external validator. |
| Skill exercise fixture | Not applicable | No deterministic `write-spec` fixture exists; live exercise supplied the required surface evidence. |
| Prompt quality | Pass | All eight criteria reviewed against the final workflow/reference contract |
| Git hygiene | Pass | `git diff --check main...HEAD` produced no output |

**Gate Summary**: 5 applicable gates passed, 0 failed, 0 incomplete; 2 not applicable.

## Fixes Applied

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| Medium | Test correctness | `scripts/__tests__/interactive-plan-contract.test.mjs:133` | Regression test incorrectly required the forbidden `Closes #N` text. | Inverted the assertion to enforce absence of the closing keyword. | `direct` |
| High | Public surface | `src/extension.ts`, `src/sdlc-commands.mjs`, `scripts/__tests__/sdlc-commands.test.mjs` | OMP RPC presents input as interactive with a UI-like context, so the input rewrite bypassed the registered headless denial and executed the write-spec workflow. | Detect `--mode rpc` and `--print` at the process boundary, suppress input rewriting, retain exact registered-command denial, and add regression coverage. | `direct` |

## Remaining Issues

None.

## Recommendation

Ready for `/sdlc-open-pr #197`.
