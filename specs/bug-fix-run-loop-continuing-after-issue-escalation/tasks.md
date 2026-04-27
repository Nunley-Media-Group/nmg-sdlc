# Tasks: Fix run-loop continuing after issue escalation

**Issue**: #131
**Date**: 2026-04-27
**Status**: Planning
**Author**: Codex

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Fix continuous-mode escalation shutdown | [x] |
| T002 | Preserve failed branch on escalation | [x] |
| T003 | Add runner regression tests | [x] |
| T004 | Add BDD regression scenarios | [x] |
| T005 | Align older run-loop spec text | [x] |
| T006 | Verify no regressions | [x] |

---

### T001: Fix Continuous-Mode Escalation Shutdown

**File(s)**: `scripts/sdlc-runner.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [x] A mid-cycle `result === 'escalated'` in continuous mode terminates the current runner invocation instead of returning to issue selection.
- [x] Terminal continuous-mode escalation sets a non-zero process exit status.
- [x] No later `startIssue` step runs in the same invocation after an issue-level escalation.
- [x] Failed issue number and branch remain available in logs or state for manual recovery.
- [x] Successful merge behavior remains eligible to continue to another automatable issue.

**Notes**: Follow the fix strategy from `design.md`. Keep the change scoped to escalation-vs-success loop control.

### T002: Preserve Failed Branch On Escalation

**File(s)**: `scripts/sdlc-runner.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [x] Terminal escalation does not run `git checkout main`.
- [x] The repository remains on the failed issue branch named by runner state.
- [x] Existing successful-cycle checkout/merge behavior is unchanged.

**Notes**: The failed branch is the manual recovery surface; only clean cycle transitions should return to `main`.

### T003: Add Runner Regression Tests

**File(s)**: `scripts/__tests__/sdlc-runner.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [x] Test coverage simulates a continuous-mode mid-cycle escalation and proves the runner stops.
- [x] Test coverage proves no subsequent `startIssue` selection is invoked after the escalation.
- [x] Test coverage proves the terminal escalation action carries a non-zero exit status.
- [x] Test coverage proves `escalate()` does not check out `main`.
- [x] Test coverage preserves the positive path where successful merge completion can continue to the next cycle.
- [x] Tests are deterministic and use existing runner mocking patterns.

**Notes**: Prefer existing exported test seams (`main`, `runStep`, `__test__`, and mocked `execSync` / `spawn`) over adding production-only test hooks.

### T004: Add BDD Regression Scenarios

**File(s)**: `specs/bug-fix-run-loop-continuing-after-issue-escalation/feature.gherkin`
**Type**: Create
**Depends**: T001, T002
**Acceptance**:
- [x] Every acceptance criterion from `requirements.md` has a matching scenario.
- [x] Every scenario is tagged `@regression`.
- [x] Scenarios cover both the failed-escalation stop path and the successful-continuation path.
- [x] Feature file uses valid Gherkin syntax.

### T005: Align Older Run-Loop Spec Text

**File(s)**: `specs/feature-add-skill-to-run-full-sdlc-pipeline-loop-from-within-codex/requirements.md`, `specs/feature-add-skill-to-run-full-sdlc-pipeline-loop-from-within-codex/design.md`, `specs/feature-add-skill-to-run-full-sdlc-pipeline-loop-from-within-codex/feature.gherkin`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [x] No canonical run-loop spec says loop mode moves to the next issue after escalation.
- [x] Existing successful-loop behavior remains documented.
- [x] Failure behavior consistently says the loop halts and reports failure.

### T006: Verify No Regressions

**File(s)**: `scripts/__tests__/sdlc-runner.test.mjs`, `scripts/sdlc-runner.mjs`, `specs/bug-fix-run-loop-continuing-after-issue-escalation/`
**Type**: Verify
**Depends**: T001, T002, T003, T004, T005
**Acceptance**:
- [x] Targeted runner tests pass.
- [x] The broader script test suite passes or any unrelated failure is documented with evidence.
- [x] Placeholder/template-residue grep over the spec directory returns no results.
- [x] No unrelated runner behavior changes are included in the diff.

---

## Critical Path

T001 -> T002 -> T003 -> T004 -> T005 -> T006

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #131 | 2026-04-27 | Initial defect tasks |
| #131 | 2026-04-27 | Added tasks for non-zero exit, failed-branch preservation, stronger tests, and canonical-spec cleanup |

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Each task has single responsibility
- [x] Dependencies are correctly mapped
- [x] Tasks can be completed independently given dependencies
- [x] Acceptance criteria are verifiable
- [x] File paths reference actual project structure (per `structure.md`)
- [x] Test tasks are included
- [x] No circular dependencies
- [x] Tasks are in logical execution order
