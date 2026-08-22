# Tasks: Honor passed worker handoff after prompt wait failure

**Issue**: #216
**Date**: 2026-08-22
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Remove the post-wait worker_failed early return | [ ] |
| T002 | Add wait-failure handoff regression tests | [ ] |
| T003 | Verify existing execute controller tests | [ ] |

---

### T001: Remove the post-wait worker_failed early return

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `runExecute` no longer returns `stopResult({ reasonCode: 'worker_failed' })` solely because `!commandSucceeded(prompted)` after `agentPrompt` / stall-recovery `agentWait`
- [ ] Control falls through to the existing `agentGet` + `validateHandoff` + match + idle/done + passed + `!intervention` checks
- [ ] Review-menu `review_failed` returns and stall-recovery `agent_prompt_stalled` returns are unchanged
- [ ] `stopResult` sentence remains `Stopped on #<N> <step>. Worker pane <pane_id> agent s<N>-<step> left open.`

**Notes**: Delete only the early return block immediately after the stall-recovery `prompted = herdrApi.agentWait({ name: agentName })` assignment. Do not add a new helper or wait-status reasonCode.

### T002: Add wait-failure handoff regression tests

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] A start-step case writes a valid passed non-intervention `42-start.json` during `agentPrompt`, returns `{ status: 1 }` from that prompt, and reports idle or done from `agentGet`; execute exits `0` for the start step, does not persist `failed.reasonCode: worker_failed`, records `start` in `completed['42']`, closes the pane created for start, and starts `s42-implement` (do not require later steps if the fixture then follows the existing happy path)
- [ ] A start-step case returns `{ status: 1 }` from `agentPrompt` without a matching passed non-intervention handoff; execute exits `1`, starts only `s42-start`, closes no pane, writes a failed run record, and notifies `Stopped on #42 start. Worker pane pane-1 agent s42-start left open.`
- [ ] A start-step case writes a valid passed handoff but `agentGet` reports a state that is not `idle` or `done`; execute exits `1`, keeps the start pane open, writes a failed run record, and uses the same stop sentence
- [ ] Existing retained-worker resume test still proves FR3: live idle/done `s42-start` with a passed handoff advances past start and does not start a second start worker
- [ ] Scenarios are the executable form of AC1, AC2, and FR3; tag names in Gherkin are `@SCN001` `@SCN002` `@SCN003` with `@regression`

**Notes**: Extend `makeControllerFixture` with an option (for example `promptStatus: 1`) rather than copying the whole Herdr stub. Reuse `writeApproved`, `env`, and issue `42`.

### T003: Verify no regressions

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Verify (no file changes)
**Depends**: T001, T002
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs` exits 0
- [ ] Mismatched handoff still persists `invalid_handoff` and keeps the pane
- [ ] Failed/intervention handoff still keeps the pane and notifies
- [ ] Review-mode selection failure still uses `review_failed` and does not launch later steps

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T002)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
