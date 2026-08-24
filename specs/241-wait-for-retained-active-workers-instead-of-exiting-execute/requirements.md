# Defect Report: Wait for retained active workers instead of exiting execute

**Issue**: #241
**Date**: 2026-08-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/219-harden-execute-against-transient-herdr-lifecycle-races/

---

## Reproduction

1. `/sdlc-execute 236` starts the delivery workflow and leaves a live worker such as `s236-fix2` in `working` state.
2. A later controller invocation finds that existing worker and returns: `Existing worker s236-fix2 in pane w6:p46; no second worker started.`
3. The controller exits successfully (`status: 0`).
4. No process remains to watch the worker, consume its handoff, continue later steps, or confirm that the issue was fully delivered.
5. The worker does not call back into the originating `/sdlc-execute` conversation. The operator must invoke `/sdlc-execute` again.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | After issue numbers are passed to `/sdlc-execute`, or after a backlog selection is accepted, the controller stays responsible until every selected issue is fully delivered (workflow complete, PR merged, GitHub issue closed). A live `s<N>-*` worker is reused and never duplicated. An active or unsettled matching worker is waited for with the same blocking Herdr `agentWait` used for newly started workers, then its handoff is validated and the queue continues. A name that does not match the persisted current step fails closed. |
| **Actual** | `runExecute` in `scripts/sdlc-execute.mjs` treats the first `s${issue}-*` agent from `firstAgentList(herdrApi.listAgents())` as `live`. Continuation runs only when `nextStep(...)` is still a step, the live name equals `s${issue}-${step}`, `agentState(...)` is `idle` or `done`, and the pane id is not `unknown`. Every other live-worker case prints `Existing worker ${agentName} in pane ${paneId}; no second worker started.` and returns `{ status: 0, stdout, stderr: '' }`. `waitForWorkerSettlement` / `herdrApi.agentWait` and `stopResult` are skipped. Focused tests `does not start a second worker when an issue worker is live` and `keeps an active failed verification worker open` currently expect that status-0 return. |

## Acceptance Criteria

### AC1: Retained worker is reused

**Given** `/sdlc-execute` is running for an explicit issue list or an already selected backlog
**And** a live agent matching `s<N>-*` already exists for the current issue
**When** the controller observes that worker
**Then** it does not create a second worker for the same issue and step

### AC2: Active worker does not end the command

**Given** that retained worker is active or otherwise unsettled
**When** the controller would previously print `Existing worker …; no second worker started.` and return success
**Then** `/sdlc-execute` does not return merely because the worker is active
**And** it remains responsible for the selected issues

### AC3: Wait without busy-spinning

**Given** a retained worker is still running
**When** the controller stays attached
**Then** it waits for settlement without a tight CPU-consuming poll loop
**And** it detects when the worker becomes idle or done
**And** it does not introduce a shorter wait timeout than the default blocking Herdr wait already used for newly started workers

### AC4: Passed handoff advances

**Given** the retained worker settles
**And** `.omp/sdlc/handoffs/<N>-<step>.json` validates as `status: passed` and `intervention: false` for that issue and step
**When** the controller consumes the handoff
**Then** it marks the step complete and starts the next workflow step automatically

### AC5: Queue continues through delivery

**Given** selected issues are still open
**When** each step’s passed, non-intervention handoff is consumed
**Then** the queue continues through delivery until each selected pull request is merged and each selected GitHub issue is closed

### AC6: Selected issues stay serial

**Given** two or more selected issues
**When** the current issue is still not both merged and closed
**Then** the next issue’s first worker is not started
**And** the next issue starts only after the current issue is merged and closed

### AC7: Fail-closed handoffs stay fail-closed

**Given** a retained or new worker settles into a failed, blocked, missing, invalid, stalled, or intervention-required handoff, or wait/settlement itself fails
**When** the controller evaluates that outcome
**Then** it does not return success and does not silently abandon orchestration
**And** the relevant worker pane stays open
**And** persisted run state records an actionable failure
**And** the operator-visible status names the issue, step, worker, pane, and reason
**And** handoff validation is not weakened

### AC8: Interruption remains resumable

**Given** the controller is interrupted after run state has been persisted
**When** `/sdlc-execute` is invoked again with the same explicit issues or as a resume of that run
**Then** it resumes from persisted run state without recreating completed work or duplicate live workers

### AC9: Safety gates remain intact

**Given** existing Herdr, git, and GitHub preflight rules
**When** execute runs after this fix
**Then** `HERDR_ENV=1`, `HERDR_SOCKET_PATH`, `HERDR_PANE_ID`, OMP integration, `gh auth`, dirty-tree, spec-created, approval, and dependency gates still fail closed as they do now
**And** the orchestrator pane still does not edit product code, implement tasks, or open pull requests
**And** the orchestrator still does not stop Herdr, use `--kind pi`, or stash/reset/discard user work

### AC10: Focused tests prove the contract

**Given** the focused execute controller tests
**When** they run
**Then** they reproduce the premature status-0 return against the pre-fix branch
**And** they prove a live retained worker is reused, waited for, and then continued through later steps after a valid passed, non-intervention handoff
**And** they keep fail-closed coverage for failed, blocked, missing, invalid, stalled, and intervention-required outcomes

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Explicit `/sdlc-execute N …` arguments and already-selected backlog queues share the same retained-worker wait-and-continue contract. | Must |
| FR2 | A live `s<N>-*` worker is reused; a second worker for that issue/step is never started. | Must |
| FR3 | An active retained worker keeps the controller attached until settlement or a fail-closed stop. | Must |
| FR4 | A valid passed, non-intervention handoff advances to the next step without a manual `/sdlc-execute` reinvoke. | Must |
| FR5 | Delivery still requires merged PR plus closed issue before the next selected issue starts. | Must |
| FR6 | Failed, blocked, missing, invalid, stalled, and intervention-required outcomes remain fail-closed with the worker pane preserved. | Must |

## Out of Scope

- Starting duplicate workers for an issue that already has a live `s<N>-*` agent
- Tight polling that consumes excessive CPU
- Weakening `validateHandoff` or accepting invalid handoffs
- Bypassing serial merge-and-close gates
- Doing product-code work in the orchestrator pane
- Changing `validateHandoff`, handoff schema, worker names, review-menu `review_failed` returns, stall-recovery `agent_prompt_stalled` returns, or preflight gates

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #241 | 2026-08-24 | Initial defect report |
