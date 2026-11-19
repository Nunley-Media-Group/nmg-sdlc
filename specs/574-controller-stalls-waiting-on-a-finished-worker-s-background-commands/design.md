# Root Cause Analysis: Controller stalls waiting on a finished worker's background commands

**Issue**: #574
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/546-sdlc-execute-stop-losing-time-to-idle-workers-restarts-and-truncated-gate-evidence/

## Root Cause

- The hooks module (`hooks/register.ts`) adds an entry to a worker's `background` list when a Bash result has a `backgroundTaskId` (`recordBackgroundStart`, `src/execute-host.mjs`).
- It removes entries only in `recordStepStart`, the first model step of a worker whose status was settled. Nothing else observes a command ending.
- A command that exits while the worker is still in its turn is therefore never removed. This happens when the worker waits for it, or reads its completion notification within the turn.
- `settleCommits` (`scripts/sdlc-execute.mjs`) holds the stage report while `background` is non-empty. For a settled worker, it waits only for a new turn (`until: 'started'`).
- A worker that has finished takes no new turn, so the controller waits until something messages the worker.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `hooks/register.ts` | `tool.call` background tracking; new `classic.SubagentStop` / `classic.Stop` hooks | Records and reconciles tracked commands |
| `src/execute-host.mjs` | `recordBackgroundStart`, new `reconcileBackground` | Pure record transforms |
| `scripts/sdlc-execute.mjs` | `settleCommits` | Controller wait on background work and the git index lock |

## Fix Strategy

**`src/execute-host.mjs`**
- `recordBackgroundStart` accepts `endsWithFinalResponse` and stores it on the entry, as `true` or absent.
- `reconcileBackground(record, { inFlight, ownStop, at })`:
  - `inFlight` is the set of task ids that `background_tasks` lists with a status other than `completed`, `failed` or `killed`.
  - It keeps an entry only when its `taskId` is in `inFlight`.
  - When `ownStop` is true, it also drops entries with `endsWithFinalResponse`.
  - It updates `updatedAt` only when the list changes, and returns the record unchanged when nothing is dropped.

**`hooks/register.ts`**
- In the `tool.call` background branch, it passes `result.backgroundEndsWithFinalResponse === true` to `recordBackgroundStart`.
- `on('classic.SubagentStop')` and `on('classic.Stop')` call `next(e)` first, then reconcile when `Array.isArray(e.background_tasks)`.
  - They build `inFlight` from those tasks.
  - Each tracked worker's record is updated through the existing per-agent queue (`queueAgent`, `updateAgent`) with `reconcileBackground`.
  - `ownStop` is `e.agent_id === agentId` for `SubagentStop`.
- The hooks never change the event's answer.

**`scripts/sdlc-execute.mjs` `settleCommits`**
- For a settled worker, the pause passes a `changed` predicate. It returns true when the worker's activity record has no background entries and the index lock is gone. The wait therefore ends at the next host poll after reconciliation.
- An active worker is still waited on until it settles, and a stopped worker is not waited on.

## Blast Radius

- Only how background entries are dropped changes. A command the engine still lists as in flight keeps the stage waiting (AC2).
- Clearing on a new turn and the index-lock wait are unchanged.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Treat a settled worker's handoff as final and ignore its background entries | Rejected | Breaks AC2: a still-running command could make commits after the stage report |
| Read the task's output file to detect exit | Rejected | The output path is internal to the engine and not stable |
| Reconcile against the engine's `background_tasks` on stop events | Selected | Engine-authoritative, with no new host API |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #574 | 2026-11-19 | Initial defect report |
