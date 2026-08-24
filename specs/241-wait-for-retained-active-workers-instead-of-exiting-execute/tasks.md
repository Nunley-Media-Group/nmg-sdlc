# Tasks: Wait for retained active workers instead of exiting execute

**Issue**: #241
**Date**: 2026-08-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/219-harden-execute-against-transient-herdr-lifecycle-races/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Replace the live-worker status-0 return with wait-or-fail-closed | [ ] |
| T002 | Rewrite and add retained-worker regression tests | [ ] |
| T003 | Verify the focused execute controller suite | [ ] |

---

### T001: Replace the live-worker status-0 return

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] The `else` that prints `Existing worker ${agentName} in pane ${paneId}; no second worker started.` and returns `{ status: 0, … }` is gone and is no longer a successful exit
- [ ] `!step` or `agentName !== \`s${issue}-${step}\`` returns `stopResult` with `reasonCode: 'retained_worker_mismatch'` and starts no worker
- [ ] Matching name with `paneId === 'unknown'` returns `stopResult` with `reasonCode: 'unknown_pane'` and does not wait
- [ ] Matching name with `state === 'working'` calls `herdrApi.agentWait({ name: agentName })` with no `until` and no timeout; wait failure returns `stopResult` with `reasonCode: 'worker_failed'`
- [ ] Matching name with any other non-idle/non-done state calls existing `waitForWorkerSettlement(herdrApi, agentName)`; false returns `stopResult` with `reasonCode: 'worker_failed'`
- [ ] After a successful wait, control re-reads `agentState` and uses the existing idle/done handoff + `remediationCompletedSteps` block (no second copy of validation)
- [ ] Idle/done matching known-pane workers still skip the wait and continue as they do today
- [ ] `validateHandoff`, review-menu `review_failed`, stall `agent_prompt_stalled`, preflight gates, and `syncAndDeleteIssueBranch` are unchanged
- [ ] `stopResult` sentence remains `Stopped on #<N> <step>. Worker pane <pane_id> agent s<N>-<step> left open.`

**Notes**: Follow the four-step branch order in design.md. Do not add a new exported helper. Do not edit `workflows/execute/WORKFLOW.md`.

### T002: Rewrite and add retained-worker regression tests

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] `does not start a second worker when an issue worker is live` no longer expects status 0 plus `no second worker started`. Keep the current fixture (`listAgents` → `s42-verify` working, default `nextStep` is `start`). Expect status 1, `fixture.starts` empty, pane not closed, `failed.reasonCode === 'retained_worker_mismatch'`, and the stop sentence `Stopped on #42 start. Worker pane kept-pane agent s42-verify left open.`
- [ ] `keeps an active failed verification worker open` still uses `configureFailedRetainedVerifyWorker(fixture, { state: 'working' })`. Override `agentWait` so a no-`until` wait for `s42-verify` succeeds without rewriting `42-verify.json`, and so `agentGet` then reports `idle`. Expect status 1, no new starts, `kept-verify-pane` not closed, `failed.reasonCode === 'verification_failed'`, stdout does not contain `no second worker started`, and the stop sentence names `#42 verify`, `kept-verify-pane`, and `s42-verify`
- [ ] New test: matching retained working `s42-start` (empty `completed['42']`, passed `42-start.json` written only when `agentWait({ name: 's42-start' })` with no `until` runs; `agentGet` becomes `idle` after that wait). Expect no second `s42-start`, at least one no-`until` wait for `s42-start` with no `timeout` key, later steps started, and status 0 for the full fixture happy path
- [ ] New test: matching retained `blocked` worker uses `waitForWorkerSettlement` (`until: 'working'` then bare wait). When that wait returns non-success, expect status 1, `failed.reasonCode === 'worker_failed'`, no starts, pane open
- [ ] New test: matching name with missing pane id (`pane_id` / `paneId` absent) expects status 1, `failed.reasonCode === 'unknown_pane'`, no `agentWait` calls, no starts
- [ ] Existing idle/done resume tests (`resumes a retained worker from realistic … Herdr JSON`, idle failed-verify remediation) still pass and do not require a wait before evaluating an already idle/done worker
- [ ] Existing fail-closed coverage for missing, invalid, failed, stalled, and intervention handoffs remains
- [ ] Gherkin tags `@SCN001`–`@SCN010` with `@regression` are the scenario ids for AC1–AC10; tests are the executable form

**Notes**: Reuse `makeControllerFixture`, `configureFailedRetainedVerifyWorker`, `configurePassedRetainedStartWorker`, `writeApproved`, `env`, and issue `42`. Extend the fixture only if a small local override is cleaner than copying the Herdr stub.

### T003: Verify no regressions

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Verify (no file changes)
**Depends**: T001, T002
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs` exits 0
- [ ] Eight-worker happy path still starts `s42-start` through `s42-deliver` and closes those panes
- [ ] Serial later-issue test still starts `s43-start` only after #42 is completed in that fixture
- [ ] Review-mode selection failure still uses `review_failed` and does not launch later steps

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T002)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
