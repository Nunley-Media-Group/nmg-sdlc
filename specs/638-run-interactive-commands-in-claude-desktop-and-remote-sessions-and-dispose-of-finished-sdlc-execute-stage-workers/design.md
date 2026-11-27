# Design: Run interactive commands in Claude Desktop and remote sessions, and dispose of finished /sdlc-execute stage workers

**Issue**: #638
**Date**: 2026-11-27
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/491-make-the-sdlc-execute-session-an-opus-supervisor-that-inspects-and-steers-every-worker-stage/

## Overview

Two independent changes. The hooks module's interactive-command gate reads only the surface roster at command time. The execute controller stops every stage worker after its stage, sweeps any remaining worker at run end, and reports a stop it cannot confirm. Documentation, `CLAUDE.md`, and product steering state the Desktop-and-CLI rule, and tests enforce it.

## Architecture

### Interactive-command gate (`hooks/register.ts`, `runInteractive`)

- Read `const surfaces = await $.session.surfaces()` once per run. `noSurface = surfaces.length === 0`.
- Refuse a non-execute command only when `noSurface`: `{ text: interactiveHeadlessMessage(name).trimEnd(), exitCode: 2 }` (text and exit code unchanged).
- `headlessRun` keeps its current value, `!interactive || noSurface`. Only `/sdlc-execute` reads it (headless hold notice, awaited goal), so execute behavior does not change on any surface.
- Pasted interactive commands already route through `runInteractive`, so they take the same gate.

### Surface-aware UI (`hooks/register.ts`)

The module shows UI only through `$.ui.toast` and `$.ui.log`. The host draws a toast on every surface: a floating toast, or one notification-bar line where the transcript is printed to scrollback. So no roster branch is needed today. A future call to any other `$.ui` member must branch on `$.session.surfaces()` and fall back to `toast`, `log`, or plain command text on a `terminal`-only roster. The AC8 test fails on any other `$.ui` member, so whoever adds one also adds its roster-aware fallback and test.

### Stage-worker disposal (`scripts/sdlc-execute.mjs`, `runExecute`)

- `spawned`: a `Map<agentId, { attempts, confirmed }>` filled after each `host.spawn`.
- `dispose(agentId)`: up to two `host.stop(agentId)` attempts in a row, each counted in `attempts`. The first success sets `confirmed: true`. If both attempts throw (`worker_stop_failed`, `supervising_session_lost`, or any other error), it rethrows the last error.
- Directly after the `host.finish()` that follows `superviseWorker` / `awaitWorkerHandoff`, call `dispose(agentId)` for every outcome: accept, no handoff, `redispatch`, and `halt`. This replaces the existing `redispatch`/`halt`-only `host.stop` call. It runs before the `supervisor_halt` throw and before any `continue` that leads to the next spawn. An unconfirmed stop therefore fails the run with `worker_stop_failed`, and no second worker starts while the first may still be active.
- Run-end sweep `settleWorkers(result)`, applied to the result at the success return and the catch return of `runExecute`. For each spawned worker that is not confirmed and has fewer than two attempts, it calls `host.stop` until the worker is confirmed or has two attempts. Errors are caught here. For each worker still not confirmed, it appends `stage worker <agentId>: stop not confirmed` as its own line to `result.stdout`.
- `host.stop` → hooks module `stopWorker` is unchanged. It sets `stopped: true` on the agent record and confirms through `$.agent.list()`. It runs the same way on every roster, because the bridge services requests whatever the roster.

### Recorded result (`scripts/sdlc-execute-supervisor.mjs`, `resultLines`)

`resultLines(result)` adds every line of `result.stdout` matching `/^stage worker \S+: stop not confirmed$/` after its existing lines, on both branches: after the `MERGED and CLOSED` lines (status 0), and after the single `/sdlc-execute stopped:` line (non-zero). `writeResultRecord` and `/sdlc-execute --result` then show them.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `runInteractive` (hooks) | command name, args | refusal only when `surfaces()` is empty | `isInteractive` no longer gates interactive commands |
| `runExecute` result | — | `stdout` may contain `stage worker <id>: stop not confirmed` lines | every spawned worker is stopped at its stage and swept at run end |
| `resultLines` | controller result | adds stop-unconfirmed lines | recorded run result names each unconfirmed worker |

## State and UI Behavior

- Desktop / remote / mixed roster: interactive commands render, run `/plan`, and submit the workflow as the person's prompt.
- Empty roster: the unchanged refusal, exit 2.
- After each stage, its worker's agent record has `stopped: true`, and its later tool calls are denied by the existing `stopped` set.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Gate on `surfaces()` only | Selected | A Desktop or remote client can attach after `session.start`; the roster at command time is authoritative |
| Also drop `isInteractive` from `headlessRun` | Rejected | It would change execute's hold and goal behavior in Desktop, which is out of scope |
| Continue past an unconfirmed stop on a normal advance | Rejected | A still-active worker could keep committing in the same worktree while the next stage runs; failing closed matches the existing redispatch/halt behavior |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #638 | 2026-11-27 | Initial feature design |
