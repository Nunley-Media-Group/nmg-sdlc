# ADR: Run /sdlc-execute stages as hooks-module subagents and remove autopilot

**Status**: Accepted
**Date**: 2026-11-08
**Issue**: #538
**Spec**: `specs/538-replace-herdr-panes-with-hooks-module-subagents-for-sdlc-execute/`
**Supersedes**: decisions 4 (autopilot) and 6 (worker permission mode) of [2026-10-24-claude-code-cutover.md](2026-10-24-claude-code-cutover.md)

## Context

Since 4.0.0, `/sdlc-execute` has run each stage (start, implement, verify, deliver) as a Claude Code session in a sibling Herdr pane. That made Herdr a hard runtime requirement: the execute preflight, the controller lease and the live smoke gate all depended on it.

The Claude Code hooks-module API can now register, spawn, observe, steer and stop background subagents. A stage worker therefore no longer needs a terminal pane.

The cutover ADR's autopilot (`NMG_SDLC_AUTOPILOT=1`) existed so that an unattended driver could pass the interactive plan and question gates. Its only driver was the smoke gate's provisioning pane, which typed `/sdlc-draft-issue` and `/sdlc-write-spec` into a Herdr pane.

Without Herdr, the obvious replacement was headless `claude -p`. Live probes on Claude Code 2.1.319 showed that `claude -p` exposes no `EnterPlanMode`, `ExitPlanMode` or `AskUserQuestion` tool, even with `--permission-mode plan` or an explicit `--tools` list. The hooks module can only register `mcp__nmg-sdlc__*` tools. The interactive commands' real gates therefore cannot run headless, and there is nothing for autopilot to answer.

## Decisions

### 1. Stage workers are hooks-module subagents

The detached controller keeps its routing, lease, gates and handoff validation. Only its worker transport changes. It writes worker requests into the execute session directory, and the nmg-sdlc hooks module services them from a timer:

- It registers one agent type per stage entry, `nmg-sdlc:execute-<entry>`. The model and effort come from `steering/sdlc-models.json`, and the system prompt is the stage's `agents/*.md` body.
- It spawns, observes, appends guidance to, resumes and stops those subagents.
- It submits a check-in prompt to the idle supervising session.

The permission mode still defaults to `auto`, with `NMG_SDLC_WORKER_PERMISSION_MODE` as the override. This replaces cutover decision 6. Herdr, its environment variables, `--retain-worker` and every `herdr` invocation are removed.

*Rejected:* spawning workers with the model's `Agent` tool. It accepts only four model aliases and cannot set the permission mode.

### 2. Headless `/sdlc-execute` submits its workflow as the prompt

A command's own `{ text }` answer is display-only, so it starts no model turn. `/sdlc-execute` therefore answers `{}` in every session and submits its rendered workflow from a 1 ms timer. A live `claude -p` probe confirmed that this starts a model turn. The controller records its result under the Claude session id, and `/sdlc-execute --result` reads it back, so a headless driver gets the controller's exit status.

### 3. Autopilot is removed

`NMG_SDLC_AUTOPILOT` is no longer read, and the hooks module never approves a plan or answers a question on its own. The one exception is the existing write-spec Finished approval, which a person's own Finished answer arms. Interactive commands stay TUI-only: headless, they print `Run /<command> in the TUI.` and exit 2, whatever the environment holds. This replaces cutover decision 4.

Inside `/sdlc-execute`, the controller and its supervising session already make every unattended delivery decision. Autopilot's remaining role, provisioning the smoke issue, moves to decision 4 below.

*Rejected:* keeping autopilot with a headless preamble that replaces plan mode. The real gates would never run, so the smoke gate would test something other than the commands people use.

### 4. The verify stage provisions the smoke issue; the provider only delivers it

nmg-sdlc's own steering adds the snippet `steering/snippets/project-smoke.md` (`project.smoke`), routed only to `worker:verify`. Before the registered gates run, it has the verify worker do the following:

- reuse an open, recorded smoke issue, or else start an interactive `claude --plugin-dir <candidate>` session in a detached tmux session in a fresh smoke clone;
- run the real `/sdlc-draft-issue` and `/sdlc-write-spec`, answering each dialog with judgment;
- record the result in `.nmg-sdlc/smoke/provisioned.json`.

The deterministic smoke provider never drafts or specifies an issue. It checks the recorded issue on GitHub (open, `spec-created`, merged `docs: approve spec for #N` PR, authored by the authenticated user, not already delivered). It then delivers that issue through headless `/sdlc-execute` under its unchanged exact-head pass conditions. An explicit `NMG_SDLC_SMOKE_ISSUES` queue still takes priority.

*Rejected:*

- Provisioning from a checked-in fixture spec: deterministic, but it stops exercising the real draft-issue and write-spec.
- Having the provider script tmux dialogs: answering plan and question gates needs judgment, and scripted dialog matching is how the Herdr provisioning broke.

## Consequences

- `/sdlc-execute` runs in any Claude Code session on an Opus or Fable model, in the TUI or under `claude -p`, without Herdr.
- **Breaking:** drivers that set `NMG_SDLC_AUTOPILOT=1` to run interactive commands unattended no longer get their gates answered. Interactive commands need a person in the TUI.
- Verifying nmg-sdlc itself requires `tmux` and an interactive-capable `claude` on the verifying machine. Consumer projects need neither.
- A smoke provisioning failure can be environmental (tmux, terminal, dialog recognition) rather than a plugin defect. The snippet requires the verify worker to classify it before reporting.
- `references/rewrite-contract.{json,md}` and `references/rewrite-verification.md` record the 4.0 rows that #538 changed.
