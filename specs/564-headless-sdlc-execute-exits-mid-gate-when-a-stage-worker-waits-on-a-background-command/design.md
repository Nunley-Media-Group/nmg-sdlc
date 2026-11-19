# Root Cause Analysis: Headless /sdlc-execute exits mid-gate when a stage worker waits on a background command

**Issue**: #564
**Date**: 2026-11-18
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/550-stop-the-sdlc-execute-controller-busy-waiting-while-a-stage-worker-waits-on-a-background-command/

## Root Cause

There are three independent defects.

1. **Nothing keeps a headless session alive.** While `worker.json` exists, `awaitSession` (`scripts/sdlc-execute-supervisor.mjs`) returns `NMG_SDLC_EXECUTE_WORKER` immediately, and the workflow then ends the main turn. In the TUI, the session stays open, and the hooks module's 1 s bridge tick resumes it with `$.prompt.submit`. Under `claude -p`, a main turn that ends with no subagent turn running ends the process, even while the worker's backgrounded command still runs. `hooks/register.ts` has no `classic.Stop` handler, so it cannot keep the run going. The `Headless runs` claim in `workflows/execute/WORKFLOW.md` that the run "keeps its process alive until the controller finishes" has no code behind it.
2. **The detached daemon never notices that its session is gone.** The daemon and the controller are spawned `detached: true`. After the first yield, losing the socket is ignored on purpose. The session heartbeat (`host.json`, written every 15 s by the hooks module, stale after `HOST_HEARTBEAT_MS`) is checked only inside `fileSupervisor` decision waits and `createFileHost` requests. A controller in the merge-queue wait or a synchronous step, and its daemon, therefore outlive the session. They keep `.nmg-sdlc/controller.lock` and the merge-queue entry, and `reclaimStaleControllerLease` refuses those while the pid is alive.
3. **A cut-off gate is treated as a failed gate.** `currentGateFailure` (`scripts/sdlc-execute.mjs`) returns a failure for any non-null ceiling, including `Incomplete`. It ignores `inspectVerificationArtifactRepair`'s `status: 'intervention'`, `reasonCode: 'no_local_validation_failure'`, and empty `failedLocal`. On resume, the controller records that failure and sets `needsImplement`. It also runs `revertPreparedVersion`, which pushes `Revert "feat: deliver issue #N"`. That revert subject fails `validImplementationSubject`, which gives `publication_subject_unproven` and then `supervisor_halt`.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `hooks/register.ts` | `turn.complete` main-loop branch; `headlessRun`; bridge tick | Headless run ends while a worker waits |
| `scripts/sdlc-execute-supervisor.mjs` | `awaitSession`, `runSupervisor`, `cleanupCancelledRun`, daemon `lost` handler | Early return on a live worker; no session-loss watchdog after yield |
| `scripts/sdlc-execute.mjs` | session CLI `wait` parsing; `currentGateFailure`; resume routing around `liveFailure` / `needsImplement` / `revertPreparedVersion` | Holding wait flag; cut-off gate classification |
| `src/execute-host.mjs` | `checkInNotice`, `heartbeatFresh`, `HOST_HEARTBEAT_MS` | Notice text and heartbeat staleness reused by the fix |
| `scripts/sdlc-shared-state.mjs` | `leaveMergeQueue` | Removes the orphaned controller's queue entry |
| `workflows/execute/WORKFLOW.md` | `Subagent turns`, `Headless runs` | Documented headless contract |

## Fix Strategy

1. **Hold notice in headless runs (AC1).**
   - Register `on('classic.Stop', …)` in `hooks/register.ts`. It acts only when all of these hold:
     - the run is headless (`headlessRun`);
     - the stop is the main loop's (`classic.Stop` does not fire for subagents);
     - an execute session exists whose `daemon.json` pid is alive;
     - no terminal result is recorded.
   - In that case it returns `{ block: headlessHoldNotice({ session, after, pluginRoot }) }`. `after` is the session's highest decided report sequence. In every other case it returns `next(e)` unchanged.
   - `headlessHoldNotice` is a new Node-free helper in `src/execute-host.mjs`, next to `checkInNotice`. It prints the exact `node "<plugin-root>/scripts/sdlc-execute.mjs" wait --session <id> --after <seq> --hold` command.
   - `awaitSession({ hold: true })` skips the `worker.json` early return. It still returns on a pending report, the terminal result, daemon loss (`controller_supervisor_lost`), or the existing `MAX_SESSION_WAIT_MS` deadline (running output).
   - The blocked stop keeps a foreground `Bash` call running, so `claude -p` stays alive. Each report or deadline return starts the normal supervision step. The TUI path is unchanged.
2. **Session-loss watchdog (AC2).**
   - Once `runSupervisor` has yielded, it checks `host.json` on the `fileSupervisor` heartbeat cadence (15 s), using `heartbeatFresh`.
   - The watchdog arms only after a fresh heartbeat has been seen for the session. When the heartbeat goes stale, it raises the existing cancellation with reason `supervising_session_lost`.
   - The existing path terminates the controller process group and calls `cleanupCancelledRun`, which releases the lease.
   - `cleanupCancelledRun` also removes the merge-queue entries whose pid is the controller's, through `leaveMergeQueue` under the queue lock.
   - The daemon writes the terminal result `/sdlc-execute stopped: supervising_session_lost`.
   - A later `/sdlc-execute #N` acquires the released lease and resumes from branch evidence.
3. **Cut-off gate reruns the gate (AC3).**
   - `currentGateFailure` classifies an artifact as cut off when the inspection result has `failedLocal` empty and `incomplete` non-empty, and no required check is `failed`. For a cut-off artifact it returns `{ rerunGate: true, head }` instead of a failure.
   - Resume routing treats `rerunGate` as a gate dispatch: `step = 'verify'` at the reviewed head through the existing gate path, which reuses the already prepared version. It calls neither `recordFailure` nor `revertPreparedVersion`, and leaves `needsImplement` unset.
   - A gate with any `failed` required check keeps its existing route.
4. **Workflow text (FR5).**
   - `Subagent turns` gains the instruction to run a hooks-module hold notice's command as printed.
   - `Headless runs` states that the hooks module keeps the session alive by blocking the main loop's stop until the controller records its result.

## Blast Radius

- Headless `/sdlc-execute` turn ends only. TUI sessions, interactive commands, and stage subagents never reach the Stop branch.
- The daemon watchdog runs only after the run yields. Pre-yield socket supervision is unchanged. A session that never wrote a heartbeat never arms the watchdog.
- Resume routing changes only for artifacts with no `failed` required check. Existing `Fail` routing, the post-verify `needsImplement` path, and gate-intent handling are unchanged.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Block the Stop hook and let the host re-prompt with no holding command | Rejected | It would spin turns with nothing to wait on |
| Keep the daemon attached to the invoking process | Rejected | The TUI relies on the daemon outliving each yielded turn |
| Have the controller check the heartbeat at every loop point | Rejected | Synchronous steps and the queue wait would each need checks; a daemon-level watchdog covers them all through the existing cancellation path |
| Hooks-module Stop block with a holding `wait`, a daemon heartbeat watchdog, and cut-off gate classification | Selected | Each fixes one root cause using existing notice, heartbeat, cancellation, and gate-dispatch paths |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #564 | 2026-11-18 | Initial defect design |
