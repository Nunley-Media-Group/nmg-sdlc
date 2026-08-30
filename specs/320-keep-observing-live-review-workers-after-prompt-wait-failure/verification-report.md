# Verification Report: Keep observing live review workers after prompt-wait failure

**Date**: 2026-08-30
**Issue**: #320
**Reviewer**: Codex
**Scope**: Implementation verification against approved defect specification

---

## Executive Summary

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

`submitReviewProtocol` now treats validated handoff evidence and the exact owned worker registration as authoritative after a non-stall prompt-wait failure. A live worker enters the existing handoff-or-disappearance observation loop; an absent worker still fails `review_failed`, and later disappearance still fails `process_lost`. Focused, full-suite, and deterministic steering validation passed.

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.omp/sdlc/verification/320.json`
- Head: `3479b996a386b58fec286685d1b976343039df9c`
- Coverage: 2 declared, 2 recorded, complete; no missing, duplicate, or unknown results
- Ceiling: none
- Required results: `repository.tests` passed; `repository.nmg-sdlc-smoke` passed

## Issue Scope

- Active issue: #320
- Spec: `specs/320-keep-observing-live-review-workers-after-prompt-wait-failure`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1]; FR [FR1, FR2]; tasks [T001, T002]; scenarios [SCN001]
- Regression: AC [AC2]; FR [FR3, FR4]; scenarios [SCN002]

<!-- nmg-sdlc-issue-scope: {"issueNumber":320,"specPath":"specs/320-keep-observing-live-review-workers-after-prompt-wait-failure","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1"],"functionalRequirements":["FR1","FR2"],"tasks":["T001","T002"],"scenarios":["SCN001"]},"regression":{"acceptanceCriteria":["AC2"],"functionalRequirements":["FR3","FR4"],"scenarios":["SCN002"]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | A listed exact review worker remains observable after a non-stall prompt-wait failure until valid artifact-backed evidence appears or the worker disappears, without stalled-prompt keys. | Pass | `scripts/sdlc-execute.mjs:1065-1096`; `scripts/__tests__/sdlc-execute.test.mjs:3068-3126`; retained-worker coverage at `scripts/__tests__/sdlc-execute.test.mjs:3653-3705`. |
| AC2 | Absent or disappearing workers fail closed without recreation, while existing review-base, stalled-prompt, intervention, and non-review paths remain unchanged. | Pass | `scripts/sdlc-execute.mjs:1073-1096`; `scripts/__tests__/sdlc-execute.test.mjs:3128-3186`; focused and full Jest runs passed. |

## Regression Obligations

- [x] AC2 / FR3 / SCN002: an already absent worker returns `review_failed` and is not recreated.
- [x] AC2 / FR3 / SCN002: a worker that disappears during observation returns `process_lost` and is not recreated.
- [x] AC2 / FR4 / SCN002: non-stall failures send no keys; `agent_prompt_stalled` remains the only one-Enter recovery path.
- [x] AC2 / FR4 / SCN002: missing review base, human-review intervention, retained resume, and non-review prompt behavior remain covered by the passing execute suite.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Make live review evidence authoritative after prompt-wait failure | Complete | Handoff validation precedes failure classification; exact name-plus-pane presence gates `review_failed`; existing observation loop is reused. |
| T002 | Add live-worker and pane-loss regressions | Complete | Fresh, already-written evidence, retained-worker, absent-worker, and disappearing-worker paths are covered. |
| T003 | Verify no regressions | Complete | Focused execute suite passed 191/191; full repository suite passed 726 tests with 2 skipped; deterministic gates passed 2/2. |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Submission classification remains in `submitReviewProtocol`; lifecycle polling remains in `observeReviewHandoff`. |
| Open/Closed | 5 | The fix reorders existing evidence and reuses existing helpers without adding a parallel polling mechanism. |
| Liskov Substitution | 5 | No subtype or substitutability contract changed. |
| Interface Segregation | 5 | No public interface, handoff schema, or worker API changed. |
| Dependency Inversion | 5 | Herdr operations remain injected and fixture-driven. |

**SOLID score**: 5/5

### Layer Separation

The controller continues to separate prompt submission, handoff validation, exact worker identity checks, and observation. No delivery or review-finalization responsibility moved into execute.

### Dependency Flow

`submitReviewProtocol` depends on the existing `readExpectedHandoff`, `validReviewArtifact`, `workerStillPresent`, and `observeReviewHandoff` boundaries. Tests inject Herdr behavior through the established fixture.

## Security Assessment

**Score**: 5/5

- Authentication and authorization are unaffected.
- No new input parsing, shell interpolation, or persisted data was introduced.
- Exact agent name and pane identity remain required, preventing another worker from authorizing progress.
- Artifact-backed passed handoffs remain validated before acceptance.

## Performance Assessment

**Score**: 5/5

The fix adds one bounded exact-worker registration lookup only on a non-stall failed prompt with no valid handoff. Live workers reuse the existing observation loop; no new allocation-heavy path, retry loop, timeout, or duplicate prompt was introduced.

## Testability Assessment

**Score**: 5/5

Regression fixtures directly control prompt status, worker registration, observation pauses, handoff creation, pane loss, worker starts, and sent keys. The tests assert persisted reason codes and non-recreation behavior.

## Error Handling Assessment

**Score**: 5/5

Valid evidence wins over command status. An absent worker produces `review_failed`; disappearance after observation begins produces `process_lost`; invalid handoffs remain `invalid_handoff`; stalled recovery remains isolated. Errors are machine-classified and fail closed.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 / SCN001 | Yes | Jest behavioral equivalent | Yes |
| AC2 / SCN002 | Yes | Jest behavioral equivalent | Yes |

### Coverage Summary

- Feature files: 1 file, 2 scenarios
- Step definitions: implemented as repository-standard Jest behavioral tests
- Focused execute tests: 191 passed, 0 failed
- Full repository tests: 726 passed, 2 skipped, 0 failed
- Plugin surface validation: passed

No workflow or agent path changed, so a changed-skill exercise was not applicable. The always-required consumer-project smoke ran through the steering provider and passed.

## Real Smoke Lifecycle Evidence

| Field | Evidence |
|-------|----------|
| Provider | `repository.nmg-sdlc-smoke` |
| Repository | `https://github.com/Nunley-Media-Group/nmg-sdlc-smoke` |
| Method | `exercise-omp /sdlc-status --json` with this checkout loaded |
| Status | Passed |
| Observable contract | stdout JSON returned `nextAction.command` as `/sdlc-draft-issue` |
| Artifact | `.omp/sdlc/verification/320.json` result `repository.nmg-sdlc-smoke` |

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` | Pass | Deterministic provider ran `npm test -- --runInBand`; exit 0 at exact head. |
| `repository.nmg-sdlc-smoke` | Pass | Live smoke clone returned valid `/sdlc-status --json` with `/sdlc-draft-issue` next action. |

**Gate Summary**: 2/2 passed, 0 failed, 0 incomplete

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| None | — | — | No verification finding required a fix. | — | — |

## Remaining Issues

None.

---

## Positive Observations

- The change is a minimal control-flow correction with no schema or public API changes.
- Exact name-plus-pane ownership remains authoritative.
- Regression coverage distinguishes already-absent and later-disappearing workers.
- Non-stall failures explicitly prove that no recovery keys are sent.

---

## Recommendations Summary

### Before PR (Must)

- [x] No unresolved critical or high-priority items.

### Short Term (Should)

- [x] No deferred medium-priority items.

### Long Term (Could)

- [x] No out-of-scope architectural work required.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-execute.mjs` | 0 | Minimal protocol sequencing fix. |
| `scripts/__tests__/sdlc-execute.test.mjs` | 0 | Complete fresh, retained, and pane-loss regressions. |
| `CHANGELOG.md` | 0 | Accurate unreleased fix entry mapped to #320. |
| `.omp/sdlc/verification/320.json` | 0 | Complete deterministic evidence with no ceiling. |

---

## Recommendation

**Ready for PR**

All approved delivery and regression obligations pass. Deterministic steering coverage is complete with no ceiling, both required gates passed at the exact clean head, focused and full Jest verification passed, and no unresolved architecture or acceptance finding remains.
