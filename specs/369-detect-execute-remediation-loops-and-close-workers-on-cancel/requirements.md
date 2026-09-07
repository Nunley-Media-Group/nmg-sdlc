# Requirements: Detect execute remediation loops and close workers on cancel

**Issue**: #369
**Date**: 2026-09-06
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/366-route-recoverable-implementation-failures-into-repair-and-reverification/

## User Story

**As a** operator running `/sdlc-execute` in a Herdr OMP session
**I want** the controller to detect when remediations are not advancing the current step and to close its owned workers when I cancel
**So that** a stuck implement/review/fix/verify/deliver worker cannot burn unbounded model usage

## Background

On pennyscan issue #137, `/sdlc-execute` completed start, then remediating implement thirteen times without advancing `currentStep`. Cancelling the controller job did not stop the owned rem worker pane. nmg-sdlc already auto-remediates failed workers and already treats `blocked` / `intervention: true` as a stop, but it has no loop detector based on step progress and cancel does not reliably close owned panes.

## Current State

`scripts/sdlc-execute.mjs` remediates `implement`, `review1`, `fix1`, `review2`, `fix2`, `verify`, and `deliver` when a settled handoff is `status: failed` and `intervention: false`. Attempt count increments with no progress check. `blocked` or `intervention: true` can mark remediation stopped, but a later `/sdlc-execute` resume of the same failed step can start another rem worker. SIGINT/SIGTERM attempt worker cleanup only inside the Node process; cancelling the controller job can leave `run.json` still owning a live rem pane.

## Acceptance Criteria

Each criterion uses Given/When/Then format. These become Gherkin BDD test scenarios.

### AC1: Failed worker may remediate once while the step can still advance

**Given** a remediable step has a settled failed handoff with `intervention: false` and that step is not yet in `completed`
**When** `/sdlc-execute` continues the run
**Then** the controller may start at most one remediation worker for that step before checking progress

### AC2: Two remediations without step progress hard-stop

**Given** two remediations for the same issue and step have finished
**And** `currentStep` has not advanced and the step is still absent from `completed`
**When** the controller would otherwise start another remediation worker
**Then** it hard-stops the run with a distinct loop reason, does not start another worker, and closes controller-owned worker panes

### AC3: Blocked or intervention handoffs are not a good remediation

**Given** a settled worker handoff with `status: blocked` or `intervention: true`
**When** `/sdlc-execute` observes that handoff
**Then** it hard-stops without starting a remediation worker for that step

### AC4: A remediation that advances the step continues the pipeline

**Given** a remediation worker finishes with a passed handoff and the step is recorded in `completed`
**When** `/sdlc-execute` continues
**Then** it proceeds to the next required step and does not treat the run as a loop

### AC5: Loop detection applies to every remediable step

**Given** the current step is one of implement, review1, fix1, review2, fix2, verify, or deliver
**When** two remediations finish without that step advancing
**Then** the same hard-stop behavior applies

### AC6: Cancel closes owned workers

**Given** `/sdlc-execute` owns one or more worker panes and `--retain-worker` was not passed
**When** the controller receives SIGINT or SIGTERM, or the controller job is cancelled
**Then** it closes those owned panes, records a cancelled failure, and does not leave a rem/start/implement/review/fix/verify/deliver worker running for that run

### AC7: Retain-worker still keeps the pane

**Given** `/sdlc-execute` was invoked with `--retain-worker`
**When** the controller stops or is signalled
**Then** the owned worker pane is left open as today

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | After two remediations for the same issue and step with no `currentStep` / `completed` advance, `/sdlc-execute` must hard-stop and close owned workers. | Must |
| FR2 | `blocked` or `intervention: true` handoffs must hard-stop immediately and must not start a remediation worker. | Must |
| FR3 | `failed` with `intervention: false` may start a remediation worker only while the step can still advance under FR1. | Must |
| FR4 | SIGINT, SIGTERM, and controller-job cancel without `--retain-worker` must close controller-owned worker panes before exit. | Must |
| FR5 | Loop hard-stop must record a distinct reason separate from a generic `implementation_failed`. | Should |
| FR6 | `--retain-worker` remains the explicit opt-out of pane close. | Should |

## Out of Scope

- Extra classifier or strategy-rewrite workers
- A published reasonCode continue/stop table beyond `blocked` / `intervention` / failed-progress
- A hard attempt cap that fires even when `currentStep` advanced
- Pennyscan #137 product implementation or frozen-research retirement
- Changing review protocol, prompt text, or Herdr pane UX except owned-worker close on cancel/stop

## Priority

High

## Notes

Evidence: pennyscan `.omp/sdlc/run.json` run `fc4e5751-9dfa-4210-96f8-d6c4b1a80a8d`, issue 137, `currentStep` implement, remediation attempt 13, worker `r137-implement` still recorded after the controller job was cancelled. nmg-sdlc 3.20.10. Plugin path `scripts/sdlc-execute.mjs`.

## Contract precedence

This issue supersedes only the unlimited same-step retry and cancellation behavior in #259 and #366. In-scope repair remains autonomous. Two completed remediations without advancement are a loop; elapsed time, commits, changing summaries, or model activity alone are not advancement. An unchanged stopped handoff or loop checkpoint remains stopped on reinvocation. A subsequently validated passed handoff may advance the pipeline. Genuine blocked/intervention handoffs are never converted into failed non-intervention handoffs to restart work.

## Additional operator acceptance criteria

### AC8: Keep smoke verification bounded and plugin-scoped

**Given** nmg-sdlc changes are verified against `Nunley-Media-Group/nmg-sdlc-smoke`
**When** an exercise exposes a failure
**Then** repair only a confirmed nmg-sdlc defect; modify smoke code only as a necessary fixture to prove a named plugin change, and stop unchanged/no-progress or unrelated smoke-project failures rather than repeatedly repairing them. Registered steering must state this boundary.

### AC9: Document complete supported operation

**Given** a user installs or updates nmg-sdlc
**When** they follow `README.md`
**Then** they can find concrete installation, prerequisite, setup, command, issue/spec publication, execution/resume/cancel/debug, verification/smoke-scope, troubleshooting, and exact-head completion instructions. Review the complete implementation against literal `main` and fix actionable findings before delivery.

## Change History

| Issue | Date | Summary |
|---|---|---|
| #369 | 2026-09-06 | Initial approved feature spec under the requested contribution repair workflow |
| #369 | 2026-09-06 | Added the user's explicit smoke-scope, loop-safety, complete README, and native main-review requirements |
