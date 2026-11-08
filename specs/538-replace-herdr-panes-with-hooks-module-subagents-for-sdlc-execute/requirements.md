# Requirements: Replace Herdr panes with hooks-module subagents for /sdlc-execute

**Issue**: #538
**Date**: 2026-11-08
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/535-make-sdlc-execute-stage-models-and-efforts-configurable-per-project-via-steering-sdlc-models-json/

## User Story

**As a** developer delivering spec-created issues with `/sdlc-execute`
**I want** each delivery stage to run as a background subagent that the nmg-sdlc hooks module starts, inspects, steers and stops, in any Claude Code session (TUI or `claude -p`)
**So that** automated delivery works without Herdr while keeping per-stage model and effort, check-ins, and supervisor decisions

## Background

`/sdlc-execute` runs four stages: start (when needed), implement, verify and deliver. Today each stage runs in its own Claude Code session in a sibling Herdr pane. `scripts/sdlc-execute.mjs` starts and polls those panes through `defaultHerdr`: `pane split`, `agent start --kind claude`, `agent prompt`, `agent wait`, `pane read` and `pane close`.

The supervising Opus or Fable session answers each stage report and check-in with `accept`, `continue`, `prompt`, `redispatch` or `halt`. Report and decision files under `.nmg-sdlc/execute/<session>/` carry that exchange (`scripts/sdlc-execute-supervisor.mjs`).

Herdr is a hard runtime requirement throughout:

- `workflows/execute/WORKFLOW.md` requires `HERDR_ENV=1`, `HERDR_SOCKET_PATH` and `HERDR_PANE_ID`, and accepts `--retain-worker`.
- The controller lease reclaims through Herdr pane occupancy.
- The live smoke gate (`steering/extensions/nmg-sdlc-smoke.mjs`) types `/sdlc-draft-issue` and `/sdlc-write-spec` into an interactive Claude pane.
- `hooks/register.ts` refuses every interactive command, and `/sdlc-execute`, when the session has no UI.

The Claude Code hooks-module API can do everything the controller does through panes:

- register a subagent type with a model, effort and permission mode, and spawn it in the background (`$.agent.register`, `$.agent.spawn`);
- observe its tool calls, model steps, transcript and status (`tool.call`, `turn.step`, `turn.complete`, `$.session.messages`, `$.agent.list`);
- add a message to a running subagent (`$.session.append`) or resume an ended one (`$.session.send`);
- stop it (`TaskStop` through `$.tool.call`);
- submit a prompt to the main session from a timer (`$.clock.every`, `$.prompt.submit`).

A command that is the whole prompt of a headless run can set that process's exit code. A command's own `{ text }` answer is display-only and starts no model turn. A command starts a model turn by submitting a prompt from a timer (`$.clock.after`, `$.prompt.submit`).

Headless `claude -p` sessions have no `EnterPlanMode`, `ExitPlanMode` or `AskUserQuestion` tool, so the interactive commands cannot run there. Autopilot (`NMG_SDLC_AUTOPILOT=1`) answered those gates for unattended drivers. Its only driver is the smoke gate's provisioning step, which typed `/sdlc-draft-issue` and `/sdlc-write-spec` into a Herdr pane. The `/sdlc-execute` controller and its supervising session already make every delivery decision, so autopilot has no remaining role once provisioning moves to the verify stage.

## Acceptance Criteria

### AC1: Stages run as hooks-module subagents without Herdr

**Given** an approved, spec-created issue and a Claude Code session on an Opus or Fable model with no Herdr environment variables
**When** the person runs `/sdlc-execute #N`
**Then** each stage the controller dispatches runs as a background subagent started by the nmg-sdlc hooks module
**And** no `herdr` command is invoked
**And** the run reaches exact-head merge and issue closure under the unchanged full-green gate

### AC2: Per-stage model and effort come from sdlc-models.json

**Given** `steering/sdlc-models.json` assigns a model and effort to each of `start`, `implement`, `verify`, `deliver` and `repair`
**When** the controller dispatches a stage, or redispatches it as a repair
**Then** every model request of that stage's subagent uses that entry's model and effort (the `repair` entry for a repair redispatch)
**And** an entry with effort `default` registers no effort, and the hooks module leaves the subagent's step effort unchanged
**And** every model value the validator accepts (aliases, `[1m]` aliases, `claude-*` ids, `provider/model` ids) starts a subagent on that model

### AC3: Invalid or partial stage configuration keeps its current behavior

**Given** `steering/sdlc-models.json` has an invalid value, or lacks some keys
**When** `/sdlc-execute` starts
**Then** an invalid value stops the run with exit 2 and the `steering/sdlc-models.json: <key> = <value>: <reason>` diagnostic before any Git or GitHub call or subagent start
**And** missing keys produce the single existing warning line and use the plugin defaults

### AC4: Check-in reports show the running worker's activity

**Given** a stage subagent is still running when the check-in interval elapses (`--check-in-seconds N`, default 300), or its activity has stalled for that long
**When** the controller produces a check-in report
**Then** the report carries an `activity` object in place of `paneTail`. The object holds the worker's status, its recent tool calls, its latest transcript text, and the seconds since its last activity
**And** the report reason is `interval`, `activity_unchanged` (which replaces `pane_unchanged`) or `waiting_marker_stale`
**And** while the main session is idle, the hooks module submits a prompt that has the supervising session fetch the report and answer it with `continue`, `prompt`, `redispatch` or `halt`

### AC5: Prompt guidance reaches the running worker

**Given** a stage subagent is running
**When** the supervising session decides `prompt --text "<guidance>"`
**Then** the guidance enters that subagent's conversation before its next model request
**And** the controller then waits for the subagent's fresh handoff

### AC6: Redispatch and halt stop the running worker

**Given** a stage subagent is running
**When** the supervising session decides `redispatch` or `halt`
**Then** the controller stops that subagent before it starts the replacement stage or stops the run: the subagent's status becomes killed and any further tool call from it is denied
**And** a halt exits non-zero with the diagnosis, leaving the branch, worktree and remote unchanged

### AC7: Headless runs complete with the session's plugins and report the controller's exit status

**Given** `claude -p --session-id <uuid> --plugin-dir <nmg-sdlc checkout> "/sdlc-execute #N"` on an Opus or Fable model
**When** the run executes
**Then** the process stays alive while any stage subagent runs or a supervision turn is active
**And** it exits after the controller finishes, and its last output is the controller's final result lines (`#N: MERGED and CLOSED` for each delivered issue, or `/sdlc-execute stopped: <diagnosis>`)
**And** every stage subagent uses the plugins loaded in that session, including the `--plugin-dir` checkout
**And** `claude -p --resume <uuid> "/sdlc-execute --result"` prints those lines and exits with the controller's exit status

### AC8: `--retain-worker` is rejected

**Given** `/sdlc-execute --retain-worker #N`
**When** the arguments are parsed
**Then** the run stops with a usage error that names `--retain-worker`, before setting a goal or making any mutation
**And** `--check-in-seconds N` remains accepted

### AC9: Autopilot is removed and interactive commands stay TUI-only

**Given** a headless `claude -p --plugin-dir <checkout> "/sdlc-draft-issue <need>"` or `"/sdlc-write-spec #N"` run, with or without `NMG_SDLC_AUTOPILOT=1` in its environment
**When** the command is dispatched
**Then** it prints `Run /<name> in the TUI.`, exits 2, and makes no mutation
**And** in any session the hooks module approves no `ExitPlanMode` and answers no `AskUserQuestion` because of `NMG_SDLC_AUTOPILOT`; the write-spec Finished approval is unchanged
**And** no plugin runtime file, workflow, `references/interactive-gates.md`, README, `CLAUDE.md` or `CONTRIBUTING.md` reads or documents `NMG_SDLC_AUTOPILOT`. `references/rewrite-contract.{json,md}`, `references/rewrite-verification.md` and the cutover ADR record it only as removed by #538

### AC10: Smoke gate delivers the verify-provisioned issue without Herdr

**Given** the live smoke gate in `steering/extensions/nmg-sdlc-smoke.mjs` with no explicit issue queue
**When** it runs
**Then** it reads the smoke issue from the provisioning record `.nmg-sdlc/smoke/provisioned.json`, and passes only when that issue is in `Nunley-Media-Group/nmg-sdlc-smoke`, is open, carries `spec-created`, and has a merged `docs: approve spec for #N` PR
**And** it never drafts an issue or writes a spec itself; a missing, invalid or stale record fails with `nmg-sdlc-smoke smoke issue not provisioned`
**And** it runs delivery through a headless `claude -p --session-id <uuid> --plugin-dir <candidate> "/sdlc-execute #N"` session in the delivery clone, and reads the controller status from that session's recorded result
**And** it invokes no `herdr` command
**And** it keeps its current exact-head merged-PR and closed-issue pass conditions, and an explicit `NMG_SDLC_SMOKE_ISSUES` queue still takes priority over the record

### AC11: Upgrade rewrites the managed CONTRIBUTING sentence

**Given** a consumer `CONTRIBUTING.md` containing "drives Herdr Claude worker panes through implementation, verification, and delivery" (or the earlier "drives Herdr omp worker panes through implementation, verification, and delivery")
**When** `/sdlc-upgrade-project` applies its approved plan
**Then** that sentence is replaced with "runs Claude Code stage subagents through implementation, verification, and delivery", and all other content is byte-for-byte unchanged
**And** a repeated upgrade produces no further diff

### AC12: A worker that cannot start fails the run visibly

**Given** the hooks module cannot start a stage subagent (the spawn is denied, the registration is rejected, or the stage agent definition is missing)
**When** the controller dispatches that stage
**Then** the run reports `worker_start_refused` with the refusal reason and exits non-zero without delivering or merging

### AC13: The verify stage provisions the smoke issue through the real interactive commands

**Given** nmg-sdlc's own verification, whose registered gates include `repository.nmg-sdlc-smoke`
**When** the verify worker runs, before it runs the registered gates
**Then** the project steering snippet routed to `worker:verify` has it reuse the recorded smoke issue when that issue is open and undelivered, or else provision a fresh one
**And** provisioning starts an interactive `claude --plugin-dir <candidate>` session in a detached tmux session in a fresh smoke clone, runs the real `/sdlc-draft-issue <need>` and then `/sdlc-write-spec #N`, and answers every question and plan dialog itself by reading the pane
**And** when issue N has `spec-created` and a merged `docs: approve spec for #N` PR, the worker ends the tmux session, removes the clone, and writes `.nmg-sdlc/smoke/provisioned.json`
**And** a failure to drive the terminal (tmux missing, the pane unreadable, an unrecognized dialog) is reported as environmental, and a misbehaving draft-issue or write-spec workflow is reported as an nmg-sdlc defect in the verification report

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | The nmg-sdlc hooks module starts, observes, steers and stops `/sdlc-execute` stage workers as background subagents. It uses one registered agent type per stage entry (`nmg-sdlc:execute-<entry>`). The model and effort come from `steering/sdlc-models.json` and the permission mode from `NMG_SDLC_WORKER_PERMISSION_MODE` | Must |
| FR2 | Controller routing, publication checks, version preparation, handoff validation, repair selection and the full-green gate keep their current behavior and evidence. The controller lease keeps its single-controller guarantee, with Herdr pane occupancy replaced by the supervising session's heartbeat | Must |
| FR3 | Supervision is event-driven. Stage reports follow subagent completion, and check-ins come from hooks-module timers that submit a prompt to the supervising session. No supervision `Bash` call waits for a worker to run | Must |
| FR4 | `continue`, `prompt`, `redispatch` and `halt` keep their meanings. `prompt` adds guidance to the running subagent's conversation; `redispatch` and `halt` stop it first | Must |
| FR5 | The Herdr preflight, the Herdr environment variables, the Herdr integration probe, `--retain-worker`, the Herdr session-start toast and every `herdr` invocation are removed from the plugin and the smoke gate | Must |
| FR6 | Autopilot (`NMG_SDLC_AUTOPILOT`) is removed. Interactive `/sdlc-*` commands keep the fail-closed headless refusal unconditionally. `/sdlc-execute` runs headless by submitting its rendered workflow as the prompt | Must |
| FR7 | The smoke gate delivers the issue named by the verify worker's provisioning record through a headless `claude -p --plugin-dir <candidate>` `/sdlc-execute` session, and never drafts or specifies an issue itself | Must |
| FR8 | Upgrade rewrites the managed v3 and v4 Herdr `CONTRIBUTING.md` sentences to the subagent sentence, idempotently | Must |
| FR9 | Stage agent definitions in `agents/*.md` no longer state Herdr-only dispatch and carry no `model` or `effort` frontmatter. Their bodies become the stage subagents' system prompts | Should |
| FR10 | README, `CONTRIBUTING.md`, `CLAUDE.md`, `references/claude-code-tooling.md`, `references/contribution-guide.md`, the execute workflow and the steering snippets describe subagent-based delivery, headless `/sdlc-execute` runs and `/sdlc-execute --result`. They no longer document autopilot, and `CHANGELOG.md` records its removal as a breaking change | Must |
| FR11 | When `/sdlc-execute` finishes, its controller records the terminal status and final result lines under the supervising Claude session id. `/sdlc-execute --result` prints that record and exits with the recorded status | Must |
| FR12 | A project steering snippet routed only to `worker:verify` (`steering/snippets/project-smoke.md`) directs smoke provisioning as AC13 describes. Provisioning is nmg-sdlc's own steering, not plugin behavior, and tmux is required only on machines that verify nmg-sdlc itself | Must |
| FR13 | A new ADR, `docs/decisions/2026-11-08-execute-stage-subagents.md`, supersedes cutover ADR decisions 4 (autopilot) and 6 (worker permission mode), and the cutover ADR marks both as superseded. The `execute` and `claude-code-plugin` capabilities in `references/rewrite-contract.{json,md}`, and the Herdr-worker and autopilot rows in `references/rewrite-verification.md`, describe the #538 behavior | Must |

## Out of Scope

- Running stages of one issue in parallel, or running several issues concurrently
- Changing the full-green gate, verification semantics, or delivery merge rules
- Agent teams, teammates, and worktree or remote isolation for stage workers
- A visual dashboard or pane UI for workers beyond Claude Code's built-in subagent view
- Rewriting historical specs or released `CHANGELOG.md` entries. ADRs and `references/rewrite-*` change only as FR13 describes

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #538 | 2026-11-08 | Initial feature spec |
| #538 | 2026-11-08 | Amendment: `claude -p` has no plan or question tools, so autopilot is removed (AC9, FR6). The verify worker provisions the smoke issue through real TUI draft-issue and write-spec sessions driven in tmux (AC13, FR12), and the smoke gate delivers that recorded issue (AC10, FR7) |
