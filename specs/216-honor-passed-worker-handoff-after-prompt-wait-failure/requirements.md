# Defect Report: Honor passed worker handoff after prompt wait failure

**Issue**: #216
**Date**: 2026-08-22
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

---

## Reproduction

1. In a Herdr OMP session, run `/sdlc-execute #N` for an approved issue whose next step is `start`.
2. Let the sibling `s<N>-start` worker run start-issue, write `.omp/sdlc/handoffs/<N>-start.json` as passed with `intervention: false`, print `NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/<N>-start.json`, and settle idle or done.
3. Have `herdr agent prompt <worker> ... --wait` return a non-success status after that handoff exists, or have the following agent-state lookup fail to report `idle`/`done`.
4. Inspect execute stdout, `.omp/sdlc/run.json`, the start handoff, and the worker pane.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Execute treats the matching passed, non-intervention handoff plus an idle/done worker as step success. It marks `start` complete, clears the failed record, closes a pane created by this run, and continues to the next queue step. It still fails closed, keeps the pane open, and notifies when the handoff is missing, mismatched, invalid, failed, blocked, or `intervention: true`, or when the worker is not idle/done after the wait. |
| **Actual** | Execute prints `Stopped on #<N> start. Worker pane <pane> agent s<N>-start left open.`, exits `1`, and writes `.omp/sdlc/run.json` with `failed.reasonCode: worker_failed` and `completed.<N>: []`. The start handoff remains passed. The worker pane stays open. The queue does not advance. |

## Acceptance Criteria

### AC1: Bug Is Fixed

**Given** a sibling start worker that has written `.omp/sdlc/handoffs/<N>-start.json` as a valid passed, non-intervention handoff for issue `N` step `start` and is idle or done
**When** the Herdr prompt-wait command returns a non-success status
**Then** execute does not persist `worker_failed` for that step
**And** it records `start` complete, continues to the next queue step, and closes a pane created by this run

### AC2: No Regression

**Given** a start worker whose handoff is missing, mismatched, invalid, failed, blocked, or `intervention: true`, or whose agent state is not idle or done after the wait
**When** execute evaluates that worker
**Then** it still stops non-zero, keeps that worker pane open, writes a failed run record, and notifies with `Stopped on #<N> start. Worker pane <pane_id> agent s<N>-start left open.`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | After a worker wait, a matching valid passed non-intervention handoff plus idle/done worker state is step success even when the prompt-wait command status is non-success | Must |
| FR2 | Missing, mismatched, invalid, failed, blocked, or intervention handoffs, and non-idle/non-done workers, still fail closed and keep the pane open | Must |
| FR3 | Re-running execute while the same idle/done `s<N>-start` worker remains live with that passed handoff still advances past start and does not start a second start worker | Must |

## Out of Scope

- Changing start-issue behavior or its handoff schema
- Adding execute steps or changing the stop notification sentence
- Requiring execute to print the raw Herdr prompt-wait error
- Recovering after a human closes the successful worker pane and execute deletes the handoff on relaunch

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #216 | 2026-08-22 | Initial defect report |
