# Requirements: /sdlc-execute: stop losing time to idle workers, restarts and truncated gate evidence

**Issue**: #546
**Date**: 2026-11-13
**Status**: Approved
**Author**: Claude Code (write-spec)
**Related Spec**: specs/538-replace-herdr-panes-with-hooks-module-subagents-for-sdlc-execute/

## User Story

**As a** developer running `/sdlc-execute`
**I want** the controller to recover idle stage workers, keep supervisor prompts effective, resume interrupted verification, and keep usable gate evidence
**So that** a run never needs a redispatch or a repeated gate because of how the plugin tracks its workers and evidence

## Background

The execute controller (`scripts/sdlc-execute.mjs`) dispatches each stage as a background `nmg-sdlc:execute-<entry>` subagent through the hooks module (`hooks/register.ts`). It then waits for a validated handoff at `.nmg-sdlc/handoffs/<N>-<step>.json` and issues stage reports and check-in reports to the supervising session.

The current behavior has five gaps:

- An idle worker with no handoff is reminded once, and the report can be issued before the reminded turn has run or before the worker's last commit is visible.
- A supervisor `prompt` on a stage report can re-issue the same report with nothing changed.
- After a controller restart, routing reads only `.nmg-sdlc/verification/<N>.json`, so a failed result at an unchanged head always routes to implement, even while a verify rerun at that head was in flight.
- The gate runner (`src/sdlc-verification-runtime.mjs`) keeps only the first 64 KB of each stream and writes no log file.
- Check-in activity does not reflect a worker's running background command.

## Acceptance Criteria

### AC1: Idle worker without a handoff is resumed before any stage report

**Given** a stage worker ends its turn without writing a fresh, valid handoff and without a `.waiting` marker
**When** the controller observes the settled worker
**Then** it delivers the fixed handoff reminder to that same worker, waits for the resumed turn to start and settle, and issues no stage report before that
**And** when the resumed turn writes a valid handoff, the stage completes with that handoff and no `redispatch` decision is requested

### AC2: Stage report reflects the worker's last commit

**Given** a stage worker's commit to the issue branch becomes visible after the worker first settles
**When** the controller builds the stage report
**Then** it builds the report only after the worker has no tracked running background command and `.git/index.lock` is absent
**And** `headAfter` and `commits` include that commit

### AC3: A prompt decision reaches an idle worker or is refused with a reason code

**Given** a stage report for an idle worker offers `prompt`
**When** the supervisor answers `prompt` with guidance text
**Then** the controller delivers the guidance to that worker and, once the worker starts a new turn, waits for it to settle and uses the fresh handoff it writes
**And** when the guidance cannot be delivered, the next stage report carries `promptRefusal.reasonCode` `stage_prompt_undelivered`
**And** when the worker does not start a new turn within 60 seconds of delivery, the next stage report carries `promptRefusal.reasonCode` `stage_prompt_not_resumed`
**And** a report that carries a `promptRefusal` does not offer `prompt`

### AC4: Restart during a verify rerun at an unchanged head resumes verify

**Given** the controller dispatched verify at head H, which persisted a gate-intent record for H
**And** `.nmg-sdlc/verification/<N>.json` holds a failed result for H generated before that dispatch
**And** the controller process was killed before the verify stage completed
**When** `sdlc-execute.mjs supervise` resumes for the issue with HEAD still at H
**Then** it dispatches verify, not implement

### AC5: A failed gate routes to implement only after it is accepted

**Given** the supervisor accepted the stage report for a verify stage whose gate result at head H failed
**When** routing runs at head H, whether in the same controller or after a restart
**Then** the gate-intent record for H no longer exists and routing dispatches implement
**And** a failed gate result at H with no gate-intent record routes to implement as before

### AC6: Gate evidence keeps failing test names and links the full log

**Given** a registered command validation whose output is about 5 MB, with test-runner failure lines (for example pytest `FAILED tests/test_x.py::test_y`) in its first 10%
**When** the gate runner records the result in `.nmg-sdlc/verification/<N>.json`
**Then** that command's `evidence[]` entry has `artifact` set to the repository-relative path of a log file under `.nmg-sdlc/verification/<N>/` that contains the complete stdout and stderr
**And** the entry records `headSha` and `failures`, an array that includes each failing test line
**And** its `stdout` and `stderr` keep the last 65536 characters of each stream, prefixed with a truncation marker when cut
**And** the result `summary` names the extracted failures

### AC7: Check-in during a running background command does not report activity_unchanged

**Given** a stage worker started a Bash command in the background that is still running
**When** the check-in interval elapses with no other worker activity
**Then** the check-in report's `activity.background` names that command and its elapsed seconds
**And** the check-in `reason` is not `activity_unchanged`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | A worker that settles without a fresh valid handoff is resumed once, through the append-then-send path, with the fixed handoff reminder. No stage report is issued until that resumed turn has started and settled, or until the reminder is refused or the worker does not start within 60 s | Must |
| FR2 | Stage reports are built only after no tracked background command is running for the worker and `.git/index.lock` is absent; `headAfter` and `commits` are read after that settle | Must |
| FR3 | A stage `prompt` waits up to 60 s for the worker to start a new turn. An undelivered or unstarted prompt yields `promptRefusal: { reasonCode, summary }` with `stage_prompt_undelivered` or `stage_prompt_not_resumed`, and that report omits `prompt` from `decisions` | Must |
| FR4 | Dispatching verify (including a `redispatch` to verify) persists a gate-intent record `{ issue, head, dispatchedAt }` at `.nmg-sdlc/execute/gate-intent/<N>.json`. Accepting that verify stage's report, or a gate result for the head newer than `dispatchedAt`, removes it. On routing, an intent for the current head with no newer gate result selects verify | Must |
| FR5 | The command gate provider writes the full stdout and stderr to `.nmg-sdlc/verification/<N>/<validation-id>.log` and records `artifact`, `headSha`, tail-bounded `stdout`/`stderr` (last 65536 characters, with a `[truncated <count> characters]` prefix when cut), and `failures` in its `evidence[]` entry | Must |
| FR6 | Failure extraction collects lines matching pytest `FAILED `/`ERROR ` summary lines, Jest `●` test-title lines, and TAP `not ok` lines from the full output, keeping at most 100 lines of at most 500 characters each. The result summary names the first 10, and the controller's verification failure summary includes them | Must |
| FR7 | The hooks module records a stage worker's backgrounded Bash command (task id, command summary, start time) in its agent record and clears it when the worker starts its next turn after settling. A check-in carries `activity.background: { command, elapsedSeconds }` and does not use reason `activity_unchanged` while that command is recorded | Must |
| FR8 | `CHANGELOG.md` `[Unreleased]` gains a bullet for these changes ending `(#546)` | Must |

## Out of Scope

- Consumer-side test speed, such as parallel pytest
- Changing the check-in interval, the stage decision set, or the handoff schema
- Failure-line extraction for test runners other than pytest, Jest and TAP output

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #546 | 2026-11-13 | Initial feature spec |
