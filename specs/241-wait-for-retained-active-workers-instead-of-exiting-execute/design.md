# Root Cause Analysis: Wait for retained active workers instead of exiting execute

**Issue**: #241
**Date**: 2026-08-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/219-harden-execute-against-transient-herdr-lifecycle-races/

---

## Root Cause

`runExecute` in `scripts/sdlc-execute.mjs` snapshots `existingAgents` once via `firstAgentList(herdrApi.listAgents())` and, per issue, takes the first name starting with `s${issue}-` as `live`. The live-worker branch continues only when all of these are true: `nextStep(runState.completed[String(issue)])` is still a step, `agentName === \`s${issue}-${step}\``, `agentState(herdrApi.agentGet(agentName))` is `idle` or `done`, and `paneId` (from `live.pane_id ?? live.paneId ?? 'unknown'`) is not `'unknown'`.

Every other live-worker case takes the `else` that pushes `Existing worker ${agentName} in pane ${paneId}; no second worker started.` and returns `{ status: 0, stdout, stderr: '' }`. That includes:

- an active matching worker such as `s236-fix2` / `s42-verify` in `working` or `blocked`
- a live name that does not match the persisted current step (for example `s42-verify` while `nextStep` is `start`)
- a live worker whose pane id resolved to `unknown`

The same `runExecute` already waits for workers it just started: `waitForWorkerSettlement` (`herdr.agentWait({ name, until: 'working' })` then `herdr.agentWait({ name })`) and the new-worker `state === 'working'` path (`herdrApi.agentWait({ name: agentName })` with no `--until` and no timeout). `defaultHerdr.agentWait` maps to `herdr agent wait <name> [--until …]` with no shorter timeout. The retained-active `else` never waits and never calls `stopResult`, so `run.json` is not marked failed and the stop notification is not required.

Idle or done workers that already have a valid passed, non-intervention handoff can still advance. That path stays. The defect is the active/blocked/unsettled/mismatched retained-worker success return.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-execute.mjs` | `runExecute` live-worker `if (live)` / `else` that returns status 0 with `no second worker started` | Abandons the queue instead of waiting or failing closed |
| `scripts/sdlc-execute.mjs` | `waitForWorkerSettlement`, `defaultHerdr.agentWait` | Existing blocking wait used for newly started workers; reuse, do not add a new exported helper |
| `scripts/sdlc-execute.mjs` | `stopResult` | Existing fail-closed persist + notify + status 1; reuse for mismatch, unknown pane, and wait failure |
| `scripts/sdlc-execute.mjs` | live idle/done handoff + remediation block immediately above the `else` | Already implements passed-advance and fail-closed handoff evaluation |
| `scripts/__tests__/sdlc-execute.test.mjs` | `does not start a second worker when an issue worker is live`; `keeps an active failed verification worker open` | Currently lock the premature status-0 return |

### Triggering Conditions

- `listAgents` reports a live `s<N>-*` agent for the current issue.
- That worker is not (matching current step **and** idle/done **and** known pane).
- Focused tests expected status 0 plus `no second worker started` for a working `s42-verify` while `nextStep` is `start`, and for a working retained `s42-verify` during failed-verify remediation.

---

## Fix Strategy

### Approach

Delete the live-worker `else` that returns `{ status: 0 }` with `Existing worker …; no second worker started.` Do not keep that string as a successful exit. Do not add a new exported wait helper, poll loop, `setTimeout`/`setInterval`, or `agentWait` timeout argument.

After `live` is resolved, apply this exact branch order inside `runExecute` (reuse existing `stopResult`, `waitForWorkerSettlement`, `validateHandoff`, remediation, and pane-close logic; do not duplicate handoff evaluation):

1. If `!step` or `agentName !== \`s${issue}-${step}\``: `return stopResult({ issue, step: step || runState.currentStep || 'start', paneId, agentName, reasonCode: 'retained_worker_mismatch', runState, cwd, herdr: herdrApi, output })`. Do not start a second worker.
2. If `paneId === 'unknown'`: `return stopResult({ … reasonCode: 'unknown_pane' })`. Do not wait and do not start a second worker.
3. If `state` is not `idle` or `done`:
   - If `state === 'working'`: call `herdrApi.agentWait({ name: agentName })` with no `until` and no timeout (same as the new-worker `state === 'working'` wait). If `!commandSucceeded(...)`, `return stopResult({ … reasonCode: 'worker_failed' })`.
   - Else (`blocked`, empty, or any other non-idle/non-done state): call existing `waitForWorkerSettlement(herdrApi, agentName)`. If it returns false, `return stopResult({ … reasonCode: 'worker_failed' })`.
   - Then `state = agentState(herdrApi.agentGet(agentName))`.
4. Fall through into the existing matching idle/done handoff / remediation block that already: validates `.omp/sdlc/handoffs/<N>-<step>.json`; applies `remediationCompletedSteps` when `runState.failed` matches this issue/step; closes the retained pane only after a passed non-intervention handoff or a valid remediation; marks the step complete; writes run state; and continues `while (step)`. If the worker is still not idle/done after the wait, that existing `!['idle', 'done'].includes(state)` `stopResult` applies (`reasonCode` remains `state || 'worker_failed'` or the handoff reason).

Do not change: `validateHandoff`, handoff schema, worker names, `HERDR_*` / omp / `gh auth` / dirty-tree / spec-created / approval / dependency preflight, review-menu `review_failed` returns, stall-recovery `agent_prompt_stalled` returns, serial `syncAndDeleteIssueBranch` merge-and-close before the next issue, or orchestrator mutation bounds.

Idle/done matching workers with a known pane skip step 3 and keep today’s continuation. New-worker waits stay unchanged.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-execute.mjs` | Replace the live-worker status-0 `else` with the branch order above | Root cause: success return skips wait and `stopResult` |
| `scripts/__tests__/sdlc-execute.test.mjs` | Rewrite the two status-0 live-worker tests; add wait-and-continue, name-mismatch, wait-failure, and unknown-pane cases as specified in tasks.md | AC10 / the tests that currently lock the bug |

### Blast Radius

- **Direct impact**: `runExecute` live-worker branch for every queue step (`start` through `deliver`) on both explicit-args and resumed-run queues.
- **Indirect impact**: existing retained idle/done resume tests; failed-verify remediation tests that currently use `state: 'working'` to force the status-0 else; later-issue serial tests.
- **Risk level**: Medium. Wait now blocks the controller for retained active workers the same way it already blocks for new workers. Fail-closed mismatch is new behavior for a live worker whose name is not the current step.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Idle/done passed retained workers start waiting until `working` and hang | Low | Step 3 runs only when state is not idle/done |
| Name-mismatched live worker is waited on or a second worker starts | Low | Step 1 `stopResult` `retained_worker_mismatch` before wait |
| Failed/intervention handoff after wait is treated as success | Low | Existing post-wait handoff predicate is unchanged |
| Tight poll or shorter timeout is introduced | Low | Reuse `agentWait` / `waitForWorkerSettlement` only; tests assert wait calls have no `timeout` key |
| Serial next-issue start happens before merge+close | Low | Do not touch `syncAndDeleteIssueBranch` |
| Default fixture `agentWait` overwrites a failed verify handoff during the working-retained test | Med | That test must override `agentWait` so it settles without rewriting `42-verify.json` |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Keep the status-0 return but document a manual reinvoke | Operator re-runs `/sdlc-execute` | Violates AC2 / FR3: the command remains responsible |
| `waitForWorkerSettlement` for every non-idle state, including `working` | Extra `until: 'working'` wait | New-worker `working` path already uses bare `agentWait({ name })`; match that |
| New exported helper or poll loop | Custom settlement watcher | Equivalent wait already exists; issue forbids busy-spinning |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)
