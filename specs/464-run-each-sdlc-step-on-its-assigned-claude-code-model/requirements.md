# Requirements: Run each nmg-sdlc step on its assigned Claude Code model

**Issue**: #464
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG

---

## User Story

**As a** developer running nmg-sdlc in Claude Code and Herdr
**I want** every nmg-sdlc step, both the slash commands and the `/sdlc-execute` stage workers, to run on the Claude Code model suited to its workload
**So that** mechanical steps run on a fast model, implementation and delivery run on a balanced coding model, verification, repair, and planning run on the most capable model, and the model I chose for my session stays unchanged

## Background

nmg-sdlc became a Claude Code plugin in v4.0.0 (#466). Claude Code offers three per-step model mechanisms, and none of them changes the session model:

- A plugin command file's frontmatter `model` applies to that command's run only.
- A Claude Code process started with `claude --model <alias>` runs on that model.
- A hooks-module `turn.step` hook can rewrite the `model` of each main-loop model request with `next({ ...e, model })`.

The model aliases `haiku`, `sonnet`, and `opus` always resolve to the current model of each tier.

This spec replaces the earlier OMP-role spec for #464 and absorbs #463, which assigned OMP roles to execute stage workers. Both specs assumed OMP `modelRoles`, `pi.setModel`, and session-model restore, and none of those exist in Claude Code.

## Current State

- `scripts/sdlc-execute.mjs` `workerAgentArgs` starts every Herdr Claude worker with `--plugin-dir <plugin-root> --permission-mode <mode>` and no `--model`, so every stage runs on the user's default Claude Code model.
- `src/sdlc-commands.mjs` `renderAutomatedCommandMarkdown` writes only `description` and `argument-hint` frontmatter, so `/sdlc-status`, `/sdlc-verify-code`, and `/sdlc-open-pr` run on the session model.
- `hooks/register.ts` registers the six interactive commands and `/sdlc-execute` and submits their workflows, and it never changes a model.
- In `agents/`, `starter.md` declares `model: haiku` and `architecture-reviewer.md` declares `model: opus`. `spec-implementer.md` and `deliverer.md` omit `model`. The `steering/snippets/project-tech.md` Agent Files table records those values.

## Model Map

| Step | Model |
|------|-------|
| execute stage `start` | `haiku` |
| execute stage `implement` | `haiku` |
| execute stage `verify` | `opus` |
| execute stage `deliver` | `haiku` |
| execute repair re-dispatch (`implement`, `verify`, `deliver`) | `opus` |
| `/sdlc-status` | `haiku` |
| `/sdlc-execute` (controller session) | `haiku` |
| `/sdlc-open-pr` | `haiku` |
| `/sdlc-verify-code` | `opus` |
| `/sdlc-draft-issue`, `/sdlc-write-spec`, `/sdlc-onboard-project`, `/sdlc-upgrade-project`, `/sdlc-steering`, `/sdlc-run-retro` | `opus` |

## Acceptance Criteria

### AC1: Fresh stage workers start on their stage model

**Given** an issue whose next execute stage is start, implement, verify, or deliver, and the controller has recorded no repairable failure for it in the current invocation
**When** `/sdlc-execute` launches that stage's Herdr Claude worker
**Then** the `herdr agent start` arguments after `--` are `--plugin-dir <plugin-root> --permission-mode <mode> --model <model>`
**And** `<model>` is the Model Map's model for that stage

### AC2: Repair re-dispatch escalates to opus

**Given** the controller recorded a failure for the issue whose reason code is neither `pr_evidence_pending` nor `mergeability_reverification_required`
**When** it launches the next implement, verify, or deliver worker for that issue
**Then** the worker arguments end with `--model opus`
**And** once a stage passes and the failure clears, the next dispatch uses its AC1 model again

### AC3: Automated command files declare their model

**Given** the generated command files `commands/sdlc-status.md`, `commands/sdlc-verify-code.md`, and `commands/sdlc-open-pr.md`
**When** Claude Code loads them
**Then** their frontmatter `model` is `haiku`, `opus`, and `haiku` respectively
**And** running one of them leaves the session model unchanged after it completes

### AC4: Hooks-registered commands run on their model

**Given** an interactive TUI session on model X
**When** the user runs `/sdlc-execute` or one of the six interactive commands
**Then** every main-loop model request of that command's run, including turns the hooks module submits for it (the plan-mode workflow, write-spec Continue, and the write-spec Finished nudge), names the command's Model Map model
**And** subagent requests and the effort setting are not rewritten
**And** `$.session.model()` still reports X

### AC5: The override ends when the user moves on or picks a model

**Given** a hooks-registered command's model override is active
**When** the user submits a prompt or another slash command of their own (from the composer or Remote Control), or the session model changes from the one recorded when the command started
**Then** later model requests are sent unchanged on the session's own model

### AC6: Packaged agents and steering declare the same models

**Given** the packaged subagents under `agents/`
**When** Claude Code loads the plugin
**Then** frontmatter `model` is `haiku` for `starter`, `haiku` for `spec-implementer`, `opus` for `architecture-reviewer`, and `haiku` for `deliverer`
**And** the `steering/snippets/project-tech.md` Agent Files table lists those values

### AC7: Worker start failure on a model-routed launch

**Given** `herdr agent start` exits non-zero for a model-routed stage launch
**When** the controller dispatches that stage
**Then** `/sdlc-execute` stops with `agent_start_failed`
**And** no prompt is sent to that worker
**And** the owned worker pane is closed unless `--retain-worker` was passed

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | One frozen, Node-free model map defines every Model Map entry. The execute controller, the command-file renderer, the hooks module, and the agent and steering contract tests read it, and no step's model is defined anywhere else | Must |
| FR2 | Every Herdr worker launch appends `--model <model>`: the stage model, or `opus` for a repair re-dispatch as defined in AC2 | Must |
| FR3 | `renderAutomatedCommandMarkdown` writes the command's `model` frontmatter, and the checked-in `commands/*.md` match the renderer | Must |
| FR4 | The hooks module rewrites the `model` of main-loop `turn.step` requests while a hooks-registered command's override is active, and never calls a session-model setter or writes settings | Must |
| FR5 | The override ends at the user's next composer or Remote Control submission or at a change of session model (AC5). Plugin-submitted and meta prompts do not end it | Must |
| FR6 | Model values are only the aliases `haiku`, `sonnet`, and `opus`. Full model ids are never used | Must |
| FR7 | Agent frontmatter, the steering Agent Files table, and `README.md` document the Model Map | Must |

## Out of Scope

- Changing reasoning effort for any step
- User-configurable per-step model overrides
- Changing the model used by `claude -p` exercise runners (`--model` there stays caller-selected)
- Writing Claude Code settings, including `model` and `availableModels`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #464 | 2026-10-22 | Initial feature spec (OMP model roles) |
| #464 | 2026-10-24 | Replaced OMP roles with Claude Code per-step models; absorbed #463 stage-worker models |
| #482 | 2026-10-24 | Implement and deliver stages, `/sdlc-open-pr`, `spec-implementer`, and `deliverer` moved from `sonnet` to `haiku` (effort is owned by #482) |
