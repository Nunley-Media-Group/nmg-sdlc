# Design: /sdlc-execute: stop losing time to idle workers, restarts and truncated gate evidence

**Issue**: #546
**Date**: 2026-11-13
**Status**: Approved
**Author**: Claude Code (write-spec)
**Related Spec**: specs/538-replace-herdr-panes-with-hooks-module-subagents-for-sdlc-execute/

## Overview

There are four independent changes on the existing execute controller, gate runner and hooks-module bridge. Each reuses existing primitives (`host.append`, `host.wait`, `host.activity`, `waitingInfo`, `freshHandoff`, `registeredGateStatus`, `currentGateFailure`, `resultEnvelope`) and does not change the handoff schema or the supervisor decision sets.

## Architecture

### 1. Handoff before idle (`scripts/sdlc-execute.mjs`, `awaitWorkerHandoff`)

- When the worker settles without a fresh handoff and without a `.waiting` marker, deliver `reminderPrompt` through `host.append` (append, falling back to send in the hooks module) instead of `host.send` alone.
- After delivery, wait with `waitFor({ until: 'working', timeoutMs: RESUME_POLL_MS })`. Treat a status in the active set, or a `lastActivityAt` advance, as started. Then `waitFor({})` until settled and re-check `freshHandoff`.
- Return without a handoff only when delivery is refused, the worker does not start within the bound, or the second settle still has no handoff.
- Before returning, apply the commit-visibility settle:
  - Poll in `CHECK_IN_SLICE_MS` slices, with check-ins continuing, while `host.activity(agentId).background` is non-empty or `<git-dir>/index.lock` exists.
  - Resolve the git dir with `git rev-parse --git-dir`.
  - Read `headAfter` and `addedWork` after the settle.

### 2. Prompt delivery (`superviseWorker`, stage `prompt` branch)

- `guide(decision, true)` returning false sets `promptRefusal = { reasonCode: 'stage_prompt_undelivered', summary }`.
- After a delivered guide, the same start-wait as §1 runs. If the worker does not start within `RESUME_POLL_MS`, it sets `promptRefusal = { reasonCode: 'stage_prompt_not_resumed', summary }`.
- The next stage report includes `promptRefusal` and filters `prompt` out of `decisions`. This replaces the free-text `note` loop for stage reports. Check-in prompts are unchanged.

### 3. Gate intent (`scripts/sdlc-execute.mjs`)

- New helpers `writeGateIntent`, `readGateIntent` and `clearGateIntent` work on `.nmg-sdlc/execute/gate-intent/<N>.json` (`{ schemaVersion: 1, issue, head, dispatchedAt }`). Writes are atomic (tmp + rename) and reads use no-follow, like the existing `.nmg-sdlc` readers.
- The intent is written immediately before a verify spawn, including `forced === 'verify'`.
- It is cleared when the supervisor's decision on that verify stage report is `accept`, and when the gate artifact's `identity.headSha` maps to the intent head (`sourceHeadForGate`) with `generatedAt` later than `dispatchedAt`.
- In the routing loop before `currentGateFailure`, a live intent for `current.head` with no newer gate artifact sets `step = 'verify'` and skips the live-failure check. A stale intent for a different head is deleted.

### 4. Gate evidence (`src/sdlc-verification-runtime.mjs`)

- `runSteeringValidations` passes the log directory `.nmg-sdlc/verification/<N>/` in each command request.
- `commandProvider` streams stdout and stderr to `<validation-id>.log` (sections `== stdout ==` / `== stderr ==`) while it accumulates the in-memory copies.
- The new `tailBounded(value, 65536)` replaces head `bounded()` for command evidence.
- The new `extractFailures(text)` applies the FR6 patterns to the full output.
- The evidence entry becomes `{ kind: 'command', summary, artifact, headSha: request.identity.headSha, stdout, stderr, failures }`.
- The envelope summary appends `; failures: <first 10>` when `failures` is non-empty. The envelope keys are unchanged, so `validateProviderResult` still holds.
- `currentGateFailure` in `scripts/sdlc-execute.mjs` appends the failing results' extracted failures to its summary and adds the log artifacts to `artifacts`.
- The verification-record consumers (`sdlc-finalize-verification.mjs`, `pr-delivery-state.mjs`, `sdlc-recover-verification.mjs`) keep accepting the extended evidence entry.

### 5. Background activity (`hooks/register.ts`, `src/execute-host.mjs`, `scripts/sdlc-execute.mjs`)

- New `recordBackgroundStart(record, { taskId, command, at })` and `clearBackground(record, at)` in `src/execute-host.mjs`.
- The stage-worker `tool.call` handler awaits `next(e)`. When a Bash result carries `backgroundTaskId`, it calls `recordBackgroundStart`. `turn.step` after a settled status calls `clearBackground`.
- `activityRecord` adds `background: { command, elapsedSeconds } | null` (the oldest running entry).
- `checkIn` does not produce `activity_unchanged` while `record.background` is non-empty. Interval check-ins still fire.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| Stage report (`kind: 'stage'`) | — | adds `promptRefusal: { reasonCode, summary } \| null` | `prompt` omitted from `decisions` when `promptRefusal` is set |
| Check-in report `activity` | — | adds `background: { command, elapsedSeconds } \| null` | No `activity_unchanged` while background is set |
| `.nmg-sdlc/execute/gate-intent/<N>.json` | `{ schemaVersion: 1, issue, head, dispatchedAt }` | — | Restart routing to verify at an unchanged head |
| `evidence[]` command entry | — | `artifact` (log path), `headSha`, tail `stdout`/`stderr`, `failures: string[]` | Full log at `.nmg-sdlc/verification/<N>/<id>.log` |
| Agent record (`agent-<id>.json`) | — | adds `background: [{ taskId, command, startedAt }]` | Written by the hooks module for stage workers |

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Persist gate intent under `.nmg-sdlc/execute/` | Selected | Runtime state is already there and is git-ignored; it survives a controller restart |
| Restore `run.json` checkpoints | Rejected | The controller deliberately ignores `run.json` and derives state from Git, GitHub and evidence |
| Keep head-bounded stdout | Rejected | Test runners print failures and summaries at the end |
| Rely on the worker-written `.waiting` marker for background activity | Rejected | Workers may omit it; the hooks module sees `backgroundTaskId` directly |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #546 | 2026-11-13 | Initial feature design |
