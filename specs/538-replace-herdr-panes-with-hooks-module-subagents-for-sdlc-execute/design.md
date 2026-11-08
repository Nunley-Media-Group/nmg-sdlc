# Design: Replace Herdr panes with hooks-module subagents for /sdlc-execute

**Issue**: #538
**Date**: 2026-11-08
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/535-make-sdlc-execute-stage-models-and-efforts-configurable-per-project-via-steering-sdlc-models-json/

## Overview

The detached Node controller keeps the same process chain, lease, routing, gates and handoff validation: `supervise` → bootstrap → daemon → controller in `scripts/sdlc-execute-supervisor.mjs`. Only its worker transport changes. `defaultHerdr` is replaced by a file-based host adapter, `scripts/sdlc-execute-host.mjs`, which writes worker requests into the execute session directory. The nmg-sdlc hooks module (`hooks/register.ts`) services those requests from a timer:

- spawns stage subagents of a per-entry registered type;
- records their activity, appends guidance, resumes them, and stops them;
- writes a heartbeat and the responses;
- submits a prompt to the idle main session when a report is waiting.

Pure, Node-free logic shared by the hooks module and Node scripts lives in two modules:

- `src/stage-models.mjs`: stage model and effort validation, moved out of `scripts/sdlc-models.mjs`;
- `src/execute-host.mjs`: request and response schemas, activity summaries, and prompt text.

Headless support has three parts:

- `/sdlc-execute` runs without a UI, answering its command with the rendered workflow;
- interactive commands run under `NMG_SDLC_AUTOPILOT=1`;
- the result is recorded per Claude session id, and `/sdlc-execute --result` reads it back.

## Architecture

```text
supervising Claude session (Opus/Fable, TUI or claude -p)
  │ Bash: sdlc-execute.mjs goal / supervise / wait / decide  (return at controller suspension points)
  ▼
scripts/sdlc-execute-supervisor.mjs ── detached controller (scripts/sdlc-execute.mjs runExecute)
  │ writes request-<n>.json (+ request-<n>.prompt.md), report-<seq>.json, worker.json, result.json
  ▼
.nmg-sdlc/execute/<session>/   ◄── hooks/register.ts timer ($.clock.every 1000 ms) writes
                                   response-<n>.json, agent-<agentId>.json, host.json
hooks/register.ts
  ├─ $.agent.register({ name: 'execute-<entry>', model, effort?, permissionMode, prompt: agents/<agent>.md body, … })
  ├─ $.agent.spawn({ subagentType: 'nmg-sdlc:execute-<entry>', prompt, name, description, cwd })
  ├─ tool.call / turn.step / turn.complete hooks filtered by worker agentId → activity, model/effort, deny-after-stop
  ├─ $.session.append / $.session.send / $.tool.call({ tool: 'TaskStop', task_id })
  └─ $.prompt.submit(check-in notice) when a report is undelivered and the main loop is idle
```

### Dispatch, waiting and completion

1. The controller resolves the stage entry with `stageEntry(step, failure, config)`. `repair` is used for a repair redispatch, with the `REPAIR_EXEMPT_REASONS` exemptions unchanged. It then writes a `spawn` request and polls for the response every 250 ms.
2. The hooks timer validates the request with `validateHostRequest` and reads the body of `<plugin-root>/agents/<agent>.md`, without its frontmatter. It registers `execute-<entry>`; the effort is omitted when the entry's effort is `default`. Spawning happens from the timer callback, not inside a tool hook, so every nmg-sdlc hook sees the subagent's steps and tool calls. The response is `{ ok: true, agentId }`, or `{ ok: false, deny }` when validation fails, the agent file is missing, registration rejects, or spawn denies.
3. A denied response makes the controller throw `worker_start_refused: <deny>`. The controller result exits non-zero and no later stage runs (AC12). An accepted response makes the controller write `worker.json` (`{ issue, stage, agentId }`). `wait` and `decide` then return `NMG_SDLC_EXECUTE_WORKER: <json>`, and the supervising session ends its turn.
4. The subagent writes and validates its handoff as today. When it ends a turn, the hooks module records `{ reason, at }` and the `$.agent.list()` status in `agent-<agentId>.json`, and the subagent's hand-back starts a main-session turn.
5. The controller sees the turn end and evaluates the handoff:
   - A fresh handoff produces a stage report.
   - No handoff but a `.waiting` marker: keep waiting.
   - No handoff and no marker, the first time: a `send` request with `reminderPrompt` resumes the subagent.
   - No handoff and no marker, the second time: `missing_handoff`.
   - Status `failed`: `process_lost`.
6. In that turn, the supervising session runs `wait --session <id> --after <seq>`. It receives the stage report and decides as today.

### Check-ins (AC4, FR3)

`superviseWorker` polls the agent file and the handoff every 2 s:

| Reason | Trigger |
|--------|---------|
| `interval` | `now - lastCheckIn ≥ interval` |
| `activity_unchanged` | `lastActivityAt` unchanged for at least the interval; reported once per unchanged span |
| `waiting_marker_stale` | as today |

The check-in report replaces `pane`, `paneTail` and `paneChangedSecondsAgo` with `agentId` and `activity: { status, toolCalls, latestText, lastActivitySecondsAgo }`. The hooks timer watches `report-<seq>.json`. A report that no `wait`/`decide` output has delivered gets one `$.prompt.submit` once the main loop has been idle for 5 s. The prompt's text is `checkInNotice(session, after)`: "nmg-sdlc /sdlc-execute report <seq> is waiting. Run: node "<plugin-root>/scripts/sdlc-execute.mjs" wait --session <id> --after <after>".

### Decisions (AC5, AC6, FR4)

| Decision | Controller action | Hooks action |
|----------|-------------------|--------------|
| `prompt` on a running worker | `append` request with `guidancePrompt` text, then wait for a fresh handoff | `$.session.append({ agentId, message: { type: 'user', content: [{ type: 'text', text }] } })`; if that is denied because the loop has ended, `$.session.send({ to: { agentId }, text })` |
| `redispatch` | `stop` request; the next `spawn` request is written only after `{ ok: true }` | `$.tool.call({ tool: 'TaskStop', task_id: agentId })`; mark stopped; read `$.agent.list()`. The response is ok when the status is `killed`, `completed` or `failed` |
| `halt` | `stop` request, then throw `supervisor_halt: <text>` | same as `redispatch` |

After a stop, a `tool.call` hook denies every further call from that `agentId` with `nmg-sdlc: this /sdlc-execute stage worker was stopped`. A failed stop throws `worker_stop_failed`, and the run exits non-zero.

### Liveness, lease and cancellation

- The hooks timer writes `host.json` every 15 s while a bridge session is active.
- `fileSupervisor` halts with `supervising session ended` when the heartbeat is older than 60 s. This replaces the `listPanes` orchestrator check.
- A host request waiting on a stale heartbeat throws `supervising_session_lost`.
- The lease record replaces `controllerPaneId` with `supervisorSession` (the execute session id). `reclaimStaleControllerLease` reclaims only when the recorded pid is dead and that session's `host.json` is absent or older than 60 s.
- `foreignActiveWorker` is removed; subagents end with their session, and the lease guards the project.
- `cleanupCancelledRun` writes `stop` requests for the agent in `worker.json` when the heartbeat is fresh, then releases the lease as today.

### Headless runs (AC7, AC9, FR6)

`hooks/register.ts` `command.run` behavior:

- **`/sdlc-execute`**
  - It is exempt from the headless refusal.
  - With no surfaces (`!interactive || surfaces().length === 0`), it answers `{ text: rendered.text }` so the workflow runs as the headless prompt. In the TUI it keeps the timer submission.
  - The `turn.complete` goal handshake awaits `setExecuteGoal` when headless, instead of `void`.
- **Interactive commands with no surfaces and `autopilot`**
  - They answer `{ text: headlessPlanPreamble(name) + rendered.text }`. The preamble tells the model to call `EnterPlanMode` first.
  - The autopilot `classic.PermissionRequest` branch also allows `EnterPlanMode`.
  - Without autopilot, the existing `Run /<name> in the TUI.` / exit 2 refusal is unchanged.
- **Write-spec merge**
  - When headless, the Bash `tool.call` hook rewrites a `publish-approved-spec.mjs merge` call with `run_in_background: true` to run in the foreground with `timeout: 600000`. Publication recognition is unchanged.
- **Session id and Herdr toast**
  - `session.start` sets `NMG_SDLC_CLAUDE_SESSION_ID` with `$.env.set(…, await $.session.id())` and removes the Herdr toast.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `/sdlc-execute` arguments (`parseArgs`, `scripts/sdlc-execute.mjs`) | tokens | usage error naming `--retain-worker` | `--retain-worker` is rejected before `goal` returns; `--check-in-seconds N` is unchanged. The hooks argument hint becomes `[--check-in-seconds N] [#N ...]` |
| `/sdlc-execute --result` (`hooks/register.ts`) | sole argument `--result` | `{ text: lines.join('\n'), exitCode: status }`; with no record, `No /sdlc-execute result is recorded for session <id>.` and exit 2 | Reads `.nmg-sdlc/execute/results/<$.session.id()>.json` with `$.fs`. Runs before the model gate; mutates nothing |
| `sdlc-execute.mjs supervise` | args | first line `NMG_SDLC_EXECUTE_SESSION: <uuid>` | Announces the session directory the hooks module services |
| `sdlc-execute.mjs wait` / `decide` | `--session`, `--after`, `--seq` | adds `NMG_SDLC_EXECUTE_WORKER: {"issue","stage","agentId"}` | Returned when a worker is running and no report is pending; REPORT, finished and RUNNING (9-minute controller-side bound) are unchanged |
| `sdlc-execute.mjs run` | args | exit 2 `execute requires /sdlc-execute in a Claude Code session` | Without a supervising session there is no host |
| `createFileHost({ sessionDir, now, sleep })` (`scripts/sdlc-execute-host.mjs`) | — | `{ spawn, activity, append, send, stop, hostAlive }` | `spawn` → `{ agentId }` or throws `worker_start_refused`; `stop` throws `worker_stop_failed`; any wait throws `supervising_session_lost` on a stale heartbeat |
| `runExecute({ host, … })` | `host` replaces `herdr` | unchanged results | `HERDR_*` preflight, `integrationStatus`, `paneEnvironment`, pane layout/split/close and `foreignActiveWorker` are removed; `gh auth status` stays |
| `validateStageModels`, `isValidStageModel`, `StageModelsError`, `STAGE_MODEL_DEFAULTS`, `STAGE_NAMES`, `stageModelsWarning` | — | unchanged | Move to Node-free `src/stage-models.mjs` (+ `.d.mts`); `scripts/sdlc-models.mjs` re-exports them and keeps the file IO |
| `src/execute-host.mjs` (+ `.d.mts`) | — | pure functions | `validateHostRequest`, `hostResponse`, `summarizeToolCall` (Bash command / file path / tool name, ≤200 chars), `activityRecord` (≤10 tool calls, `latestText` ≤2000 chars), `checkInNotice`, `headlessPlanPreamble`, `stoppedWorkerDenial`, `executeResultText`, `STAGE_AGENTS` (`start→starter`, `implement→spec-implementer`, `verify→architecture-reviewer`, `deliver→deliverer`) |
| Worker prompt header (`src/sdlc-prompt-snippets.mjs` `WORKER_HEADER`) | — | text | "a Herdr Claude worker started by /sdlc-execute" becomes "a stage subagent started by /sdlc-execute" |
| `contributing-v4-host-language` upgrade item (`scripts/sdlc-upgrade.mjs`) | `CONTRIBUTING.md` | `applied` / `already-current` | Detects the v3 or v4 sentence and replaces each with `SUBAGENT_CONTRIBUTING_SENTENCE` |
| Smoke provider (`steering/extensions/nmg-sdlc-smoke.mjs`) | config | unchanged pass/fail contract | See Smoke gate below |

## Data / Storage Changes

The session directory is `.nmg-sdlc/execute/<session>/` (git-ignored). Its existing files are unchanged: `daemon.json`, `report-<seq>.json`, `decision-<seq>.json`, `result.json`.

| File | Writer | Shape |
|------|--------|-------|
| `request-<n>.json` | controller | `{ schemaVersion: 1, session, n, kind: 'spawn' \| 'append' \| 'send' \| 'stop', … }`. A spawn adds `{ issue, step, entry, agent, name, model, effort: string \| null, permissionMode, promptFile, cwd }`; append and send add `{ agentId, text }`; stop adds `{ agentId }` |
| `request-<n>.prompt.md` | controller | Full worker instructions (preamble plus inlined workflow) |
| `response-<n>.json` | hooks | `{ schemaVersion: 1, session, n, ok, agentId?, status?, via?, deny? }` |
| `agent-<agentId>.json` | hooks | `{ schemaVersion: 1, agentId, status, toolCalls: [{ tool, summary, at }], latestText, lastActivityAt, turns: [{ reason, at }], stopped, updatedAt }` |
| `worker.json` | controller | `{ issue, stage, agentId }` while a worker is running |
| `host.json` | hooks | `{ schemaVersion: 1, claudeSessionId, at }` heartbeat |

Result record: `.nmg-sdlc/execute/results/<claudeSessionId>.json` holds `{ schemaVersion: 1, claudeSessionId, session, status, lines, completedAt }`.

- The supervisor writes it atomically when it produces the terminal result and `NMG_SDLC_CLAUDE_SESSION_ID` is a UUID.
- `lines` is the controller's `#N: MERGED and CLOSED` lines on status 0, or `/sdlc-execute stopped: <diagnosis>` otherwise.
- A later run in the same Claude session overwrites it.
- It is not removed with the session directory.

## Smoke gate

`steering/extensions/nmg-sdlc-smoke.mjs` changes:

- **Removed:** `validHerdrEnvironment`, `createHerdrAdapter`, `claudeDialog`, `CLAUDE_DIALOGS`, `TRUST_ACCEPT_KEYS`, `trustSmokeClone` and `closeAbandonedProvisionPane`. Headless `claude -p` does not show a workspace trust dialog.
- **Provisioning:** runs `claude -p --plugin-dir <pluginRoot> --permission-mode <workerPermissionMode(env)> "/sdlc-draft-issue <need>"`, then `"/sdlc-write-spec #<N>"`, through `executeCommand` with cwd set to the provisioning clone and env `{ …env, NMG_SDLC_AUTOPILOT: '1' }`.
  - The draft phase passes only when exactly one new issue appears above the baseline after the process exits.
  - The spec phase passes only on `publishedSpec()` evidence after the process exits.
  - A resumed `provisioning` phase rechecks this GitHub evidence before launching again.
- **Delivery:** fresh runs and remainder resumes run `claude -p --session-id <randomUUID> --plugin-dir <pluginRoot> --model opus --permission-mode <mode> "/sdlc-execute #N …"`. The cwd is the delivery clone, and the env keeps `NMG_SDLC_PLUGIN_ROOT`, `NMG_SDLC_SMOKE_OWNED=1` and `NMG_SDLC_SMOKE_RECOVERY`.
  - The controller status comes from `<clone>/.nmg-sdlc/execute/results/<uuid>.json`; a missing record counts as a nonzero status.
  - `verifyRemoteDelivery` and the rule that a nonzero status passes only with exact current-invocation proof are unchanged.

## State and UI Behavior

| Agent status / event | Controller interpretation |
|----------------------|---------------------------|
| `running`, `pending` | Worker active; check-ins apply |
| `waiting` | Held on its own background work; `waiting_marker_stale` applies when a marker exists |
| Turn end with a fresh handoff | Stage report |
| `idle` / `completed` turn end, no handoff, no marker | One reminder through `send`, then `missing_handoff` |
| `failed` | `process_lost` |
| `killed` after a stop request | Expected; the stop is confirmed |

Each stage subagent shows in Claude Code's built-in subagent view under the name `s<issue>-<step>-<runId8>`.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep the detached controller and bridge it to the hooks module through session-directory files | Selected | Keeps routing, the lease, gates and handoff validation (FR2) intact and reuses the existing report/decision protocol |
| Rewrite the controller as a step-wise state machine run from `Bash` | Rejected | Rewrites all of `runExecute` for no observable gain |
| Spawn workers with the model's `Agent` tool | Rejected | Its `model` accepts only four aliases and it cannot set the permission mode, which breaks AC2 and FR1 |
| Register the five stage types once at session start from `steering/sdlc-models.json` | Rejected | A second config reader would diverge from the controller's repair selection; registering at dispatch from controller-resolved values keeps one loader |
| Read the headless outcome from Claude's internal transcript file | Rejected | The transcript format is internal; a project-local record keyed by the session id is stable, and `--resume` lets `/sdlc-execute --result` set the exit code through the documented `command.run` `exitCode` |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #538 | 2026-11-08 | Initial feature design |
