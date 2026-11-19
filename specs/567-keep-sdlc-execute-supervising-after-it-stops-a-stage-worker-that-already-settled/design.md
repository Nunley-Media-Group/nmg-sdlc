# Root Cause Analysis: Keep /sdlc-execute supervising after it stops a stage worker that already settled

**Issue**: #567
**Date**: 2026-11-18
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/491-make-the-sdlc-execute-session-an-opus-supervisor-that-inspects-and-steers-every-worker-stage/

## Root Cause

There are two independent defects.

1. **The stop confirmation does not recognize a settled worker.**
   - The controller calls `host.stop(agentId)` after a `redispatch` or `halt` decision (`scripts/sdlc-execute.mjs`), including after a stage report, when the worker has already settled.
   - The hooks module's `stopWorker` (`hooks/register.ts`) calls `TaskStop` and swallows any error, then reads `$.agent.list()`. It confirms only when the status is in `STOPPED_STATUSES = ['killed', 'completed', 'failed']`.
   - A settled subagent is `idle`, or has been dropped from the list. The answer is therefore `stop not confirmed … status idle|unknown`, which `createFileHost.stop` (`scripts/sdlc-execute-host.mjs`) throws as `worker_stop_failed`. That ends the controller.
2. **Binding depends on the foreground stdout of the supervise call.**
   - The hooks module starts a bridge only in its `Bash` `tool.call` handler, and only when `SESSION_LINE` matches the call's result stdout.
   - `sessionCommand` (`scripts/sdlc-execute.mjs`) generates the session id itself and prints it only when supervise exits.
   - A supervise call that the engine backgrounds has empty result stdout, so `startBridge` never runs and nothing writes `host.json`. This can happen through `backgroundedToDeliverMessage`, the 120 s default timeout, or `run_in_background`.
   - `assertAliveOrStarting` in `createFileHost` then throws `supervising_session_lost` once `HOST_HEARTBEAT_MS` passes after the first request.
   - A rerun after a crash is the likely case: the resume path can spend a long time on Git and GitHub work before its first spawn, and earlier subagent notifications are queued.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `hooks/register.ts` | `stopWorker`, `STOPPED_STATUSES` | Stop confirmation |
| `hooks/register.ts` | `Bash` `tool.call` handler, `startBridge`, `tick`, `stopBridge` | Session binding and bridge lifetime |
| `src/execute-host.mjs` | `ACTIVE_AGENT_STATUSES`, `HOST_HEARTBEAT_MS` | Shared status and heartbeat constants |
| `src/host-events.mjs` | `isExecuteSuperviseCommand` | Recognizes supervise commands |
| `scripts/sdlc-execute.mjs` | `sessionCommand` (supervise argument parsing, `randomUUID()`) | Session id source |
| `scripts/sdlc-execute-host.mjs` | `stop` | Raises `worker_stop_failed` (unchanged) |

## Fix Strategy

1. **Settled means stopped (AC1).**
   - In `stopWorker`, after `TaskStop`, return `{ ok: true }` when the listed status is `undefined` or is not in `ACTIVE_AGENT_STATUSES`. Refuse only for `pending`, `running`, or `waiting`.
   - Keep `stopped.add(agentId)` before the check, so a stopped worker's later tool calls and messages stay denied.
   - When the engine no longer lists the worker, the local agent record keeps its previous settled status rather than being overwritten with `undefined`.
   - Remove `STOPPED_STATUSES` if nothing else uses it.
2. **The hooks module owns the session id (AC2).**
   - In the `Bash` `tool.call` handler, when `isExecuteSuperviseCommand(command)` is true, generate a UUID with `crypto.randomUUID()` (a host global, so no Node import is needed).
   - Append ` --session <uuid>` to the supervise command's arguments, at the same point where `<plugin-root>` is rewritten, and call `startBridge($, uuid)` before `next(e)`.
   - Keep the existing `SESSION_LINE` parse after the call as a consistency check: when a line is present and names a different session, start the bridge for the printed one.
   - `sessionCommand` parses `--session`. It rejects a non-UUID with `invalid_session_id` and an already existing session directory with `session_exists`, and otherwise uses the value in place of `randomUUID()`.
3. **A bridge waits for its directory (AC2).**
   - `startBridge` records `startedAt`.
   - `tick` treats a missing session directory as "not started yet" while `now - startedAt <= HOST_HEARTBEAT_MS`. During that window it skips heartbeat writes, so it never creates the directory itself.
   - A directory still missing after that window, a terminal `result.json`, or replacement by a newer session stops the bridge.
   - Once the directory exists, the first tick writes `host.json` immediately.

## Blast Radius

- The stop change affects only workers that have already settled. Refusing a still-active worker is unchanged, so `worker_stop_failed` remains for a genuinely live worker.
- Session binding changes only for supervise commands that run through the hooks module. A supervise run without `--session` keeps generating its own id, and a foreground run still prints the same session line.
- The test fake responder in `scripts/__tests__/sdlc-execute-supervisor.test.mjs` scans session directories and is unaffected.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Have the controller skip `host.stop` when its own record shows the worker settled | Rejected | The local record and the engine can disagree; the hooks module is where the engine status is read |
| Have the hooks module find unbridged sessions through `daemon.json` after a backgrounded result | Rejected | A call backgrounded at the 120 s timeout returns after the 60 s first-heartbeat grace period has expired |
| Hooks module assigns the session id and starts the bridge before supervise runs; settled workers count as stopped | Selected | It removes the timing dependency entirely and fixes each root cause where it occurs |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #567 | 2026-11-18 | Initial defect design |
