# Design: Progress-bounded execute and cancellation ownership

**Issue**: #369
**Date**: 2026-09-06
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/366-route-recoverable-implementation-failures-into-repair-and-reverification/

## Overview

Keep the existing ordered lifecycle, fresh remediation worker, and validated handoff contracts. Stop a same-issue/same-step remediation streak after two completed unsuccessful remediation workers, before allocating a third. A completed step resets its streak; no elapsed-time deadline or run-wide attempt cap is introduced.

Cancellation must work while the synchronous controller is blocked in a Herdr child command. The public CLI delegates to an asynchronous, invocation-owned supervisor outside the invoking job's process group. The supervisor runs the existing synchronous controller in its own owned child process group. Signals and loss of the invoking job's IPC connection cancel the owned controller group, then close checkpoint-owned Herdr panes and persist cancellation before releasing its exact lease. The supervisor exits after its invocation; it is not a plugin service. Library callers retain the synchronous runExecute API.

## State transitions

| Observation | Transition |
|---|---|
| Settled failed non-intervention stage | Capture evidence; close original pane; launch one remediation |
| First unsuccessful remediation | Persist completed-attempt evidence; close pane; launch second remediation |
| Second unsuccessful remediation without ordered-step advancement | Persist stopped remediation and distinct remediation_loop reason; close owned panes; no third worker |
| Passed remediation | Validate stage artifacts, record completed step, clear streak, continue |
| Blocked or intervention handoff | Stop immediately, including unchanged resume; never rewrite blocked to failed |
| Resume after loop stop | Preserve stop unless validated passed evidence advances the step; do not erase history merely because the controller restarts |
| Passed delivery handoff after loop stop | Reach the existing exact-head merge, issue-closure, and checkout cleanup checks; do not return the stale loop failure or bypass delivery proof |
| Cancel or invoking job loss | Stop only owned controller processes; close all recorded owned panes, including pending/activating prompts; preserve files and latest subordinate checkpoint changes |
| Cancel/stop with --retain-worker | Keep owned worker pane and identity; still record cancellation/stop |
| Unexpected controller leader death | Terminate remaining owned descendants before closing panes or releasing the lease; retain failure ownership if cleanup fails |

## Ownership and recovery

Use existing projectRoot, runId, issue, step, name, paneId, revision, and controller lease identity. Never close a foreign worker based only on its name. Read the latest checkpoint before cancellation, compare exact controller lease ownership, and preserve CAS safety. Do not drop an owned record before a failed startup or failed close has been handled. Close failures retain ownership and diagnostic evidence rather than claiming successful cleanup. A live remediation must satisfy the same ownership boundary as a normal retained worker.

Legacy active remediation attempt N represents up to N-1 completed remediations; recover existing no-progress streaks conservatively rather than giving attempt thirteen a fresh allowance. Completion and currentStep remain the progress authority, not commit churn. Existing approved earlier-step repair remains available for non-intervention failures, but blocked/intervention evidence is not permission to rewind.

## Process-group completion

Reuse `src/process-supervision.mjs` for controller, verification, smoke, and exercise child cleanup. Normal cleanup keeps its closed/exited-leader guard to avoid signalling a reused PID or process group. Freshly observed unexpected leader loss uses an explicit owned-PGID cleanup path: on POSIX, that leader's exit does not imply its descendants are gone. Tolerate an already-gone group through the operating system's result. Observe leader exit before waiting for stream closure so a descendant holding inherited output pipes cannot prevent loss cleanup. Preserve Windows process-tree selection without claiming POSIX live evidence proves Windows execution.

After terminating the owned group, drain or close its owned streams and preserve the caller's existing success, failure, cancellation, or incomplete classification. A cleanup error remains a failure with diagnostic ownership; it is not a successful terminal cleanup. Preserve the public execute CLI's usage error status 2 through the supervision boundary.

## Canonical report scope

The scope resolver already emits stable `SCN` tags for explicitly identified scenarios and `SCENARIO:<name>` identities for untagged implicit single-issue specs. Export and reuse that scenario identity validation instead of giving readiness a narrower grammar. Named identities remain unavailable to explicit ownership manifests. Keep exact normalized scope comparisons, array uniqueness, and all evidence/publication checks. A safe report that is locally unverifiable remains unpassed and can be regenerated through bounded verification remediation; it is not automatically an external-authority intervention.

## Files and interfaces

- scripts/sdlc-execute.mjs: progress checks, sticky stop/resume transitions, ownership-preserving startup cleanup, signal cleanup, and CLI delegation.
- scripts/sdlc-execute-supervisor.mjs: asynchronous job-lifetime supervision and cancellation with explicit child argv, IPC, no shell, and owned process-group cleanup.
- scripts/__tests__/sdlc-execute.test.mjs: stage progression, no-progress boundaries, blocked/intervention resume, startup cleanup, foreign ownership, retain semantics.
- scripts/__tests__/sdlc-execute-supervisor.test.mjs: real child-process signals and parent loss while the controller blocks, with isolated fake external commands rather than a mocked event emitter as sole proof.
- src/process-supervision.mjs, src/sdlc-verification-runtime.mjs, scripts/exercise-omp.mjs, and steering/extensions/nmg-sdlc-smoke.mjs: shared owned-descendant cleanup and loss observation without descendant-held pipe hangs.
- README.md and CHANGELOG.md: public stop/cancel behavior and pending release evidence.

## Verification

Regression tests must fail before the repair and pass after it. Exercise all seven remediable stages at the shared no-progress boundary, successful first/second recovery, unchanged resume, and ownership isolation. Run the real CLI and cancel it during a blocking external wait; inspect persisted cancellation and actual worker closure. Verify SIGINT, SIGTERM, invoking-process loss, and --retain-worker. Run registered repository tests, plugin-surface validation, and real consumer-project delivery through exact-head merge and issue closure. Do not infer live Herdr cleanup from mocked paneClose calls alone.

Directly kill the controller leader while its external descendant remains active, including a descendant holding inherited output pipes. Assert that the descendant is gone and an unrelated process survives before fixture teardown. Exercise the analogous command, smoke, and RPC boundaries. Test repaired delivery loop resume through actual delivery proof validation and test invalid CLI arguments without creating a run or lease.

## Steering alignment

Product: preserve autonomous spec-to-merge delivery and truthful evidence. Technical: Node ESM, explicit argument arrays, no workflow deadlines, exact owned process groups, and version mirror synchronization. Structure: controller behavior remains in scripts; no new workflow or public command surface.
