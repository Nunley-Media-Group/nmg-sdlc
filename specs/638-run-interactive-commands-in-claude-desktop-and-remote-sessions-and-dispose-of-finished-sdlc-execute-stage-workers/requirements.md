# Requirements: Run interactive commands in Claude Desktop and remote sessions, and dispose of finished /sdlc-execute stage workers

**Issue**: #638
**Date**: 2026-11-27
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/491-make-the-sdlc-execute-session-an-opus-supervisor-that-inspects-and-steers-every-worker-stage/

## User Story

**As a** developer running nmg-sdlc in a Claude Desktop Code session or a remotely connected session
**I want** the interactive `/sdlc-*` commands to run there, and each `/sdlc-execute` stage worker to be stopped once its stage finishes
**So that** I can use the full pipeline outside the terminal, and only the supervising session stays alive after each stage

## Background

`runInteractive` in `hooks/register.ts` treats a session as headless when `session.start` reported `isInteractive: false` or when `$.session.surfaces()` is empty. The engine sets `isInteractive` false for every SDK-hosted session, Claude Desktop included, even when a `desktop` or other remote surface is attached. So in Desktop, every interactive command prints `Run /<command> in the TUI.` (from `interactiveHeadlessMessage` in `src/host-events.mjs`) and does nothing, although the session has native plan mode and `AskUserQuestion`.

`runExecute` in `scripts/sdlc-execute.mjs` calls `host.stop(agentId)`, which reaches `stopWorker` in `hooks/register.ts` (`TaskStop` plus an `$.agent.list()` confirmation), only for a `redispatch` or `halt` decision. A worker whose stage completes and advances is never stopped and stays listed for the rest of the session.

## Acceptance Criteria

### AC1: Interactive commands run in a Claude Desktop session

**Given** an SDK-hosted session whose `session.start` reported `isInteractive: false`, and whose `$.session.surfaces()` includes `desktop` when the command runs
**When** `/sdlc-draft-issue` (or any other interactive `/sdlc-*` command) runs
**Then** the hooks module renders the workflow, enters plan mode through builtin `/plan`, and submits the workflow as the person's prompt, and it does not print `Run /<command> in the TUI.`

### AC2: Interactive commands run in a remotely attached session

**Given** a session with any non-empty `$.session.surfaces()` roster when the command runs (for example `terminal` plus `mobile`, or `mobile` alone)
**When** an interactive `/sdlc-*` command runs
**Then** it behaves as in AC1

### AC3: Headless runs keep refusing

**Given** a `claude -p` or SDK session whose `$.session.surfaces()` is empty when the command runs
**When** an interactive `/sdlc-*` command runs
**Then** it prints `Run /<command> in the TUI.` and exits 2, unchanged

### AC4: A finished stage worker is stopped before the next stage starts

**Given** an `/sdlc-execute` run whose stage worker has written its handoff, with no redispatch or halt decision
**When** the controller moves past that stage
**Then** it stops that worker, and `$.agent.list()` reports it neither `pending`, `running` nor `waiting` (or no longer lists it) before the next stage worker is spawned. The worker's record under the run directory has `stopped: true`

### AC5: No worker outlives its run

**Given** an `/sdlc-execute` run that ends by success, failure, or halt
**When** the controller records the run's result
**Then** every stage worker the run spawned has been sent a stop, and none is listed as `pending`, `running` or `waiting`. The stop request is serviced the same way whether the supervising session's roster is `terminal`, `desktop`, empty (headless `claude -p`), or has remote surfaces attached

### AC6: An unconfirmed stop is reported, not hidden

**Given** a worker stop that `stopWorker` cannot confirm (the agent is still active, or its status cannot be read)
**When** the controller finishes the stage or the run
**Then** it tries that stop once more before the run's result is recorded. If the stop is still unconfirmed, the run fails with `worker_stop_failed`, and the recorded run result includes the line `stage worker <agentId>: stop not confirmed`

### AC7: Every hooks-module command works on both the CLI and Desktop

**Given** each command the hooks module registers (the six interactive commands and `/sdlc-execute`)
**When** the hooks-module test suite runs it once with a `terminal`-only roster and once with a `desktop` roster
**Then** both runs reach the same workflow submission, and the matrix covers exactly the set of registered commands, so a newly registered command is exercised on both rosters

### AC8: Desktop-only UI degrades gracefully on the CLI

**Given** a hooks-module code path that shows UI
**When** the session's roster is `terminal` only
**Then** the command completes with the same outcome as on a `desktop` roster, through a terminal-supported presentation, and raises no error. The hooks module calls no `$.ui` member other than `toast` and `log` without a roster-based terminal fallback

### AC9: The project states the dual-surface rule

**Given** the repository after this change
**When** `CLAUDE.md` and `steering/snippets/project-product.md` are read
**Then** `CLAUDE.md` has a `## Desktop and CLI` section stating that nmg-sdlc must work in both Claude Desktop and the Claude Code CLI, that Desktop may offer richer UI, and that every behavior must degrade gracefully on the CLI. The steering Product Principles table and Intent Verification table each carry a `Desktop and CLI` row, and a contract test fails when any of these statements is removed

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Decide whether an interactive command can run from `$.session.surfaces()` read when the command runs: any attached surface (terminal or remote) counts as a UI. `session.start`'s `isInteractive` no longer forces the interactive-command refusal | Must |
| FR2 | Keep the exact `Run /<command> in the TUI.` refusal and exit code 2 when no surface is attached | Must |
| FR3 | Stop each stage worker once its handoff is collected, for every decision outcome, including a normal advance, before the next worker is spawned | Must |
| FR4 | At run end, stop every stage worker the run spawned that has not been confirmed stopped, retry an unconfirmed stop once, and name each still-unconfirmed worker in the recorded run result | Must |
| FR5 | Update `README.md`, `references/interactive-gates.md`, and `references/claude-code-tooling.md` so they say interactive commands run in the TUI, Claude Desktop, and remote-attached sessions, and refuse only when no surface is attached | Should |
| FR6 | Add a `## Desktop and CLI` section to `CLAUDE.md` stating the dual-surface rule | Must |
| FR7 | Add a `Desktop and CLI` row to the Product Principles and Intent Verification tables of `steering/snippets/project-product.md`, and list Claude Desktop as a supported surface for the primary user | Must |
| FR8 | Enforce the rule in tests: a hooks-module matrix that runs every registered command on `terminal`-only and `desktop` rosters, and a contract test that the `CLAUDE.md` and steering statements exist | Must |
| FR9 | Any surface-specific UI in the hooks module selects its presentation from the attached surfaces and falls back to a terminal-supported one | Must |

## Out of Scope

- Changing how the Claude Desktop app's sidebar groups, hides, or archives sessions
- Changing which surfaces `/sdlc-execute` itself runs on, or its headless hold and goal behavior
- Changing stage worker models, effort, permission mode, or prompts

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #638 | 2026-11-27 | Initial feature spec |
