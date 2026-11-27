# Tasks: Run interactive commands in Claude Desktop and remote sessions, and dispose of finished /sdlc-execute stage workers

**Issue**: #638
**Date**: 2026-11-27
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/491-make-the-sdlc-execute-session-an-opus-supervisor-that-inspects-and-steers-every-worker-stage/

## Implementation Tasks

### T001: Gate interactive commands on the attached surface roster

**File(s)**: `hooks/register.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1/AC1/AC2: `runInteractive` refuses a non-execute command only when `$.session.surfaces()`, read at command time, is empty; a `desktop`, `mobile`, or mixed roster with `isInteractive: false` renders, runs `/plan`, and submits the workflow as the person's prompt
- FR2/AC3: an empty roster returns exactly `Run /<command> in the TUI.` with `exitCode: 2`
- `headlessRun` keeps `!interactive || surfaces.length === 0`, so `/sdlc-execute` behavior is unchanged
- FR9: the module's only `$.ui` calls are `toast` and `log`; any surface-specific presentation branches on `$.session.surfaces()` with a terminal fallback

### T002: Stop every stage worker after its stage and at run end

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR3/AC4: after each stage's `host.finish()`, the controller stops the worker for every outcome (accept, missing handoff, redispatch, halt) before the next `host.spawn`, retrying a failed stop once and then throwing `worker_stop_failed`
- FR4/AC5: at the success return and the failure return, every spawned worker not confirmed stopped gets up to two stop attempts in total
- AC6: each worker still unconfirmed adds the line `stage worker <agentId>: stop not confirmed` to the result's stdout

### T003: Carry unconfirmed stops into the recorded run result

**File(s)**: `scripts/sdlc-execute-supervisor.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- AC6: `resultLines` adds every `stage worker <id>: stop not confirmed` line after its existing success or failure lines, so the result record and `/sdlc-execute --result` name the worker

### T004: Document Desktop and remote support

**File(s)**: `README.md`, `references/interactive-gates.md`, `references/claude-code-tooling.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- FR5: each document says interactive commands run in the TUI, Claude Desktop, and remote-attached sessions, and print `Run /<command> in the TUI.` (exit 2) only when no surface is attached (`claude -p`, the SDK with no client)
- `README.md` states that `/sdlc-execute` stops each stage worker when its stage finishes and names an unconfirmed stop in the run result
- `CHANGELOG.md` `[Unreleased]` gains bullets for both changes, each ending with `(#638)`

### T005: State the Desktop-and-CLI rule in project instructions and steering

**File(s)**: `CLAUDE.md`, `steering/snippets/project-product.md`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR6: `CLAUDE.md` gains a `## Desktop and CLI` section outside its managed spec-context section, reading: "nmg-sdlc must work in both Claude Desktop and the Claude Code CLI. Desktop may offer richer UI than the CLI, but every behavior must degrade gracefully on the CLI: the same outcome through a terminal-supported presentation (text, toast, or status line)."
- FR7: the Product Principles table gains `| Desktop and CLI | Every command works in Claude Desktop and the CLI; Desktop may add richer UI, and the CLI always gets a graceful fallback with the same outcome |`; the Intent Verification table gains `| Desktop and CLI | Every hooks-module command reaches the same outcome on terminal-only and Desktop surface rosters | Run the hooks-module surface matrix in hooks/register.test.ts |`; the primary-user table lists Claude Desktop alongside the CLI

### T006: Implement the `feature.gherkin` scenarios

**File(s)**: `hooks/register.test.ts`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-execute-supervisor.test.mjs`, `scripts/__tests__/dual-surface-contract.test.mjs`
**Type**: Create | Modify
**Depends**: T001, T002, T003, T005
**Acceptance**:
- The `engine()` stub in `hooks/register.test.ts` takes an explicit `surfaces` roster (`terminal`, `desktop`, `mobile`, mixed, empty) independent of `isInteractive`
- `@SCN001` (AC1): `desktop` roster with `isInteractive: false` → render, `/plan`, workflow prompt, no refusal (`hooks/register.test.ts`)
- `@SCN002` (AC2): Scenario Outline over `terminal`+`mobile` and `mobile` rosters (`hooks/register.test.ts`)
- `@SCN003` (AC3): empty roster → exact refusal, exit 2, no render (`hooks/register.test.ts`)
- `@SCN004` (AC4): a normal advance logs `stop:<id>` before the next `spawn:` entry, and a hooks-level stop sets `stopped: true` on the agent record (`scripts/__tests__/sdlc-execute.test.mjs`, `hooks/register.test.ts`)
- `@SCN005` (AC5): Scenario Outline over success, failure, and halt endings → every spawned agent id is in `stops` and none is active; the hooks bridge confirms a stop request the same way on `terminal`, `desktop`, empty, and mixed rosters (`scripts/__tests__/sdlc-execute.test.mjs`, `hooks/register.test.ts`)
- `@SCN006` (AC6): with `stopDeny`, the stop is attempted twice, the run fails with `worker_stop_failed`, stdout carries `stage worker <id>: stop not confirmed`, and `resultLines` keeps that line (`scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-execute-supervisor.test.mjs`)
- `@SCN007` (AC7): for every name in the registered-command list, a `terminal` run and a `desktop` run reach the same renders, plans, and prompts; the covered set equals the registered set (`hooks/register.test.ts`)
- `@SCN008` (AC8): the existing toast-raising paths (Finished exit warning, pending-continuation notice) reach the same outcome on `terminal` and `desktop` rosters; a scan of `hooks/register.ts` finds no `$.ui.` member other than `toast` and `log` (`hooks/register.test.ts`)
- `@SCN009` (AC9): `CLAUDE.md` contains the `## Desktop and CLI` section and its statements; `steering/snippets/project-product.md` contains both `Desktop and CLI` rows (`scripts/__tests__/dual-surface-contract.test.mjs`)
- Existing assertions that expected no stops after normal runs are updated to the new disposal behavior
- `cd scripts && npm test -- --runInBand` exits 0 and `claude plugin test .` reports 0 failures

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #638 | 2026-11-27 | Initial feature tasks |
