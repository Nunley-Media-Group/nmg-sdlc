# Tasks: Fix run-loop continuing after issue escalation

**Issue**: #131
**Date**: 2026-04-27
**Status**: Planning
**Author**: Codex

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Fix continuous-mode escalation shutdown | [ ] |
| T002 | Add runner regression tests | [ ] |
| T003 | Add BDD regression scenarios | [ ] |
| T004 | Verify no regressions | [ ] |

---

### T001: Fix Continuous-Mode Escalation Shutdown

**File(s)**: `scripts/sdlc-runner.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] A mid-cycle `result === 'escalated'` in continuous mode terminates the current runner invocation instead of returning to issue selection.
- [ ] No later `startIssue` step runs in the same invocation after an issue-level escalation.
- [ ] Failed issue number and branch remain available in logs or state for manual recovery.
- [ ] Successful merge behavior remains eligible to continue to another automatable issue.

**Notes**: Follow the fix strategy from `design.md`. Keep the change scoped to escalation-vs-success loop control.

### T002: Add Runner Regression Tests

**File(s)**: `scripts/__tests__/sdlc-runner.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Test coverage simulates a continuous-mode mid-cycle escalation and proves the runner stops.
- [ ] Test coverage proves no subsequent `startIssue` selection is invoked after the escalation.
- [ ] Test coverage preserves the positive path where successful merge completion can continue to the next cycle.
- [ ] Tests are deterministic and use existing runner mocking patterns.

**Notes**: Prefer existing exported test seams (`main`, `runStep`, `__test__`, and mocked `execSync` / `spawn`) over adding production-only test hooks.

### T003: Add BDD Regression Scenarios

**File(s)**: `specs/bug-fix-run-loop-continuing-after-issue-escalation/feature.gherkin`
**Type**: Create
**Depends**: T001
**Acceptance**:
- [ ] Every acceptance criterion from `requirements.md` has a matching scenario.
- [ ] Every scenario is tagged `@regression`.
- [ ] Scenarios cover both the failed-escalation stop path and the successful-continuation path.
- [ ] Feature file uses valid Gherkin syntax.

### T004: Verify No Regressions

**File(s)**: `scripts/__tests__/sdlc-runner.test.mjs`, `scripts/sdlc-runner.mjs`, `specs/bug-fix-run-loop-continuing-after-issue-escalation/`
**Type**: Verify
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] Targeted runner tests pass.
- [ ] The broader script test suite passes or any unrelated failure is documented with evidence.
- [ ] Placeholder/template-residue grep over the spec directory returns no results.
- [ ] No unrelated runner behavior changes are included in the diff.

---

## Critical Path

T001 -> T002 -> T003 -> T004

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #131 | 2026-04-27 | Initial defect tasks |

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
