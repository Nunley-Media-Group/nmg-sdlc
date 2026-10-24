# Defect Report: Fix sdlc-execute closing worker panes while their background work runs

**Issue**: #470
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/464-run-each-sdlc-step-on-its-assigned-claude-code-model/

## Reproduction

1. In a Herdr pane with the Claude integration installed, run `/sdlc-execute #N` for a `spec-created` issue whose registered gate takes longer than one worker turn. nmg-sdlc's own gate runs about 6 minutes of Jest and then live smoke.
2. The verify worker starts `sdlc-verify-steering.mjs` with `run_in_background: true` and ends its turn to wait for the completion notification.
3. Within a second the controller closes the worker pane. `.nmg-sdlc/verification/N.json` records `repository.tests` as `incomplete` with summary `command cancelled`, and `repository.nmg-sdlc-smoke` as `deferred until required local validations pass`. No verify handoff is written.
4. The controller records `missing_handoff` and dispatches an `implement` repair, and that worker changes source the step never needed.
5. On a fresh issue, the first worker after `start` is `verify`, and it fails with `implementation_non_pass`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | A worker waiting on its own background work keeps its pane until it resumes and writes its handoff. A settled worker with no handoff and no waiting marker is reminded once before it counts as stopped. A branch with no commits relative to the default branch is implemented first. A lost verify handoff re-runs verify. |
| **Actual** | The pane is closed at the first settled `idle` or `done` state, the background gate is cancelled, and execute loops on `missing_handoff` with implement repairs. A just-started branch is verified before anything is implemented. |

## Acceptance Criteria

### AC1: A worker waiting on background work keeps its pane

**Given** a dispatched worker whose turn settles to `idle` or `done` without a fresh handoff, after it writes the waiting marker `<handoff path>.waiting`
**When** the controller observes that settled state
**Then** it does not close the pane, waits for the worker to resume, and keeps supervising until a fresh handoff is written
**And** the handoff is then processed exactly as if the first turn had written it

### AC2: An idle worker without a handoff or marker gets one reminder

**Given** a worker that settles to `idle` or `done` with neither a fresh handoff nor a waiting marker
**When** the controller observes that state for the first time since the worker last resumed
**Then** it sends one reminder prompt naming the handoff path and the waiting marker path
**And** if the worker settles again with neither, the controller closes the pane and records `missing_handoff` as it does today

### AC3: Process loss and blocked workers are unchanged

**Given** a worker whose agent can no longer be read (`process_lost`) or that settles `blocked`
**When** the controller observes it without a fresh handoff
**Then** it closes the pane and records the failure as it does today, without a reminder or a resume wait

### AC4: A branch with no commits goes to implement

**Given** an issue branch, clean and published, with no commits relative to the default branch, and no implement pass at that head in this invocation
**When** the controller selects the next step
**Then** it dispatches `implement`, not `verify`

### AC5: A lost verify handoff re-runs verify

**Given** a verify worker that ends without a handoff at an unchanged head
**When** the controller selects the next step
**Then** it dispatches `verify` again, not `implement`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | The worker prompt header tells a worker that ends a turn while a background command for its step is still running to first write `<handoff path>.waiting` | Must |
| FR2 | The controller removes a stale waiting marker before dispatch and when the worker resumes | Must |
| FR3 | The resume wait has no wall-clock deadline. It polls `herdr agent wait --until working --timeout <ms>` and rechecks for a fresh handoff and process loss on each poll | Must |
| FR4 | `defaultHerdr().agentWait` passes an optional `timeout` as `--timeout <ms>` | Must |

## Out of Scope

- Changing the registered gate or how a worker runs it
- Herdr or Claude Code changes
