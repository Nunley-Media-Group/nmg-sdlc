# Requirements: Add controller-owned fresh-session remediation loops

**Issue**: #259
**Date**: 2026-08-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/249-make-execute-resume-active-issue-state-safely/

---

## User Story

**As a** Herdr OMP execute operator
**I want** `/sdlc-execute` to own fresh-session remediation when a remediable step handoff fails
**So that** recovery does not depend on manually closing a failed worker pane and restarting the same step until the queue can continue

---

## Background

During the #213 two-issue live GitHub smoke, failed verify sessions were manually closed and replaced with fresh sessions until both issues passed. That recovery worked, but it was operator-driven and left an extra top-level pane when the failed worker was not closed first.

`runExecute` in `scripts/sdlc-execute.mjs` launches sibling `--kind omp` workers named `s<N>-<step>` for `start`, `implement`, `review1`, `fix1`, `review2`, `fix2`, `verify`, and `deliver`. A valid passed non-intervention idle/done handoff is consumed and that pane is closed. Any other outcome calls `stopResult`, which writes `run.failed = { issue, step, reasonCode }`, notifies `Stopped on #<N> <step>. Worker pane <pane> agent <name> left open.`, and exits 1.

Neighboring approved specs require that keep-open stop for non-remediable outcomes: #194 AC3, #208 AC3, #216 AC2, #241 AC7, and #249 AC2. #231 rewind via `remediationCompletedSteps` still applies only on a later resume when a failed or intervention handoff's `next` is a same-or-earlier `VALID_STEPS` target. This spec does not rewrite those packages. It is the later contract: remediable validated `status: failed` idle/done handoffs for the listed steps may close after evidence capture; blocked, unknown, missing/invalid, stalled, `intervention: true`, and `start` keep-open stays.

Deliver's in-worker PR remediation is unchanged when the deliver handoff has not failed.

---

## Acceptance Criteria

Each criterion becomes a Gherkin scenario.

### AC1: Remediable failure starts one fresh rem session

**Given** `/sdlc-execute` receives a validated `status: failed` handoff for a remediable step (`implement`, `review1`, `fix1`, `review2`, `fix2`, `verify`, or `deliver`) whose worker is idle or done
**And** the handoff is not `blocked`, not unknown, and not `intervention: true`
**When** the controller evaluates that outcome
**Then** it first persists the exact failure reason, named artifacts, current run state, and the closed worker's name and pane id
**And** it then closes that failed top-level step pane before creating any rem session
**And** it starts exactly one fresh OMP rem session named `r<N>-<step>` with a compact deterministic recovery prompt
**And** after remediating, that session reruns the same failed step and writes `.omp/sdlc/handoffs/<N>-<step>.json` with the original step identity
**And** when that rerun produces a valid passed non-intervention handoff for the original step identity, execute consumes it normally and continues later workflow steps without a manual reinvoke

### AC2: Failed rem retries use another fresh session

**Given** a rem session for a remediable failed step settles without a passed non-intervention original-step handoff
**And** the outcome is still remediable rather than a genuine external or intervention blocker
**When** the controller captures that retry evidence
**Then** it closes that rem pane after the evidence is persisted
**And** it starts another fresh rem session named `r<N>-<step>` with a new context (incremented attempt plus the latest failure reason and artifacts)
**And** it does not leave the previous rem pane open beside the next rem pane
**And** it does not accumulate a third top-level pane relative to the execute controller

### AC3: Blocked, unknown, intervention, and start stay preserved

**Given** a worker is `blocked`, unknown, missing or invalid as a handoff, genuinely stalled, `intervention: true`, or the failed step is `start`
**When** execute evaluates that worker
**Then** it does not close that worker to start a rem session
**And** it does not start a rem session
**And** it stops fail-closed with the relevant pane preserved
**And** persisted run state still names the issue, step, worker, pane, and reason

### AC4: Genuine blocker ends rem and leaves rewind available

**Given** remediable retries have run
**When** a rem session reaches a genuine external or intervention blocker
**Then** execute stops fail-closed after persisting that blocker evidence
**And** it does not start another rem session for that outcome
**And** a later resume may still use the existing backward-`next` rewind only after rem has stopped and no live `r<N>-<step>` worker remains
**And** later queued issues still do not start until the current issue is merged and closed

### AC5: Topology stays one rem pane and one step identity

**Given** rem is running or has just passed
**When** an operator inspects panes, agents, and handoffs
**Then** recovery never has the failed top-level `s<N>-<step>` pane and a rem pane open at the same time
**And** no second `s<N>-<step>` worker exists for the same issue and step
**And** on pass the controller's expected step identity and handoff are restored so later steps consume the original step, not a leftover rem identity
**And** resume of an interrupted rem run does not duplicate a live rem or step worker

### AC6: Behavioral coverage proves the rem loop

**Given** focused execute controller fixtures
**When** those tests run
**Then** they prove pane count and topology for close-then-rem
**And** they prove each retry receives a fresh session rather than reuse of the failed context
**And** they prove deterministic handoff transfer from rem pass back to the original step
**And** they prove no duplicate workers
**And** they prove successful automatic continuation after rem pass
**And** they prove fail-closed preservation for blocked, unknown, intervention, start, and external-blocker outcomes

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Persist exact failure reason, artifacts, run state, and closed-worker name/pane before closing a remediable failed top-level pane. | Must | Extend `run.json` with optional `remediation`; keep `schemaVersion: 1`. |
| FR2 | Close the failed top-level step pane before creating the rem session so recovery never adds a third top-level pane. | Must | Close failure is `pane_close_failed` and must not start rem. |
| FR3 | Give each rem session a compact deterministic recovery prompt that diagnoses the persisted failure, fixes it, updates the approved issue spec only when observable behavior changes, and commit/pushes through the existing execute gates. | Must | Header plus existing `workerPrompt({ step: failedStep })`. No `worker:rem` snippet consumer. |
| FR4 | After remediating, rerun the same failed step and restore the controller's expected step identity/handoff before normal consumption. | Must | Handoff path and `step` stay `<N>-<original>`. |
| FR5 | Repeat close-then-fresh-rem until the original step passes or a genuine external/intervention blocker is reached. | Must | No attempt cap. |
| FR6 | Apply the loop to failed `implement`, `review1`, `fix1`, `review2`, `fix2`, `verify`, and `deliver` handoffs. Do not apply it to `start`. | Must | `REMEDIABLE_STEPS` excludes `start`. |
| FR7 | Do not close or replace blocked, unknown, stalled, missing/invalid, or `intervention: true` workers. | Must | Existing `stopResult` keep-open sentence. |
| FR8 | Keep existing backward-`next` rewind, but only after rem has stopped. A remediable failure must rem and rerun the same step first. | Must | Do not call `remediationCompletedSteps` on a remediable first observation. |
| FR9 | Product edits, spec edits, commits, pushes, reviews, and PR writes stay in sibling OMP workers. The execute pane still does not implement tasks or open PRs. | Must | Rem workers are `--kind omp`. |
| FR10 | Add behavioral coverage for topology, fresh context per iteration, handoff transfer, no duplicate workers, automatic resume/continue, and fail-closed blockers. | Must | Update existing intervention keep-open tests only if they would false-fail; do not flip `failedStep` to remediable. |

---

## Out of Scope

- Fresh-session rem loops for `start` failures
- Closing blocked, unknown, stalled, or intervention workers to force rem
- Replacing deliver's in-worker PR remediations when the deliver handoff has not failed
- A plugin-owned background daemon or unattended retry service
- Changing `/sdlc-execute` issue selection or write-spec publication
- Weakening `validateHandoff` or accepting unvalidated handoffs
- Adding `rem` to `VALID_STEPS` or `WORKER_CONSUMERS`
- Rewriting historical spec directories #194, #208, #216, #231, #241, or #249

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #259 | 2026-08-25 | Initial feature spec |
