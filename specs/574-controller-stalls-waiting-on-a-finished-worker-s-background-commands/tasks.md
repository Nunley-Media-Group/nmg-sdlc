# Tasks: Controller stalls waiting on a finished worker's background commands

**Issue**: #574
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/546-sdlc-execute-stop-losing-time-to-idle-workers-restarts-and-truncated-gate-evidence/

## Implementation Tasks

### T001: Reconcile tracked background commands against the host's in-flight tasks

**File(s)**: `src/execute-host.mjs`, `hooks/register.ts`, `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `src/execute-host.mjs` exports `reconcileBackground(record, inFlight, at)`. Given an array, it drops exactly the `background` entries whose `taskId` matches no `inFlight[].id` and sets `updatedAt` to `at` when it drops any. Given a non-array, or when nothing is dropped, it returns the record unchanged.
- `hooks/register.ts` registers `classic.SubagentStop` and `classic.Stop` handlers:
  - The `classic.SubagentStop` handler reconciles the tracked worker named by `e.agent_id`.
  - The `classic.Stop` handler reconciles every tracked stage worker.
  - Both use `e.background_tasks` through `queueAgent`/`updateAgent` and return `next(e)` unchanged.
- The `settleCommits` comment in `scripts/sdlc-execute.mjs` names the new clearing path, and its wait logic is unchanged.
- `hooks/register.ts` still imports no Node built-ins.

### T002: Add behavioral regression coverage

**File(s)**: `scripts/__tests__/execute-host.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `execute-host.test.mjs` covers `reconcileBackground` in three cases: exited entries dropped, listed entries kept, and a missing list leaving the record unchanged.
- A source-contract test asserts that `hooks/register.ts` registers both stop handlers, calls `reconcileBackground`, and returns `next(e)`.
- `sdlc-execute.test.mjs` covers the settled worker that has a fresh handoff and a tracked `background` entry (AC1). A fake host whose activity record drops that entry without starting a new turn makes `awaitWorkerHandoff` return and the stage route, with no `append` call.
- `sdlc-execute.test.mjs` covers AC2: while the entry stays listed, the settle wait keeps pausing, and it returns only after the entry is removed.
- The AC1 test fails against the pre-fix behavior, where clearing needs a new turn, and passes with the fix. `cd scripts && npm test` exits 0.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #574 | 2026-11-19 | Initial defect tasks |
