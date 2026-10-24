# Requirements: Make the /sdlc-execute session an Opus supervisor that inspects and steers every worker stage

**Issue**: #491
**Date**: 2026-10-24
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/470-fix-sdlc-execute-closing-worker-panes-while-their-background-work-runs/

## User Story

**As a** developer running `/sdlc-execute` in a Herdr pane
**I want** that session to run on Opus and supervise the Herdr worker panes: inspect every stage result, check in on running workers, and steer, re-dispatch or halt them when needed
**So that** a stalled, drifting or failing delivery is diagnosed and corrected by a capable model instead of being replayed mechanically until it fails

## Background

`/sdlc-execute` starts sibling Herdr `--kind claude` worker panes for the start, implement, verify and deliver stages. The session where the command runs is the orchestrator. Today it launches the deterministic controller in one `Bash` call and waits, so no model judgment is applied between stages or while a worker runs, and the call outlives the 600-second `Bash` tool timeout within the first stage. `SDLC_MODELS.commands["sdlc-execute"]` is `"haiku"`, so the hooks module rewrites the orchestrator's main-loop requests to Haiku.

A delivery supervised by hand showed the gaps this spec closes: an environmental verify failure routed to an implement repair; the most useful steering happened while a worker was still running; a repair worker committed changes outside the spec's files unnoticed; a verify worker hand-wrote the issue-scope marker with scenario titles (`scope_evidence_invalid`); a verify worker switched the shared checkout's branch; the supervisor tests broke under an ancestor `"type": "module"` `package.json`; and the integration-probe detail could print `exit undefined`.

This spec supersedes the `/sdlc-execute` (controller session) row of the model table in specs/464 and specs/482. Worker stage models, efforts and the repair model are unchanged.

## Acceptance Criteria

### AC1: Opus or Fable session runs execute on its own model

**Given** a Claude Code session inside Herdr whose model is an Opus or Fable model
**When** the person runs `/sdlc-execute`
**Then** the command proceeds, the orchestrator's main-loop requests go out on the session's own model with no Haiku override, and every worker still starts with its existing stage model and effort (start/implement/deliver `haiku`, verify `opus`, repair `opus`)

### AC2: A lesser model is told to switch and stopped

**Given** a session whose model is not an Opus or Fable model (for example Haiku or Sonnet)
**When** the person runs `/sdlc-execute`
**Then** the command prints exactly `/sdlc-execute requires an Opus session (current: <model>). Switch with /model opus and run /sdlc-execute again.`, exits with a non-zero code, makes no Herdr, Git or GitHub call, and takes no controller lease

### AC3: An unreadable session model fails closed

**Given** the host cannot report the session model
**When** the person runs `/sdlc-execute`
**Then** the command prints the AC2 message with `current: unknown` and stops with the same non-mutation guarantees

### AC4: Control returns to the supervisor at every stage boundary

**Given** a running execute invocation
**When** a dispatched worker writes its handoff for any stage, or settles without one
**Then** control returns to the orchestrator session with a stage report before the worker pane closes and before any next stage starts. The report names the issue, stage, worker name and pane, the handoff (or its absence), source HEAD before and after, the commits added during the stage with any changed paths outside the spec's declared files, registered gate status, and recent failure history. After a verify stage, it also gives the verification readiness `status`, `reasonCode` and `gaps`, and the verification report's critical and remaining issues

### AC5: Accept continues with the existing routing

**Given** a stage report
**When** the supervisor accepts it
**Then** the controller closes the worker pane (unless `--retain-worker`) and continues with exactly the stage the existing routing selects

### AC6: The supervisor can prompt the live worker

**Given** a stage report whose worker pane is still open
**When** the supervisor sends guidance to that worker
**Then** the guidance reaches that worker's pane, the controller waits for a fresh handoff from the same worker, and control returns to the supervisor with a new stage report

### AC7: The supervisor can re-dispatch with guidance

**Given** a stage report
**When** the supervisor chooses re-dispatch with guidance text
**Then** the worker pane closes and a new worker for the same stage, or an implement repair when the routing requires one, starts with the supervisor's guidance in its instructions alongside the existing failure evidence

### AC8: The supervisor can re-run verify after an environmental failure

**Given** a failed verify stage report that the supervisor judges environmental (caused outside the repository, with no code change needed), after the supervisor has repaired the environment
**When** the supervisor re-dispatches verify with guidance
**Then** a new verify worker starts at the same source HEAD with no implement repair first, and its result is held to the same full registered gate

### AC9: The supervisor can halt the run

**Given** a stage report
**When** the supervisor halts with a diagnosis
**Then** the run stops with a non-zero exit and a failed result that states the diagnosis. The branch, worktree and remote are left as they are, owned panes close unless `--retain-worker`, and the controller lease is released

### AC10: Supervision cannot bypass delivery gates

**Given** a verify stage whose registered gate is not full-green
**When** the supervisor accepts the stage report, or answers a check-in
**Then** the controller does not dispatch deliver, and full-green verification remains the only route to merge

### AC11: The supervisor checks in on running workers

**Given** a worker whose stage is still running
**When** the check-in interval (default 5 minutes) passes without a handoff, or the worker looks stalled (its pane output has not changed for the interval, or its `.waiting` marker is older than the interval)
**Then** control returns to the orchestrator session with a check-in report while the worker keeps running. The report names the issue, stage, worker name and pane, time since dispatch, the end of the worker's pane output and when it last changed, any `.waiting` marker with its background command and age, commits added since dispatch with any changed paths outside the spec's declared files, and recent failure history

### AC12: A check-in can continue, steer or stop the worker

**Given** a check-in report
**When** the supervisor answers it
**Then** the answer is exactly one of: continue (the next check-in follows after the interval), prompt the live worker with guidance (as in AC6, without closing its pane or waiting for a handoff first), re-dispatch with guidance (as in AC7 or AC8), or halt with a diagnosis (as in AC9)

### AC13: Guidance to a busy worker is queued

**Given** a worker that is in the middle of a tool call
**When** the supervisor prompts it, at a stage boundary or a check-in
**Then** the guidance is delivered when the worker's current call finishes rather than being dropped, and the controller's wait for a fresh handoff covers that delay

### AC14: The issue-scope marker always matches the resolver

**Given** a verify worker writing `specs/{N}-{slug}/verification-report.md`
**When** the report is finalized
**Then** its `nmg-sdlc-issue-scope` marker equals the normalized scope that `scripts/issue-spec-scope.mjs` resolves for that issue and spec, scenario identifiers included, so verification readiness never reports `scope_evidence_invalid` for a malformed or mismatched marker when the gate has passed

### AC15: Workers never move the shared checkout's branch

**Given** any worker dispatched by `/sdlc-execute` in the project checkout
**When** it needs content from another ref, such as the default branch
**Then** the checkout's current branch and HEAD do not change for that purpose, and the content is read without switching branches

### AC16: Execute supervisor tests ignore ancestor package types

**Given** a `package.json` declaring `"type": "module"` in an ancestor directory of the execute supervisor test fixtures, such as the system temporary directory
**When** `scripts/__tests__/sdlc-execute-supervisor.test.mjs` runs
**Then** the fixture helper scripts run as intended and the suite passes, just as it does with no such file

### AC17: A failed integration probe always names a real cause

**Given** `herdr integration status` cannot confirm the Claude integration
**When** `/sdlc-execute` stops with `Run: herdr integration install claude`
**Then** stderr names a concrete cause (spawn error code or message, signal, or numeric exit status), or says the probe returned no result, and never prints `exit undefined`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Before any controller work, `/sdlc-execute` checks the session model. Only a model id containing `opus` or `fable` passes; anything else, including an unreadable model, prints the AC2 message and stops with no mutation | Must |
| FR2 | The orchestrator session's requests are not overridden to a lesser model while `/sdlc-execute` runs | Must |
| FR3 | Worker stage models, efforts and repair model are unchanged | Must |
| FR4 | The controller yields to the orchestrator session at every stage boundary with the AC4 stage report, keeping the worker pane, lease, owned-pane set and failure history across the yield | Must |
| FR5 | The orchestrator session answers each stage boundary with exactly one of: accept, prompt the live worker with guidance, re-dispatch with guidance (including verify re-dispatch after an environmental failure), or halt with a diagnosis | Must |
| FR6 | No supervisor decision skips the existing stage routing, publication checks, version preparation or full-green gate | Must |
| FR7 | While a worker runs, the controller yields with the AC11 check-in report on a configurable interval (default 5 minutes) and as soon as stall signals appear, then resumes waiting for the same worker without losing the lease, owned panes or failure history | Must |
| FR8 | Check-ins inspect read-only (pane output, handoff and `.waiting` files, Git and GitHub state) unless the supervisor chooses to prompt, re-dispatch or halt | Must |
| FR9 | `workflows/execute/WORKFLOW.md` tells the orchestrator session to inspect each stage and check-in report and its artifacts, choose a decision, and still never edit product code, implement tasks or open PRs itself | Must |
| FR10 | The verify workflow produces the issue-scope marker from the resolver's output instead of having the worker compose the JSON | Must |
| FR11 | Every worker workflow `/sdlc-execute` dispatches forbids switching the shared checkout's branch to read another ref | Must |
| FR12 | The execute supervisor tests pass whatever module type an ancestor `package.json` declares, with a regression test that places a `"type": "module"` `package.json` above the fixture | Must |
| FR13 | The integration-probe failure detail handles a null or non-object probe result | Should |
| FR14 | `README.md` documents the Opus requirement, stage-boundary supervision and periodic check-ins | Should |

## Out of Scope

- Changing any worker stage model, effort or repair model
- The orchestrator session editing product code, implementing tasks or opening PRs itself
- Running `/sdlc-execute` outside Herdr or headless
- Changing which validations make up the registered gate, or what the gate requires to pass
- Supervising the headless `sdlc-execute.mjs run` path that the smoke gate and nested executions use; it keeps running to completion with the existing routing

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #491 | 2026-10-24 | Initial feature spec |
