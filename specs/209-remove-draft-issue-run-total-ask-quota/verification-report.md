# Verification Report: Remove draft-issue run-total ask quota

**Date**: 2026-08-22
**Issue**: #209
**Reviewer**: Codex
**Scope**: Implementation verification against approved specification

---

## Executive Summary

The implementation satisfies all four acceptance criteria and all four tasks. The draft-issue workflow and its private references remove the whole-run three-ask quota, continue focused interviews until every material undiscoverable decision is gathered, preserve required ask gates and per-call shape rules, and leave unrelated workflow budgets unchanged. Focused source-contract coverage, the full Jest suite, deterministic draft-issue exercise, inventory validation, plugin-surface validation, prompt review, and diff hygiene pass.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **5.0** |

### Implementation Status: Pass
**Total Issues**: 0

---

## Issue Scope

- Active issue: #209
- Spec: `specs/209-remove-draft-issue-run-total-ask-quota`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3, FR4, FR5, FR6]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":209,"specPath":"specs/209-remove-draft-issue-run-total-ask-quota","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Continue interviewing until missing decisions are gathered, regardless of total ask count, then synthesize without a review ask | Pass | `workflows/draft-issue/WORKFLOW.md:58-66`; `workflows/draft-issue/references/interview-depth.md:17-21` |
| AC2 | Preserve classification, milestone, split-confirm, tool-first, preference-only, no-review, and per-call rules | Pass | `workflows/draft-issue/WORKFLOW.md:16-18,26-28,32-66`; `workflows/draft-issue/references/interview-depth.md:3-11`; `workflows/draft-issue/references/multi-issue.md:7-21` |
| AC3 | Ask for material undiscoverable detail instead of inventing defaults, while discovering repository facts with tools | Pass | `workflows/draft-issue/WORKFLOW.md:50-64`; `workflows/draft-issue/references/interview-depth.md:3,15,19-21` |
| AC4 | Preserve unrelated three-ask budgets and the maximum-three-questions-per-call contract | Pass | `references/interactive-gates.md:21-24`; `workflows/write-spec/WORKFLOW.md:50-52`; `workflows/onboard-project/WORKFLOW.md:26`; `workflows/upgrade-project/WORKFLOW.md:32-34` |

## Functional Requirements Verification

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | No normative draft-issue whole-run quota remains; negative contract assertions pass in `scripts/__tests__/interactive-plan-contract.test.mjs:35-43`. |
| FR2 | Pass | Adaptive completion rule is explicit in `workflows/draft-issue/WORKFLOW.md:58-66` and `interview-depth.md:19-21`. |
| FR3 | Pass | Required classification, milestone, and split-confirm gates remain in `WORKFLOW.md:16-46`; split behavior remains in `multi-issue.md:7-21`. |
| FR4 | Pass | Tool-first, preference-only, no-review, 2–4 options, recommended-first, and three-questions-per-call rules remain in `WORKFLOW.md:50-66` and `interview-depth.md:3-11`. |
| FR5 | Pass | Source-contract assertions prove write-spec, onboard-project, and upgrade-project budgets remain unchanged. |
| FR6 | Pass | `specs/4-draft-issue-skill/` remains in the working-tree archive and was not changed. |

## Regression Obligations

No adopted regression identifiers were returned by the issue-scope resolver. Preserved behavior required by AC2 and AC4 is verified above and by the focused contract test.

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Remove the draft-issue run-total quota | Complete | `workflows/draft-issue/WORKFLOW.md` uses material-decision completion rather than invocation count. |
| T002 | Replace quota-based interview guidance | Complete | Both private references remove skill-wide quota language while preserving split and per-call rules. |
| T003 | Preserve unrelated interaction budgets | Complete | All four named contracts retain their bounded rules. |
| T004 | Add quota cutover contract coverage | Complete | New assertions reject quota/slot/probe-skipping language and preserve required gates and unrelated budgets. |

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Core workflow owns sequencing; detailed interview and split rules remain in focused private references. |
| Open/Closed | 5 | Existing workflow and references were changed directly as required; no parallel contract or abstraction was introduced. |
| Liskov Substitution | 5 | No subtype or interface behavior is involved; existing workflow consumers retain the same command contract. |
| Interface Segregation | 5 | Shared per-call rules remain in `references/interactive-gates.md`; draft-only depth and split rules stay bundle-local. |
| Dependency Inversion | 5 | Workflow behavior depends on existing OMP tool contracts and referenced policy, not new concrete machinery. |

### Layer Separation

The change remains a documentation-contract cutover in the draft-issue workflow layer. It does not alter extension registration, controller scripts, GitHub mutation ownership, or handoff schemas.

### Dependency Flow

The workflow points to the shared interactive contract and focused private references. The implementation does not duplicate unrelated workflow budgets or introduce a second source of truth.

## Security Assessment

**Score: 5/5.** No new command execution, input interpolation, path mutation, secret handling, authentication, or authorization surface was added. Tool-first discovery reduces unnecessary user disclosure; GitHub mutations remain in the existing approved-plan path. Web-application checklist items are not applicable to this Markdown contract change.

## Performance Assessment

**Score: 5/5.** The change removes an arbitrary interaction-count termination rule without adding scans, loops over repository data, allocations, or runtime dependencies. Investigation remains tool-first and scoped; asks continue only while material undiscoverable decisions remain.

## Testability Assessment

**Score: 5/5.** The approved design calls for behavioral source assertions for this Markdown-only change. The focused contract test covers forbidden quota language, retained gates, per-call shape, tool-first discovery, completion semantics, and unrelated budgets. The full suite passed.

## Error Handling Assessment

**Score: 5/5.** The workflow now names a deterministic completion condition and explicitly forbids silent defaults, unnecessary repository-fact questions, and final-review asks. Existing approval and GitHub mutation boundaries remain unchanged.

## Test Coverage

### BDD Scenarios

| Scenario | Acceptance Criterion | Contract Coverage | Result |
|----------|----------------------|-------------------|--------|
| SCN001 | AC1 | Quota-negative and completion-positive assertions | Pass |
| SCN002 | AC2 | Required-gate, per-call, tool-first, and no-review assertions | Pass |
| SCN003 | AC3 | Necessary-probe and no-silent-default assertions | Pass |
| SCN004 | AC4 | Shared and unrelated budget assertions | Pass |

### Coverage Summary

- Feature files: 1 file, 4 scenarios
- Step definitions: Not applicable; the approved design specifies source-contract assertions for a Markdown-only workflow change
- Unit/contract tests: 355 passed, 1 intentionally skipped across 37 passing suites; exit 0
- Focused changed-contract test: included in the passing full Jest run

## Exercise Test Results

### Deterministic Bundle Exercise

| Field | Value |
|-------|-------|
| Skill | `draft-issue` |
| Method | `node scripts/skill-exercise-runner.mjs --skill draft-issue` |
| Result | 13 passed, 0 failed, 1 non-applicable bug-only criterion skipped |

The deterministic exercise validated bundle size and metadata, reference resolution, inventory consistency, and a feature issue payload with action-oriented title, three Given/When/Then acceptance criteria, user story, and explicit out-of-scope content.

### Disposable OMP RPC Exercise

| Field | Value |
|-------|-------|
| Test project | Disposable temporary Git repository; removed after capture |
| Method | `node scripts/exercise-omp.mjs --cwd <project> --timeout-ms 300000 -- /sdlc-draft-issue ...` |
| Duration | 193.87 seconds |
| Result | Dry-run plan produced; no GitHub commands or mutations executed |

The RPC harness cannot exercise native TUI `ask` or complete `xd://propose`; it reported that no native plan awaited approval. It nevertheless produced a dry-run issue plan containing a title, full body, Given/When/Then acceptance criteria, explicit scope, and exact `ghCreateArgs`. Per `exercise-testing.md`, interactive ask behavior is therefore proven by the focused source-contract suite rather than inferred from the RPC fallback.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `cd scripts && npm test -- --runInBand`: 37 suites passed, 355 tests passed, 1 intentionally skipped; exit 0. |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: 43 items mapped, clean. |
| OMP plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository`: passed. |
| Skill creator validation | Pass | Resolved and read `skill://skill-creator`; reviewed affected WORKFLOW/reference bundle against its authoring rules. Its validator targets `SKILL.md` directories and is not applicable to this repository's `WORKFLOW.md` format; applicable inventory, plugin-surface, prompt-quality, test, and exercise validators pass. |
| Skill exercise | Pass | Deterministic `draft-issue` exercise: 13 pass, 0 fail, 1 non-applicable skip; disposable OMP RPC dry run captured with no GitHub mutation. |
| Prompt quality | Pass | Instructions are imperative, completion-based, tool-first, preserve gate boundaries, and keep references valid and focused. |
| Git hygiene | Pass | `git diff --check main...HEAD`: exit 0 with no output. |

**Gate Summary**: 7/7 applicable gates passed, 0 failed, 0 incomplete.

## Fixes Applied

None. No safe local fixes were required.

## Remaining Issues

None.

## Positive Observations

- The cutover is minimal: three workflow/reference contracts, focused tests, and synchronized public documentation.
- Negative assertions cover several plausible quota-language regressions rather than one exact deleted sentence.
- Required classification, milestone, split-confirm, tool-first, and approval boundaries remain explicit.
- Unrelated interactive budgets are locked by direct source assertions.

## Recommendations Summary

### Before PR (Must)

- [x] No remaining local obligation.

### Short Term (Should)

- [x] No follow-up required for issue #209.

### Long Term (Could)

- [ ] A future harness could add native TUI automation for interactive `ask` and `xd://propose`; this is not required by the approved source-assertion verification design.

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `workflows/draft-issue/WORKFLOW.md` | 0 | Completion rule and preserved gates align with AC1–AC3. |
| `workflows/draft-issue/references/interview-depth.md` | 0 | Quota removed; per-call and no-default rules explicit. |
| `workflows/draft-issue/references/multi-issue.md` | 0 | Single split-confirm gate preserved without skill-wide quota. |
| `scripts/__tests__/interactive-plan-contract.test.mjs` | 0 | Focused source-contract regression coverage matches the design. |
| `README.md` | 0 | Public behavior reflects interview-to-completion semantics. |
| `CHANGELOG.md` | 0 | Unreleased change recorded. |

## Recommendation

**Ready for PR**

All issue-owned acceptance criteria, functional requirements, tasks, scenarios, architecture areas, and applicable local verification gates pass. No PR-only evidence is required.
