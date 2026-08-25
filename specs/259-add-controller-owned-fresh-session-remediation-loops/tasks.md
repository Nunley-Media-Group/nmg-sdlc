# Tasks: Add controller-owned fresh-session remediation loops

**Issue**: #259
**Date**: 2026-08-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/249-make-execute-resume-active-issue-state-safely/

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Controller | 3 | [ ] |
| Testing | 2 | [ ] |
| **Total** | 5 | |

---

## Phase 1: Controller

### T001: Add remediable predicate and persist-then-close

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Exports `REMEDIABLE_STEPS` exactly `['implement','review1','fix1','review2','fix2','verify','deliver']`
- [ ] Exports `remAgentName(issue, step)` returning `` `r${issue}-${step}` ``
- [ ] Exports `isRemediableFailedHandoff({ step, state, handoff })` per design.md
- [ ] On remediable failed idle/done in both the retained path and the new-worker path, write `run.failed` and `run.remediation` (attempt, reasonCode, summary, artifacts, closedWorker, history row, `remWorker: null`) **before** `closePane`
- [ ] Close failure → `stopResult` `pane_close_failed`; rem is not started
- [ ] `VALID_STEPS`, `validateHandoff`, and `WORKER_CONSUMERS` mapping are unchanged
- [ ] `start`, `blocked`, `intervention: true`, missing/invalid, stalled, and unknown pane still call `stopResult` and do not close for rem

**Notes**: Reuse `closePane` and `writeRun`. Do not bump `schemaVersion`.

### T002: Start one rem session with the recovery prompt

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] After a successful close, split one new pane and `agentStart({ name: remAgentName(issue, step), paneId, kind: 'omp' })` with the same start-retry as step workers
- [ ] Exports `remediationPrompt({ issue, failedStep, evidence, cwd })` with the exact header in design.md followed by `---` and `workerPrompt({ step: failedStep, issue, cwd })`
- [ ] CLI accepts `--step rem --issue N --failed-step <REMEDIABLE_STEP>` and rejects `start` or missing failed-step with the rem usage line, exit 2
- [ ] `workerPrompt({ step: 'rem' })` still throws
- [ ] Review rem (`review1`/`review2`) still runs `completeInteractiveReview` on the rem agent before waiting for the original review handoff
- [ ] Rem session is required to write `.omp/sdlc/handoffs/<N>-<step>.json` with original `issue` and `step`; mismatch or `step: 'rem'` is `invalid_handoff` / `missing_handoff` keep-open, not another rem
- [ ] Passed non-intervention original-step handoff closes the rem pane, sets `remediation` to null, pushes the original step onto `completed`, and continues `nextStep`

**Notes**: Do not add `worker:rem` to `src/sdlc-prompt-snippets.mjs`. Do not edit execute `WORKFLOW.md` unless a one-line rem note is required for packaging; prefer controller-only.

### T003: Retry rem, resume without duplicates, rewind only after rem stops

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] Another remediable failed original-step handoff from rem appends history, increments `attempt`, closes that rem pane, and starts a new `r<N>-<step>` with the new evidence in the prompt
- [ ] Blocked, intervention, missing/invalid, stalled, or unknown rem outcomes call `stopResult` and do not start another rem
- [ ] Before launching `s${issue}-${step}`, if `r${issue}-${step}` is live, wait or evaluate that rem worker and never start a second rem or the step worker
- [ ] If rem is `active` in `run.remediation` and no rem worker is live, start rem, not `s${issue}-${step}`
- [ ] `remediationCompletedSteps` runs only when remediable rem does not apply and no live rem worker exists
- [ ] Later queued issues still wait for MERGED+CLOSED
- [ ] Execute pane still does not implement tasks or open PRs

**Notes**: Live step scan may stay `startsWith(\`s${issue}-\`)`. Rem lookup is exact `r${issue}-${step}`.

---

## Phase 2: Testing

### T004: Add rem-loop controller tests

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] `makeControllerFixture` gains `remediableFailedStep` that writes `status: 'failed'` and `intervention: false` without changing `failedStep`
- [ ] Tests listed in design.md Testing Strategy exist and assert pane order, rem names, original handoff identity, no duplicate workers, auto-continue, and fail-closed blockers
- [ ] Existing `keeps a failed worker pane and sends the exact notification` still expects `s42-implement` left open (intervention)
- [ ] Existing rewind tests still use the intervention/failedNext fixture path
- [ ] Gherkin tags `@SCN001`–`@SCN006` map to AC1–AC6
- [ ] `scripts/__tests__/sdlc-prompt-snippets.test.mjs` still expects `WORKER_CONSUMERS` to equal `VALID_STEPS.map((step) => \`worker:${step}\`)`

**Notes**: Track rem agents in `listAgents` from `starts` so resume tests observe `r42-verify`.

### T005: Verify the focused execute controller suite

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Verify (no file changes)
**Depends**: T004
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs` exits 0
- [ ] Eight-worker happy path still starts `s42-start` through `s42-deliver` with no rem names
- [ ] Serial later-issue test still starts no `#43` worker while `#42` is failed or remming

---

## Dependency Graph

```
T001 ──▶ T002 ──▶ T003 ──▶ T004 ──▶ T005
```

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #259 | 2026-08-25 | Initial feature spec |

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Each task has single responsibility
- [x] Dependencies are correctly mapped
- [x] Tasks can be completed independently (given dependencies)
- [x] Acceptance criteria are verifiable
- [x] File paths reference actual project structure (per `structure.md`)
- [x] Test tasks are included
- [x] No circular dependencies
- [x] Tasks are in logical execution order
