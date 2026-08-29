# Tasks: Keep observing live review workers after prompt-wait failure

**Issue**: #320
**Date**: 2026-08-29
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/292-select-review-base-without-interactive-picker-parsing/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Make live review evidence authoritative after prompt-wait failure | [ ] |
| T002 | Add live-worker and pane-loss regressions | [ ] |
| T003 | Verify no regressions | [ ] |

---

### T001: Make live review evidence authoritative after prompt-wait failure

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `submitReviewProtocol` reads and validates the expected review handoff before rejecting a non-stall prompt failure.
- [ ] With no handoff, non-stall prompt failure returns `review_failed` only when the exact expected agent name and pane are not registered.
- [ ] When that worker remains registered, control reaches the existing `observeReviewHandoff` loop and can complete from a later valid artifact-backed handoff.
- [ ] Worker disappearance during observation still returns `process_lost`.
- [ ] Only `agent_prompt_stalled` can inspect the pasted prompt or send one Enter.
- [ ] No new timeout, retry loop, worker recreation, exported helper, handoff schema, or unrelated refactor.

**Notes**: Reuse `readExpectedHandoff`, `validReviewArtifact`, `workerStillPresent`, and `observeReviewHandoff`. Preserve exact name-plus-pane ownership checks and existing stop behavior.

### T002: Add live-worker and pane-loss regressions

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] A fresh review whose non-stall prompt wait fails while the exact review worker remains listed continues observation, accepts a later valid review artifact/handoff, exits successfully, and sends no keys.
- [ ] A valid artifact-backed handoff written during the failed non-stall prompt call is accepted instead of being overwritten by `review_failed`.
- [ ] A retained matching `s42-review1` worker with a prior failed run is not recreated; after a non-stall prompt failure it remains observed until valid review evidence appears.
- [ ] A non-stall prompt failure with no handoff and an absent worker still fails closed as `review_failed`; disappearance after observation starts still fails `process_lost` and does not auto-recreate the worker.
- [ ] Existing missing default-ref failure, successful prompt, `agent_prompt_stalled` one-Enter recovery, skipped-detection observation, invalid handoff, and human-review intervention tests remain unchanged and passing.
- [ ] Tests assert the corrected result, persisted failure reason when applicable, worker starts/closure, observation count, and empty `sentKeys` for non-stall failures.
- [ ] Both `@regression` scenarios in `feature.gherkin` are represented by Jest coverage.

### T003: Verify no regressions

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Verify (no file changes)
**Depends**: T001, T002
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs` exits 0.
- [ ] Review1/review2, retained review resume, stalled-prompt recovery, missing review-base, human-review intervention, and non-review worker cases pass in the focused run.

---

## Validation Checklist

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T002)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
