# Tasks: Controller stalls waiting on a finished worker's background commands

**Issue**: #574
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/546-sdlc-execute-stop-losing-time-to-idle-workers-restarts-and-truncated-gate-evidence/

## Implementation Tasks

### T001: Add background reconciliation to the activity record

**File(s)**: `src/execute-host.mjs`, `src/execute-host.d.mts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1: `recordBackgroundStart` stores `endsWithFinalResponse: true` when it is given and omits the field otherwise.
- FR2: `reconcileBackground` keeps only entries whose task id is in `inFlight`. With `ownStop`, it also drops `endsWithFinalResponse` entries. It returns the same record when nothing changes.

### T002: Reconcile tracked commands on stop events in the hooks module

**File(s)**: `hooks/register.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR1: a backgrounded Bash result with `backgroundEndsWithFinalResponse: true` is recorded with that flag.
- FR2:
  - `classic.SubagentStop` and `classic.Stop` with a `background_tasks` array reconcile every tracked worker's record through the per-agent queue.
  - An event without `background_tasks` changes no record.
  - The hooks pass the event through unchanged.
- FR4: clearing on a settled worker's new step still happens.

### T003: End the controller's settle wait when background work clears

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR3/AC1: `settleCommits` returns for a settled worker once its record has no background entries and `index.lock` is absent, with no new turn and before the check-in slice elapses.
- AC2: while a background entry remains, it keeps waiting.

### T004: Add behavioral regression coverage

**File(s)**: `hooks/register.test.ts`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- Each test cites its `@SCN` tag:
  - `@SCN001` (AC1):
    - In `register.test.ts`, a worker records a backgrounded Bash call, then settles. A `classic.SubagentStop` for it with `background_tasks: []` empties its `background` list, with no new step.
    - In `sdlc-execute.test.mjs`, `awaitWorkerHandoff` with a fake host returns the stage once the record's background clears, with no further worker turn.
  - `@SCN002` (AC2):
    - The same flow with `background_tasks` listing the task as `running` keeps the entry.
    - The controller wait does not return until a later reconciliation, or a new step, clears it.
- The tests also cover an `endsWithFinalResponse` entry dropped at its own worker's stop, and an event without `background_tasks` that changes nothing.
- `cd scripts && npm test` exits 0, and the `hooks/register.test.ts` suite passes under the repository's test command.

### T005: Add the CHANGELOG entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T004
**Acceptance**:
- `[Unreleased]` has a bullet under `### Fixed` describing that `/sdlc-execute` no longer stalls on a finished worker's exited background commands, ending with `(#574)`.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #574 | 2026-11-19 | Initial defect report |
