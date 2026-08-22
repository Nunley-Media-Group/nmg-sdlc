# Root Cause Analysis: Honor passed worker handoff after prompt wait failure

**Issue**: #216
**Date**: 2026-08-22
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

---

## Root Cause

`runExecute` in `scripts/sdlc-execute.mjs` launches a sibling `--kind omp` worker, then waits via `herdrApi.agentPrompt({ name, prompt })`, which is `herdr agent prompt <name> <prompt> --wait`. After a stall recovery it may replace that result with `herdrApi.agentWait({ name })` (`herdr agent wait <name>` with no `--until`).

The next statement is an early return: if `!commandSucceeded(prompted)` (`status` is present and not `0`), execute calls `stopResult({ reasonCode: 'worker_failed' })`. That return happens before `agentGet`, before `validateHandoff` on `.omp/sdlc/handoffs/<N>-<step>.json`, and before the existing success predicate (`idle`/`done` + `status === 'passed'` + `intervention === false` + matching `issue`/`step`). A worker that already wrote a valid passed handoff and settled idle/done is therefore recorded as `worker_failed` whenever the wait command itself is non-success.

The live-worker resume path already treats that same predicate as success. The new-worker path does not. Closing the leftover pane and re-running execute deletes the successful handoff at `rmSync(handoffPath)` before relaunch; that recovery hole is out of scope.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-execute.mjs` | `runExecute` post-wait block: `if (!commandSucceeded(prompted)) return stopResult({ reasonCode: 'worker_failed' })` | Treats wait-command status as the worker outcome |
| `scripts/sdlc-execute.mjs` | `defaultHerdr.agentPrompt` / `agentWait` | Maps to `herdr agent prompt … --wait` and `herdr agent wait` |
| `scripts/sdlc-execute.mjs` | `runExecute` handoff evaluation immediately after that early return | Already implements the authoritative success/fail-closed predicate |
| `scripts/sdlc-execute.mjs` | live `s<N>-<step>` resume path | Already honors a passed idle/done handoff on re-entry |

### Triggering Conditions

- The worker wrote `.omp/sdlc/handoffs/<N>-<step>.json` as a valid passed, non-intervention handoff matching issue `N` and the current step.
- The worker settled `idle` or `done`.
- `herdr agent prompt … --wait`, or the stall-recovery `herdr agent wait` with no `--until`, returned a non-success status after that handoff existed.
- Tests previously asserted wait success (`status: 0`) whenever a passed handoff was written, so the wait-failure-plus-passed-handoff pairing was unexercised.

---

## Fix Strategy

### Approach

Delete the early `if (!commandSucceeded(prompted)) { return stopResult({ reasonCode: 'worker_failed' }) }` block in `runExecute` after the worker prompt / stall-recovery wait. Do not replace it with another wait-status gate. Fall through to the existing `agentGet` + `validateHandoff` + issue/step match + idle/done + passed + `!intervention` checks that already follow that block.

Do not extract a new exported helper. Do not change `stopResult`, the notification sentence, `validateHandoff`, start-issue, handoff schema, review-menu `review_failed` returns, or the stall-recovery `agent_prompt_stalled` returns that fire before the worker has finished. Do not persist or print the raw Herdr wait error.

When wait is non-success and the handoff is missing, the existing catch already persists `missing_handoff` rather than `worker_failed`. That satisfies AC2 (fail closed, pane open, same stop sentence). Do not keep a special `worker_failed` reason solely for wait-command status.

FR3 remains the existing live-worker resume path: if `listAgents` still shows idle/done `s<N>-start` with a matching passed non-intervention handoff, mark `start` complete, close that pane, and do not start a second `s<N>-start`.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-execute.mjs` | Remove the post-wait `commandSucceeded(prompted)` → `worker_failed` early return in `runExecute` | Makes the on-disk handoff plus idle/done state authoritative |
| `scripts/__tests__/sdlc-execute.test.mjs` | Add a start-step fixture where `agentPrompt` writes a valid passed `42-start.json` then returns `{ status: 1 }`, with `agentGet` reporting idle or done; assert no `worker_failed`, `completed['42']` includes `start`, the created pane closes, and implement starts | AC1 / FR1 |
| `scripts/__tests__/sdlc-execute.test.mjs` | Add a start-step fixture where `agentPrompt` returns `{ status: 1 }` without writing a matching passed handoff, or `agentGet` reports a non-idle/non-done state; assert status `1`, pane left open, failed run record, and the exact stop sentence | AC2 / FR2 |

### Blast Radius

- **Direct impact**: `runExecute` new-worker completion after `agentPrompt` / stall-recovery `agentWait` for every queue step (`start` through `deliver`), not start-only. The wait/handoff block is shared.
- **Indirect impact**: existing `runExecute` tests; live resume path; review-menu failure path (must stay `review_failed`).
- **Risk level**: Low. The deleted gate is redundant with the checks that already follow it. Fail-closed paths keep their current reason codes except wait-failure-without-handoff, which becomes `missing_handoff`.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A wait failure with no handoff is treated as success | Low | Existing missing-handoff catch still `stopResult`s `missing_handoff` |
| A failed, blocked, or intervention handoff is treated as success because wait failed | Low | Existing `handoff.status !== 'passed' \|\| handoff.intervention` stop remains |
| A still-working worker with a stale passed handoff advances | Low | New workers `rmSync` the handoff before launch; success still requires idle/done. Stale pre-launch handoffs are already rejected by `writeHandoffs: false` + delete-on-launch |
| Review TUI wait failures start being treated as passed | Low | Review-menu failures stay on the earlier `review_failed` returns; do not touch them |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Treat any non-zero wait as success if a handoff file exists, ignoring agent state | Skip `agentGet` | Violates AC2 / FR2: non-idle/non-done workers must fail closed |
| Persist the Herdr wait stderr onto `run.json` while still succeeding | Extra diagnostics | Out of scope; issue does not require printing the raw Herdr error |
| Start-only special case | Gate the fall-through on `step === 'start'` | The wait/handoff block is shared; a start-only patch would leave implement/review/verify/deliver with the same bug |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)
