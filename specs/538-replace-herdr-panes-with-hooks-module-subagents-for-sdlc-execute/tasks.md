# Tasks: Replace Herdr panes with hooks-module subagents for /sdlc-execute

**Issue**: #538
**Date**: 2026-11-08
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/535-make-sdlc-execute-stage-models-and-efforts-configurable-per-project-via-steering-sdlc-models-json/

## Implementation Tasks

### T001: Add the Node-free stage-model and host-protocol modules

**File(s)**: `src/stage-models.mjs`, `src/stage-models.d.mts`, `src/execute-host.mjs`, `src/execute-host.d.mts`, `scripts/sdlc-models.mjs`
**Type**: Create | Modify
**Depends**: none
**Acceptance**:
- `src/stage-models.mjs` holds `STAGE_MODEL_DEFAULTS`, `STAGE_NAMES`, `StageModelsError`, `isValidStageModel`, `validateStageModels` and `stageModelsWarning` with unchanged behavior and no imports. `scripts/sdlc-models.mjs` re-exports them and keeps `loadStageModels`, `completeStageModels` and the `ensure` CLI (AC2, AC3)
- `src/execute-host.mjs` exports the pure functions in design.md, with no imports, and `validateHostRequest` uses `isValidStageModel`. It rejects an unknown kind, an invalid model, an effort outside `low|medium|high|xhigh|max` or `null`, a permission mode outside `default|acceptEdits|auto|dontAsk|bypassPermissions`, an unknown agent, and a non-UUID session (FR1)

### T002: Replace the controller's Herdr transport with the file host

**File(s)**: `scripts/sdlc-execute-host.mjs`, `scripts/sdlc-execute.mjs`, `src/sdlc-prompt-snippets.mjs`
**Type**: Create | Modify
**Depends**: T001
**Acceptance**:
- `createFileHost` implements `spawn`, `activity`, `append`, `send`, `stop` and `hostAlive` over the session-directory files in design.md (FR1, FR3)
- `runExecute` takes `host` instead of `herdr`. The `HERDR_*` preflight, the integration probe, `defaultHerdr`, `workerAgentArgs`, `paneEnvironment`, pane split/layout/close and `foreignActiveWorker` are removed. `loadStageModels` still runs before any Git or GitHub call or spawn request (AC1, AC3, FR5)
- Each dispatch writes a spawn request whose `entry`, `model` and `effort` come from `stageEntry`/`stageModel`/`stageEffort`, with `null` for `default`. The `permissionMode` comes from `workerPermissionMode(env)` (AC2)
- A denied spawn throws `worker_start_refused: <reason>`, and no later stage is dispatched (AC12)
- `superviseWorker` produces `interval`, `activity_unchanged` and `waiting_marker_stale` check-ins. Check-in reports carry `agentId` and `activity` in place of `pane`, `paneTail` and `paneChangedSecondsAgo` (AC4)
- `prompt` writes an append request and then waits for a fresh handoff (AC5)
- `redispatch` and `halt` write a stop request. The replacement spawn request or the halt result is written only after the stop response is ok (AC6)
- A turn end without a handoff gets one `send` reminder, then `missing_handoff`; `failed` yields `process_lost`
- `parseArgs` rejects `--retain-worker` with a usage error naming it (AC8)
- `run` without a supervising session exits 2
- `WORKER_HEADER` names a stage subagent instead of a Herdr worker

### T003: Update the supervisor and the controller lease

**File(s)**: `scripts/sdlc-execute-supervisor.mjs`, `scripts/sdlc-controller-lease.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- `supervise` prints `NMG_SDLC_EXECUTE_SESSION: <uuid>` first. `wait` and `decide` return `NMG_SDLC_EXECUTE_WORKER: <json>` while a worker runs with no pending report (FR3)
- `fileSupervisor` halts with `supervising session ended` when `host.json` is older than 60 s. `cleanupCancelledRun` writes a stop request for the running worker and no longer builds a Herdr adapter (FR5)
- The lease records `supervisorSession` and reclaims only when the pid is dead and the session heartbeat is absent or stale (FR2)
- On a terminal result, the supervisor writes `.nmg-sdlc/execute/results/<NMG_SDLC_CLAUDE_SESSION_ID>.json` with `status` and `lines` (AC7, FR11)

### T004: Service stage subagents and headless runs in the hooks module

**File(s)**: `hooks/register.ts`, `src/host-events.mjs`, `src/host-events.d.mts`, `src/execute-host.mjs`, `src/execute-host.d.mts`
**Type**: Modify
**Depends**: T001, T003
**Acceptance**:
- After a `supervise` result announces a session, a `$.clock.every(1000)` timer services requests in order, once each:
  - It registers `execute-<entry>` with the request's model, its effort (omitted when `null`), its permission mode, `disallowedTools: ['AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode']` and the `agents/<agent>.md` body as its prompt, then spawns `nmg-sdlc:execute-<entry>`.
  - It writes `{ ok: false, deny }` for an invalid request, a missing agent file, a rejected registration, or a denied spawn (AC1, AC2, AC12, FR1)
- For worker agentIds:
  - `turn.step` sets the request's model and, when it is non-null, the effort (AC2);
  - `tool.call` and `turn.step` update `agent-<agentId>.json`, and the timer refreshes `latestText` from `$.session.messages({ agentId })` every 15 s (AC4);
  - `turn.complete` records the turn end and status without entering the main-loop handlers.
- Append, send and stop requests use `$.session.append`, `$.session.send` and `TaskStop` as design.md describes. A stopped agent's further tool calls are denied (AC5, AC6)
- The timer writes `host.json` every 15 s and submits `checkInNotice` once for each undelivered report after 5 s of main-loop idleness (AC4, FR3)
- `session.start` sets `NMG_SDLC_CLAUDE_SESSION_ID`; the Herdr toast is removed (FR5)
- The execute argument hint is `[--check-in-seconds N] [#N ...]` (AC8)
- `/sdlc-execute`:
  - is exempt from the headless refusal; TUI and headless alike answer `{}` and submit the rendered workflow from a 1 ms `$.clock.after` timer;
  - awaits the goal handshake when headless;
  - answers `--result` from the session's result record with its `exitCode` (AC7, FR11).
- Headless interactive commands always return `Run /<name> in the TUI.` with exit 2, before any render or submit (AC9, FR6)
- Autopilot is removed (AC9, FR6):
  - the `autopilot` flag and its `NMG_SDLC_AUTOPILOT` read;
  - the `ExitPlanMode` and `AskUserQuestion` autopilot branches;
  - `recommendedAnswers` in `src/host-events.mjs` (and its `.d.mts`);
  - `headlessPlanPreamble` in `src/execute-host.mjs` (and its `.d.mts`);
  - the headless write-spec `merge` foreground rewrite.
  The write-spec Finished approval stays

### T005: Update the stage agent definitions

**File(s)**: `agents/starter.md`, `agents/spec-implementer.md`, `agents/architecture-reviewer.md`, `agents/deliverer.md`, `scripts/skill-inventory.baseline.json`
**Type**: Modify
**Depends**: T004
**Acceptance**:
- No agent file has `model` or `effort` frontmatter (FR9)
- The Herdr dispatch sentence is replaced with: `/sdlc-execute` registers this body as the system prompt of its stage subagent, and the stage's model and effort come from `steering/sdlc-models.json` (FR9)
- The skill inventory baseline is regenerated, and `node scripts/skill-inventory-audit.mjs --check` exits 0

### T006: Rewrite the execute workflow for subagent supervision

**File(s)**: `workflows/execute/WORKFLOW.md`
**Type**: Modify
**Depends**: T003, T004
**Acceptance**:
- The Herdr preflight, the Herdr environment variables, `--retain-worker` and the `herdr server stop` prohibition are removed. The workflow states that workers are hooks-module stage subagents (FR5)
- The supervise loop:
  - `NMG_SDLC_EXECUTE_WORKER` means end the turn;
  - a stage worker hand-back or a check-in notice means run `wait --session <id> --after <seq>`;
  - decisions are made with `decide` as today (FR3, FR4).
- Headless runs print the final result lines last. `/sdlc-execute --result` is documented (AC7)

### T007: Make the smoke gate deliver the recorded issue in a headless session

**File(s)**: `steering/extensions/nmg-sdlc-smoke.mjs`, `steering/manifest.json`
**Type**: Modify
**Depends**: T004
**Acceptance**:
- `provisionSmokeIssue`, `newSmokeIssues`, the `provisioning` phase and every `NMG_SDLC_AUTOPILOT` use are removed. The provider never runs `/sdlc-draft-issue` or `/sdlc-write-spec` (AC10, FR7)
- `resolveQueue` keeps explicit queues first, then yields `{ kind: "recorded" }` from `provision.record`. The manifest config adds `"record": ".nmg-sdlc/smoke/provisioned.json"` (AC10)
- The recorded issue passes only as design.md "Smoke gate" describes. A missing, invalid, closed, unspecified, foreign-authored or already-delivered record fails with `nmg-sdlc-smoke smoke issue not provisioned` and names the reason (AC10)
- Delivery runs headless `claude -p --session-id <uuid> --plugin-dir <pluginRoot> --model opus "/sdlc-execute #N …"` in the delivery clone with the existing ownership environment, and reads the status from the session's result record (AC10)
- The Herdr environment check, the adapter, dialog handling, trust acceptance and pane recovery are removed; the pass conditions are unchanged (AC10, FR5)

### T008: Rewrite the managed CONTRIBUTING sentence during upgrade

**File(s)**: `scripts/sdlc-upgrade.mjs`, `references/contribution-guide.md`, `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/v3-detectors.md`, `workflows/upgrade-project/references/upgrade-procedures.md`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `SUBAGENT_CONTRIBUTING_SENTENCE` is "runs Claude Code stage subagents through implementation, verification, and delivery". The `contributing-v4-host-language` item detects the v3 or v4 sentence and replaces every occurrence of either with it (AC11, FR8)
- Unsafe or symlinked files are still refused. A second detection finds nothing (AC11)
- `references/contribution-guide.md` generates the new sentence, and the upgrade references describe the v3/v4 → subagent rewrite

### T009: Update public documentation and the changelog

**File(s)**: `README.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `references/claude-code-tooling.md`, `references/interactive-gates.md`, `steering/snippets/project-product.md`, `steering/snippets/project-tech.md`, `steering/snippets/project-structure.md`, `workflows/address-pr-comments/WORKFLOW.md`, `workflows/verify-code/references/exercise-testing.md`, `package.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md`, `docs/decisions/2026-10-24-claude-code-cutover.md`, `docs/decisions/2026-11-08-execute-stage-subagents.md`, `references/rewrite-contract.json`, `references/rewrite-contract.md`, `references/rewrite-verification.md`
**Type**: Modify
**Depends**: T004, T006, T007, T008
**Acceptance**:
- Each file describes delivery through hooks-module stage subagents and names no `HERDR_ENV`, `HERDR_SOCKET_PATH`, `HERDR_PANE_ID`, `herdr pane`, `herdr agent` or `herdr integration` requirement (FR10, FR5)
- README documents headless `claude -p` runs of `/sdlc-execute`, `/sdlc-execute --result` with `--session-id`/`--resume`, the check-in `activity` report and the removal of `--retain-worker` (FR10)
- README's "Autopilot for hands-off drivers" section is removed. Its live-smoke section describes verify-stage provisioning in tmux (the `project.smoke` snippet, the provisioning record, and the tmux requirement for nmg-sdlc's own verification) and keeps the explicit `NMG_SDLC_SMOKE_ISSUES` queue (AC9, AC13, FR10, FR12)
- `references/interactive-gates.md`, `CLAUDE.md`, `CONTRIBUTING.md`, the execute workflow, the steering snippets and `workflows/verify-code/references/exercise-testing.md` no longer mention autopilot (AC9)
- The `package.json` and `.claude-plugin/plugin.json` descriptions read "Spec-driven delivery for Claude Code", and the `herdr` keyword is removed. Their `version` fields are unchanged
- The superseding ADR and the cutover ADR's superseded markers exist. The rewrite contract's `execute` and `claude-code-plugin` capabilities and the two `rewrite-verification.md` rows describe the #538 behavior, and `node scripts/verify-current-specs.mjs` passes (FR13). These were committed with the spec amendment
- `CHANGELOG.md` `[Unreleased]` gains bullets ending with `(#538)`, including a breaking-change bullet saying that `NMG_SDLC_AUTOPILOT` is removed and that interactive commands run only in the TUI

### T010: Test the controller, supervisor, lease and shared modules

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-execute-supervisor.test.mjs`, `scripts/__tests__/sdlc-controller-lease.test.mjs`, `scripts/__tests__/sdlc-models.test.mjs`, `scripts/__tests__/execute-host.test.mjs`, `scripts/__tests__/sdlc-prompt-snippets.test.mjs`, `scripts/__tests__/execute-safe-remediation-contract.test.mjs`
**Type**: Create | Modify
**Depends**: T001, T002, T003
**Acceptance**:
- The fixture's fake `host` replaces the fake Herdr, and a `run` spy records zero `herdr` invocations across every `runExecute` test (AC1)
- AC2:
  - spawn requests carry each entry's model and effort;
  - a repairable failure's redispatch uses `repair`, and an exempt reason does not;
  - `default` effort yields `effort: null`;
  - `opencode-go/kimi-k3.1-pro`, `opus[1m]` and `claude-opus-5-5` pass `validateHostRequest`.
- AC3: an invalid file exits 2 with the diagnostic, with zero spawn requests and zero `git`/`gh` calls; an absent file warns exactly once
- AC4: with a fake clock, check-ins report `interval`, `activity_unchanged` and `waiting_marker_stale` with an `activity` object and no `paneTail`
- AC5: `prompt` writes one append request with the guidance, and the stage completes on the next fresh handoff
- AC6: `redispatch` writes a stop request before the replacement spawn request. `halt` writes a stop request, exits non-zero, and leaves the branch head, the worktree status and the remote ref unchanged
- AC8: `parseArgs(['--retain-worker', '#1'])` throws a usage error naming `--retain-worker`; `goal` with it returns `ok: false`; `--check-in-seconds 60` parses
- AC12: a denied spawn response yields a non-zero result containing `worker_start_refused` and the reason, with no deliver dispatch
- Supervisor tests:
  - `supervise` prints the session line;
  - `wait` returns `NMG_SDLC_EXECUTE_WORKER`;
  - a stale `host.json` halts with `supervising session ended`;
  - the terminal result writes the session-id record (AC7).
- Lease tests cover reclaim with a dead pid plus a stale or absent heartbeat, and refusal with a fresh one
- `cd scripts && npm test` exits 0

### T011: Test the hooks module

**File(s)**: `hooks/register.test.ts`, `scripts/__tests__/plugin-commands.test.mjs`, `scripts/__tests__/execute-goal.test.mjs`, `scripts/__tests__/sdlc-commands.test.mjs`, `scripts/__tests__/execute-host.test.mjs`
**Type**: Modify
**Depends**: T004
**Acceptance**:
- AC1, AC2, AC7: a spawn request makes the module register `execute-<entry>` (model as given, effort omitted for `null`, permission mode, agent body prompt) and spawn `nmg-sdlc:execute-<entry>` with no `--plugin-dir` or process launch. The response holds the agentId, and that worker's `turn.step` carries the model and effort
- AC4: worker tool calls and steps update the agent file, and an undelivered report is submitted once after main-loop idleness
- AC5: an append request calls `$.session.append` with the agentId; a denied append falls back to `$.session.send`
- AC6: a stop request calls `TaskStop` with the agentId, the response reports `killed`, and a later tool call from that agent is denied
- AC7: headless `/sdlc-execute #1` answers `{}` with no refusal and submits the workflow text once, as the user, from the timer. `/sdlc-execute --result` answers the recorded lines with the recorded `exitCode`, or exit 2 when no record exists
- AC8: the execute argument hint omits `--retain-worker`
- AC9:
  - with and without `NMG_SDLC_AUTOPILOT=1`, headless `/sdlc-draft-issue` returns `Run /sdlc-draft-issue in the TUI.` with exit 2 and no render or submit;
  - with `NMG_SDLC_AUTOPILOT=1`, `ExitPlanMode` and `AskUserQuestion` permission requests fall through to the host, except the write-spec Finished approval;
  - the autopilot test blocks in `sdlc-commands.test.mjs` and `execute-host.test.mjs` are removed.
- AC12: a denied spawn and a missing agent file each produce `{ ok: false, deny }`
- No Herdr toast is shown; `plugin-commands.test.mjs` static assertions match the new source. `cd scripts && npm test` exits 0, including `claude plugin test` when `claude` is installed

### T012: Test the smoke gate without Herdr

**File(s)**: `scripts/__tests__/nmg-sdlc-smoke.test.mjs`
**Type**: Modify
**Depends**: T007
**Acceptance**:
- AC10: with a valid record for an open, `spec-created` issue with a merged spec PR, the provider delivers that issue. No recorded call runs `/sdlc-draft-issue` or `/sdlc-write-spec`, and none sets `NMG_SDLC_AUTOPILOT`
- AC10: a missing record, an unparsable record, a wrong `repo`, a closed issue, a missing label, an unmerged spec PR, a foreign author, and an issue another outer request already delivered each fail with `nmg-sdlc-smoke smoke issue not provisioned` and name the reason. A recorded issue in the same outer request's terminal recovery still passes through the existing recovery path
- AC10: `NMG_SDLC_SMOKE_ISSUES` takes priority over a present record
- AC10: delivery is `claude -p --session-id <uuid> --plugin-dir <root> --model opus --permission-mode <mode> "/sdlc-execute #N"` in the delivery clone with the ownership env, and the status comes from the result record
- No `herdr` command appears among the recorded calls, and the gate passes without `HERDR_*` env. The existing exact-head merged-PR and closed-issue pass and fail cases still hold
- `cd scripts && npm test` exits 0

### T013: Test the upgrade sentence and the Herdr removal

**File(s)**: `scripts/__tests__/sdlc-upgrade.test.mjs`, `scripts/__tests__/contribution-guide-contract.test.mjs`, `scripts/__tests__/upgrade-v4-host-language-contract.test.mjs`, `scripts/__tests__/steering-contract.test.mjs`, `scripts/__tests__/herdr-removal.test.mjs`
**Type**: Create | Modify
**Depends**: T005, T008, T009
**Acceptance**:
- AC11: a temp `CONTRIBUTING.md` holding the v4 sentence twice and other text gets both replaced with the subagent sentence, and every other byte is unchanged. A v3 file converges to the same text. A second detection reports no item; a symlinked file fails closed
- FR5, FR10: `herdr-removal.test.mjs` asserts that the following contain no `herdr` text:
  - runtime code (`scripts/*.mjs` other than the upgrade detector constants, `src/*.mjs`, `hooks/register.ts`, `steering/extensions/*.mjs`);
  - `workflows/execute/WORKFLOW.md`;
  - `agents/*.md`.
- It also asserts that README, `CONTRIBUTING.md`, `CLAUDE.md`, `references/claude-code-tooling.md`, `references/contribution-guide.md` and the steering snippets name no `HERDR_` variable or `herdr pane|agent|integration` command, and that README names `--session-id` and `/sdlc-execute --result`
- AC9: it asserts that no runtime file (`hooks/register.ts`, `src/*.mjs`, `scripts/*.mjs`, `steering/extensions/*.mjs`), workflow, `references/interactive-gates.md`, README, `CLAUDE.md` or `CONTRIBUTING.md` names `NMG_SDLC_AUTOPILOT`
- FR9: `steering-contract.test.mjs` asserts the agent files carry no `model` or `effort` frontmatter
- `cd scripts && npm test`, `node scripts/skill-inventory-audit.mjs --check` and `node scripts/verify-plugin-surface.mjs --root . --label repository` exit 0

### T014: Add the verify-stage smoke provisioning snippet

**File(s)**: `steering/snippets/project-smoke.md`, `steering/manifest.json`, `scripts/__tests__/steering-contract.test.mjs`
**Type**: Create | Modify
**Depends**: T007
**Acceptance**:
- `steering/snippets/project-smoke.md` carries the seven steps in design.md "Smoke provisioning": reuse, clone, draft, specify, clean up, classify failures, bound the work (AC13, FR12)
- `steering/manifest.json` registers it as `project.smoke` with `consumers: ["worker:verify"]`, `slot: "body"` and `order: 510` (FR12)
- `steering-contract.test.mjs` asserts all of the following (AC13, FR12):
  - the snippet is routed only to `worker:verify`;
  - it names `tmux new-session`, `tmux capture-pane`, `/sdlc-draft-issue`, `/sdlc-write-spec`, `.nmg-sdlc/smoke/provisioned.json` and the environmental-versus-defect classification;
  - the rendered verify worker prompt for this repository contains it, and the rendered implement and deliver prompts do not.
- `node scripts/verify-plugin-surface.mjs --root . --label repository` and `cd scripts && npm test` exit 0

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #538 | 2026-11-08 | Initial feature tasks |
| #538 | 2026-11-08 | Amendment: T004, T007, T009, T011, T012 and T013 drop autopilot and headless interactive runs; T007 and T012 make the provider deliver the recorded issue; T014 adds the verify-stage provisioning snippet |
