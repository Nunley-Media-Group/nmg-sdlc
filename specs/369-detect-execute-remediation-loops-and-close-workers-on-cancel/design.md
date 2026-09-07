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
| Cancel or invoking job loss | Stop only owned controller processes; close all recorded owned panes, including pending/activating prompts; preserve files and latest subordinate checkpoint changes |
| Cancel/stop with --retain-worker | Keep owned worker pane and identity; still record cancellation/stop |

## Ownership and recovery

Use existing projectRoot, runId, issue, step, name, paneId, revision, and controller lease identity. Never close a foreign worker based only on its name. Read the latest checkpoint before cancellation, compare exact controller lease ownership, and preserve CAS safety. Do not drop an owned record before a failed startup or failed close has been handled. Close failures retain ownership and diagnostic evidence rather than claiming successful cleanup. A live remediation must satisfy the same ownership boundary as a normal retained worker.

Legacy active remediation attempt N represents up to N-1 completed remediations; recover existing no-progress streaks conservatively rather than giving attempt thirteen a fresh allowance. Completion and currentStep remain the progress authority, not commit churn. Existing approved earlier-step repair remains available for non-intervention failures, but blocked/intervention evidence is not permission to rewind.

## Files and interfaces

- scripts/sdlc-execute.mjs: progress checks, sticky stop/resume transitions, ownership-preserving startup cleanup, signal cleanup, and CLI delegation.
- scripts/sdlc-execute-supervisor.mjs: asynchronous job-lifetime supervision and cancellation with explicit child argv, IPC, no shell, and owned process-group cleanup.
- scripts/__tests__/sdlc-execute.test.mjs: stage progression, no-progress boundaries, blocked/intervention resume, startup cleanup, foreign ownership, retain semantics.
- scripts/__tests__/sdlc-execute-supervisor.test.mjs: real child-process signals and parent loss while the controller blocks, with isolated fake external commands rather than a mocked event emitter as sole proof.
- README.md and CHANGELOG.md: public stop/cancel behavior and pending release evidence.

## Verification

Regression tests must fail before the repair and pass after it. Exercise all seven remediable stages at the shared no-progress boundary, successful first/second recovery, unchanged resume, and ownership isolation. Run the real CLI and cancel it during a blocking external wait; inspect persisted cancellation and actual worker closure. Verify SIGINT, SIGTERM, invoking-process loss, and --retain-worker. Run registered repository tests, plugin-surface validation, and real consumer-project delivery through exact-head merge and issue closure. Do not infer live Herdr cleanup from mocked paneClose calls alone.

## Steering alignment

Product: preserve autonomous spec-to-merge delivery and truthful evidence. Technical: Node ESM, explicit argument arrays, no workflow deadlines, exact owned process groups, and version mirror synchronization. Structure: controller behavior remains in scripts; no new workflow or public command surface.
