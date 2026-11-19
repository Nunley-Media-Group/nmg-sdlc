# Defect Report: Controller stalls waiting on a finished worker's background commands

**Issue**: #574
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/546-sdlc-execute-stop-losing-time-to-idle-workers-restarts-and-truncated-gate-evidence/

## Reproduction

1. Run `/sdlc-execute #N` in the Claude Code TUI.
2. A stage subagent runs a Bash command that moves to the background, through `run_in_background` or the Bash timeout. The hooks module records it in the worker's `background` list.
3. The command exits while the worker is still in its turn. The worker reads its output, writes its handoff, and ends its turn, then settles `idle` or `completed`.
4. The worker never takes another turn, so its `background` list is never cleared.
5. The controller's `settleCommits` keeps waiting for a new turn and does not route the next step, until someone messages the worker and it takes a turn.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | When a settled worker's tracked background commands are no longer running, the record drops them and the controller routes the next step with no further worker turn. A command that is still running keeps the stage waiting until it exits. |
| **Actual** | Tracked commands are dropped only when a settled worker starts another turn. A worker that finished after its commands exited stalls the run indefinitely. |

## Acceptance Criteria

### AC1: A finished worker's exited background commands do not block routing

**Given** a stage worker that has written its handoff and settled, and whose tracked background commands have all exited
**When** the controller waits for that stage
**Then** it routes the next step without the worker being prompted again

### AC2: A still-running background command still blocks

**Given** a settled worker whose tracked background command is still running
**When** the controller waits for that stage
**Then** it keeps waiting until that command exits, and then routes the next step

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | When the hooks module tracks a backgrounded Bash command, it also records whether the result set `backgroundEndsWithFinalResponse` | Must |
| FR2 | On `classic.SubagentStop` and `classic.Stop` events that carry a `background_tasks` array, the hooks module keeps a tracked worker's background entry only when its task id is listed there with a status other than `completed`, `failed` or `killed`. Entries marked `endsWithFinalResponse` are dropped at their own worker's `classic.SubagentStop`. When the event carries no `background_tasks`, the record is unchanged | Must |
| FR3 | `settleCommits` stops waiting as soon as the worker's record has no background entries and the git index is unlocked, without waiting for a new turn or a full check-in slice | Must |
| FR4 | The existing clearing of tracked commands when a settled worker starts a new turn is kept | Must |

## Out of Scope

- Headless `claude -p` session lifetime (#564)
- Stopping a settled worker (#567)
- Changing how workers write the `.waiting` marker

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #574 | 2026-11-19 | Initial defect report |
