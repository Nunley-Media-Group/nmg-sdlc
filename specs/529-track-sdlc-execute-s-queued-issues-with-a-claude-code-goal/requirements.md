# Requirements: Track /sdlc-execute's queued issues with a Claude Code /goal

**Issue**: #529
**Date**: 2026-10-26
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/491-make-the-sdlc-execute-session-an-opus-supervisor-that-inspects-and-steers-every-worker-stage/

## User Story

**As a** developer running `/sdlc-execute` in a Claude Code session inside Herdr
**I want** the supervising session to carry a Claude Code `/goal` that names every issue the run must deliver
**So that** the session keeps supervising until each queued issue is merged and closed, or the run is deliberately stopped, instead of ending a turn early

## Background

Claude Code's built-in `/goal <condition>` sets a session-scoped completion condition and starts a turn whose directive is the condition. After each turn, a fast evaluator reads the conversation and starts another turn until it judges the condition met or impossible. The evaluator cannot run tools, so it can judge only text that appears in the conversation. `/goal` with no argument shows status, and `/goal clear` removes the goal. A slash command can be run only by the person or by the hooks module (`$.command.run`). The model cannot run one, and the hooks module cannot run one from inside a hook the current turn waits on.

`/sdlc-execute` resolves its issue set three ways: explicit `#N` tokens; a bare run on an `N-*` issue branch; or a bare run on a non-issue branch, where the person picks issues from a `list-specified` picker. It then runs a `supervise` → report → `decide`/`wait` loop until the controller finishes or the run halts.

## Acceptance Criteria

### AC1: Explicit issue tokens set a goal before supervision starts

**Given** `/sdlc-execute #A #B` is run in an interactive Herdr session on an Opus or Fable model
**When** the run starts
**Then** an active `/goal` exists before the first `supervise` call. Its condition names `#A` and `#B` and is met only when the conversation shows `#A: MERGED and CLOSED` and `#B: MERGED and CLOSED`, or a `/sdlc-execute stopped:` line with the halt or controller-exit diagnosis

### AC2: Bare runs set the goal once the issue set is resolved

**Given** `/sdlc-execute` is run bare, either on an `N-*` issue branch or on a non-issue branch where the person selects issues in the picker
**When** the issue set is resolved
**Then** an active `/goal` naming exactly the resolved issues, in run order and with the same completion terms as AC1, exists before the first `supervise` call

### AC3: The goal is satisfied when every queued issue is delivered

**Given** an execute run with an active goal for its queued issues
**When** the controller finishes after delivering every queued issue
**Then** the session's reply repeats each controller line `#N: MERGED and CLOSED` verbatim, so the goal condition is met by conversation text alone

### AC4: A halt or non-remediable exit ends the goal

**Given** an execute run with an active goal
**When** the session runs `decide ... halt --text "<diagnosis>"`, or the controller exits with a condition the workflow says to stop on
**Then** the session's reply prints `/sdlc-execute stopped: <diagnosis>`, which meets the goal condition, and no `supervise` call follows

### AC5: Failure to set the goal refuses the run

**Given** an interactive `/sdlc-execute` run whose issue set is resolved
**When** the `goal` command is unavailable in the session or setting it fails
**Then** the session prints one line, `/sdlc-execute stopped: goal_unavailable: <reason>`, and the hooks module refuses every `supervise` call for that run, so `supervise` never runs

### AC6: Runs that select nothing set no goal

**Given** `/sdlc-execute` is headless, refused for its model, finds `No open spec-created issues.`, has a failed `list-specified`, or the person selects `Stop — run nothing`
**When** the run ends
**Then** no `/goal` is set, and the existing output and exit codes are unchanged

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Every interactive `/sdlc-execute` run that resolves a non-empty issue set sets a Claude Code `/goal` through the hooks module before its first `supervise` call; the hooks module refuses a `supervise` call made during an execute run before that goal is set | Must |
| FR2 | The goal condition lists each queued `#N` in run order and is met only when the conversation shows `#N: MERGED and CLOSED` for all of them, or a `/sdlc-execute stopped:` line with a diagnosis | Must |
| FR3 | The goal condition can be judged from conversation text alone and is at most 4,000 characters for any run the controller accepts (1–20 issues) | Must |
| FR4 | If the `goal` command is unavailable or setting it fails, the run prints one `/sdlc-execute stopped: goal_unavailable: <reason>` line and never invokes `supervise` | Must |
| FR5 | Runs that resolve no issues (headless, model refusal, empty list, `list-specified` failure, `Stop — run nothing`) set no goal | Must |
| FR6 | `README.md` and `workflows/execute/WORKFLOW.md` describe the goal, its completion terms, and that `/goal clear` stops it | Should |

## Out of Scope

- Using `/goal` in `/sdlc-draft-issue`, `/sdlc-write-spec`, or other `/sdlc-*` commands
- Changing controller routing, the full-green gate, the `decide` vocabulary, or the safe-action rules
- Herdr worker panes setting their own goals
- Changing the goal mid-run when issues are added or removed
- The headless `sdlc-execute.mjs run` path, which the smoke gate uses

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #529 | 2026-10-26 | Initial feature spec |
