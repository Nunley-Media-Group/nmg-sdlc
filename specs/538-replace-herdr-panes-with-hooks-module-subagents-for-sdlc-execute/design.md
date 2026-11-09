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

Headless support has two parts:

- `/sdlc-execute` runs without a UI, submitting its rendered workflow as the prompt from a timer;
- the result is recorded per Claude session id, and `/sdlc-execute --result` reads it back.

Autopilot (`NMG_SDLC_AUTOPILOT`) is removed, and interactive commands stay TUI-only. Smoke provisioning moves out of the deterministic provider and into the verify stage. A project steering snippet has the verify worker drive the real `/sdlc-draft-issue` and `/sdlc-write-spec` in an interactive Claude session inside tmux, answering their gates itself. The provider only delivers the issue that the worker recorded.

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
  - A command's own `{ text }` answer is display-only. In every session, TUI or headless (`!interactive || surfaces().length === 0`), it answers `{}` and submits the rendered workflow with `$.clock.after(1, () => $.prompt.submit({ text, asUser: true }))`. A live `claude -p` probe confirmed that this starts a model turn, while an immediate submit or a `context` answer does not.
  - The `turn.complete` goal handshake awaits `setExecuteGoal` when headless, instead of `void`.
- **Interactive commands with no surfaces**
  - They always answer `Run /<name> in the TUI.` with exit 2, before rendering, submitting or mutating anything. `NMG_SDLC_AUTOPILOT` is not read.
- **Autopilot removal**
  - The `autopilot` flag, its `session.start` read, and its `classic.PermissionRequest` branches for `ExitPlanMode` and `AskUserQuestion` are removed, along with `recommendedAnswers` and the write-spec Finished preference they used.
  - The write-spec Finished `ExitPlanMode` approval (`writeSpec.exitPending`) is unchanged.
  - `headlessPlanPreamble` and the headless write-spec merge rewrite are removed, because write-spec never runs headless.
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
| `src/execute-host.mjs` (+ `.d.mts`) | — | pure functions | `validateHostRequest`, `hostResponse`, `summarizeToolCall` (Bash command / file path / tool name, ≤200 chars), `activityRecord` (≤10 tool calls, `latestText` ≤2000 chars), `checkInNotice`, `stoppedWorkerDenial`, `executeResultText`, `STAGE_AGENTS` (`start→starter`, `implement→spec-implementer`, `verify→architecture-reviewer`, `deliver→deliverer`) |
| Worker prompt header (`src/sdlc-prompt-snippets.mjs` `WORKER_HEADER`) | — | text | "a Herdr Claude worker started by /sdlc-execute" becomes "a stage subagent started by /sdlc-execute" |
| `contributing-v4-host-language` upgrade item (`scripts/sdlc-upgrade.mjs`) | `CONTRIBUTING.md` | `applied` / `already-current` | Detects the v3 or v4 sentence and replaces each with `SUBAGENT_CONTRIBUTING_SENTENCE` |
| Smoke provider (`steering/extensions/nmg-sdlc-smoke.mjs`) | config, `.nmg-sdlc/smoke/provisioned.json` | unchanged pass/fail contract; `nmg-sdlc-smoke smoke issue not provisioned` | See Smoke gate below |
| Smoke provisioning snippet (`steering/snippets/project-smoke.md`, manifest id `project.smoke`) | — | prose routed to `worker:verify` only | See Smoke provisioning below |

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

- **Removed:**
  - `validHerdrEnvironment`, `createHerdrAdapter`, `claudeDialog`, `CLAUDE_DIALOGS`, `TRUST_ACCEPT_KEYS`, `trustSmokeClone` and `closeAbandonedProvisionPane`;
  - `provisionSmokeIssue`, `newSmokeIssues`, the `provisioning` recovery phase and `provisionClone`. The provider never drafts or specifies an issue.
- **Queue resolution:** `resolveQueue` keeps the explicit `config.issues` and `config.issuesEnv` queues first. Otherwise, a config with `provision.record` yields `{ kind: "recorded", recordPath }`. The manifest config becomes `{ issuesEnv, provision: { need, record: ".nmg-sdlc/smoke/provisioned.json" } }`. The provider ignores `need`, which the snippet reads.
- **Recorded issue (AC10):**
  - The provider reads `<projectRoot>/<recordPath>`, which holds `{ schemaVersion: 1, repo: "Nunley-Media-Group/nmg-sdlc-smoke", issue, provisionedAt }`.
  - A missing or unparsable record, a different `repo`, or a non-positive-integer `issue` fails with `nmg-sdlc-smoke smoke issue not provisioned`.
  - When the recovery store already holds this issue for the same outer request, the existing recovery and terminal-proof path applies unchanged.
  - Otherwise, the issue must be OPEN and authored by the authenticated `gh` user, and `publishedSpec(issue)` must return evidence. A recorded issue that a different outer request has already delivered, or one that fails these checks, also fails with `nmg-sdlc-smoke smoke issue not provisioned`. That evidence names the reason (`closed`, `no spec-created label`, `no merged spec PR`, `foreign author`, `already delivered`).
  - The passing check is recorded as the `provisioned: { issue, published: true }` state that the delivery path uses today.
- **Delivery:** fresh runs and remainder resumes run `claude -p --session-id <randomUUID> --plugin-dir <pluginRoot> --model opus --permission-mode <mode> "/sdlc-execute #N …"`. The cwd is the delivery clone, and the env keeps `NMG_SDLC_PLUGIN_ROOT`, `NMG_SDLC_SMOKE_OWNED=1` and `NMG_SDLC_SMOKE_RECOVERY`.
  - The controller status comes from `<clone>/.nmg-sdlc/execute/results/<uuid>.json`; a missing record counts as a nonzero status.
  - `verifyRemoteDelivery` and the rule that a nonzero status passes only with exact current-invocation proof are unchanged.

## Smoke provisioning (AC13, FR12)

`steering/snippets/project-smoke.md` is registered in `steering/manifest.json` as `{ id: "project.smoke", consumers: ["worker:verify"], slot: "body", order: 510 }`. Only nmg-sdlc's own verify workers receive it; the plugin ships no provisioning behavior. The snippet instructs the verify worker as follows. It runs these steps before it runs the registered gates, and only when `repository.nmg-sdlc-smoke` is registered and no `NMG_SDLC_SMOKE_ISSUES` value is set:

1. **Reuse.** When `.nmg-sdlc/smoke/provisioned.json` names an issue that is OPEN and carries `spec-created`, and whose `docs: approve spec for #N` PR is merged (`gh issue view` / `gh pr list`), reuse it and skip to the gates. When the issue is OPEN with no published spec, reuse it and run only step 4. Never draft a second issue while a recorded one is open.
2. **Clone.** Clone `https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git` with `--single-branch` into a fresh scratch directory, and confirm that the origin matches and the tree is clean.
3. **Draft.** Run `tmux new-session -d -s nmg-smoke-<head8> -x 220 -y 60 -c <clone> 'claude --plugin-dir <project root>'`, and accept the workspace trust dialog.
   - Send `/sdlc-draft-issue <need>`, where `<need>` is `provision.need` from the `repository.nmg-sdlc-smoke` validation config.
   - Poll `tmux capture-pane -p -t nmg-smoke-<head8>` every 10–30 s, and answer each dialog with `tmux send-keys` as the person would.
   - Approve a plan that delivers the need as one small issue in the smoke repository, and reject a plan that does anything else. Answer each question with the option that keeps the work one small issue in the smoke repository.
   - Draft ends when the session is idle and `gh issue list -R Nunley-Media-Group/nmg-sdlc-smoke --author @me` shows exactly one new issue N. Write the record as soon as N exists, so a retry reuses N.
4. **Specify.** In the same session, send `/sdlc-write-spec #N` and answer its gates the same way, choosing `Finished — stop writing specs` when it offers another issue. Specify ends when N carries `spec-created` and its `docs: approve spec for #N` PR is merged.
5. **Clean up.** Kill the tmux session, remove the clone, and rewrite the record as `{ schemaVersion: 1, repo, issue: N, provisionedAt }`.
6. **Classify failures.** A missing `tmux` or `claude` binary, an unreadable pane, a dialog the worker cannot identify, or a GitHub or network failure is an environmental failure: report it and do not retry blindly. A draft-issue or write-spec workflow that errors, ignores its gates, or produces a malformed issue or spec is an nmg-sdlc defect: record it as a finding in the verification report. In either case, do not hand-edit the smoke repository to manufacture provisioning.
7. **Bound the work.** Do one draft attempt per verification. A stalled session (no pane change for 10 minutes) is killed and reported, not restarted repeatedly.

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
| Keep autopilot and run draft-issue and write-spec headless with a preamble that replaces plan mode | Rejected | `claude -p` has no `EnterPlanMode`, `ExitPlanMode` or `AskUserQuestion`, so the real gates would never run. Autopilot's only consumer was smoke provisioning, and the execute controller already owns unattended delivery decisions |
| Provision the smoke issue deterministically from a checked-in fixture spec | Rejected | It would stop exercising the real `/sdlc-draft-issue` and `/sdlc-write-spec` |
| Drive provisioning from the deterministic provider through tmux | Rejected | Answering plan and question dialogs needs judgment; scripted dialog matching is how the Herdr provider broke |
| Read the headless outcome from Claude's internal transcript file | Rejected | The transcript format is internal; a project-local record keyed by the session id is stable, and `--resume` lets `/sdlc-execute --result` set the exit code through the documented `command.run` `exitCode` |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #538 | 2026-11-08 | Initial feature design |
| #538 | 2026-11-08 | Amendment: headless `/sdlc-execute` submits its workflow from a timer; autopilot is removed; the verify worker provisions the smoke issue in tmux through the `project.smoke` snippet, and the provider delivers the recorded issue |
