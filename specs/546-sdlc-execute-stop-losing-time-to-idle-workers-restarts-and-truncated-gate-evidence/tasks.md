# Tasks: /sdlc-execute: stop losing time to idle workers, restarts and truncated gate evidence

**Issue**: #546
**Date**: 2026-11-13
**Status**: Approved
**Author**: Claude Code (write-spec)
**Related Spec**: specs/538-replace-herdr-panes-with-hooks-module-subagents-for-sdlc-execute/

## Implementation Tasks

### T001: Track stage workers' background commands in agent records

**File(s)**: `src/execute-host.mjs`, `hooks/register.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR7: `recordBackgroundStart` and `clearBackground` exist, and `activityRecord` returns `background: { command, elapsedSeconds } | null`
- The hooks module records a stage worker's Bash call that returns `backgroundTaskId` and clears it on the worker's next turn after settling. Write-spec background merge handling is unchanged

### T002: Resume an idle worker for its handoff and settle commits before the stage report

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR1/AC1: the reminder is delivered through `host.append`, and no stage report is issued until the resumed turn has started and settled, or until delivery is refused or the 60 s start bound passes
- FR2/AC2: stage reports wait while `background` is recorded or `<git-dir>/index.lock` exists, and read `headAfter`/`commits` afterwards

### T003: Make stage prompt delivery observable with reason-coded refusals

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- FR3/AC3: a delivered prompt waits for a new turn and uses its fresh handoff
- An undelivered prompt yields `promptRefusal.reasonCode` `stage_prompt_undelivered`, and an unstarted one yields `stage_prompt_not_resumed`
- Reports that carry `promptRefusal` omit `prompt` from `decisions`

### T004: Persist gate intent and route restarts at an unchanged head to verify

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR4/AC4: verify dispatch writes `.nmg-sdlc/execute/gate-intent/<N>.json`, and a resumed controller with an intent for the current head and no newer gate result dispatches verify
- AC5: accepting the verify stage report clears the intent, and a failed gate with no intent still routes to implement

### T005: Store tail-bounded output, full logs and extracted failures in gate evidence

**File(s)**: `src/sdlc-verification-runtime.mjs`, `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR5/AC6: command evidence has `artifact` pointing to `.nmg-sdlc/verification/<N>/<id>.log` with the full stdout and stderr, plus `headSha`, last-65536-character `stdout`/`stderr` with the truncation prefix, and `failures`
- FR6: pytest `FAILED`/`ERROR`, Jest `●` and TAP `not ok` lines are extracted (at most 100 lines of at most 500 characters), and the result summary names the first 10
- `currentGateFailure` includes the extracted failures in its summary and the log paths in its artifacts
- The finalize, recover and delivery readers accept the extended entry

### T006: Controller tests for idle resume, commit settle, prompt refusals, restart routing and background check-ins

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T002, T003, T004, T001
**Acceptance**:
- AC1: a fake worker settles without a handoff, writes it after the reminder, and the stage completes with no `redispatch` and no stage report before the resumed turn
- AC2: a commit that lands after the first settle, while a background entry is recorded, appears in the report's `commits` and `headAfter`
- AC3: prompt is covered three ways: delivered with a fresh handoff, append refused (`stage_prompt_undelivered`), and not started within the bound (`stage_prompt_not_resumed`, with `prompt` absent from `decisions`)
- AC4: with a gate-intent record at H and a failed gate result at H generated earlier, a new `runExecute`/`supervise` dispatches `verify` first
- AC5: after a verify report is accepted, the intent is removed and routing dispatches `implement`. The existing "diagnoses a previously failed exact-source gate" test still passes
- AC7: a check-in with a recorded background command reports `activity.background` and no `activity_unchanged` reason
- `cd scripts && npm test` exits 0

### T007: Gate runner tests for large output with early failures

**File(s)**: `scripts/__tests__/sdlc-verification-runtime.test.mjs`
**Type**: Modify
**Depends**: T005
**Acceptance**:
- AC6: a `builtin.command` validation prints pytest `FAILED` lines in the first 10% of about 5 MB of output and exits 1. The record's evidence names those lines in `failures` and `summary`, `artifact` points to an existing log containing the full output, `headSha` matches HEAD, and `stdout` ends with the stream's last characters
- `cd scripts && npm test` exits 0

### T008: Agent-record and hooks tests for background tracking

**File(s)**: `scripts/__tests__/execute-host.test.mjs`, `hooks/register.test.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC7: `recordBackgroundStart`/`clearBackground`/`activityRecord` behavior is covered in Jest
- `hooks/register.test.ts` covers a stage worker's backgrounded Bash call being recorded and then cleared on its next turn

### T009: Add the CHANGELOG entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T005
**Acceptance**:
- FR8: `## [Unreleased]` has a bullet describing the execute idle-worker, prompt, restart-routing, gate-evidence and background-activity changes, ending `(#546)`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #546 | 2026-11-13 | Initial feature tasks |
