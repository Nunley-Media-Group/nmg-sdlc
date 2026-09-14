# Root Cause Analysis: Resume consumed repaired-publication dispatch after pane split failure

**Issue**: #394
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/392-recover-repaired-publication-interventions-before-implementation/

---

## Root Cause

The #392 mutation boundary archives and consumes repaired-publication recovery before the normal worker loop allocates its standard pane. A later `paneSplit()` failure persists `pane_split_failed`, but the durable safe-recovery record and checkpoint tuple already prove the invocation consumed. Existing discovery correctly refuses to consume it again and has no distinct state for finishing that interrupted dispatch.

Consumption and dispatch therefore lack a durable handoff. The fix must not weaken one-time recovery. It must move fallible pane allocation before first consumption and make the post-consumption, pre-start interval explicit and resumable as the same invocation.

## Design

### Standard pane preflight

For first-time repaired-publication consumption, derive layout from `HERDR_PANE_ID`, the actual controller pane, using the same width-versus-height direction rule as normal worker dispatch. Split the standard step pane and validate its returned id before archiving or consuming anything. Record attempt-local ownership only after a successful split. A failed split changes no recovery or run bytes. If later pre-consumption validation fails, close only that attempt-owned unused pane; a close failure is reported without claiming recovery consumption.

For consumed-dispatch resumption, repeat geometry inspection from the current controller pane and allocate a fresh standard pane. A pane recorded by a stopped pre-fix checkpoint is evidence only; it must be absent before admission and is never trusted as current ownership.

### Pending dispatch schema

Add one optional run field for repaired-publication pending dispatch. Its closed schema binds:

- run id and original safe-recovery invocation id;
- class `repaired_publication_intervention`;
- issue and `implement` step;
- exact checkpoint HEAD and actual branch;
- immutable handoff archive path and SHA-256 digest;
- standard worker name and allocated pane id;
- disposition `prepared`, `pending`, `starting`, `started`, or `stopped` with stable reason.

After split and under-lease revalidation, the first CAS reserves the original invocation in one `prepared` dispatch before archive or safe-recovery mutation; `recoveries[]` is still unchanged. Immutable archive creation and safe-recovery consumption then use that invocation. The next CAS creates exactly one matching run recovery and marks the dispatch `pending` before any `agentStart()`. Process loss between the safe record and that CAS is validated from the prepared dispatch, consumed safe record, and immutable archive; same-invocation resume creates the absent run recovery in its next CAS, never a duplicate tuple or another allowance. Worker ownership and `started` disposition are persisted before prompt delivery through the existing standard worker path.

### Read-only consumed-dispatch discovery

Parameter-free discovery first preserves ordinary #392 classification. If that proof reports consumed, it may classify a stranded dispatch only when the exact consumed safe-recovery record, checkpoint recovery tuple, immutable archive, and run identity agree.

Admission requires either:

1. the grounded compatibility shape: current recovery tuple disposition stopped with `pane_split_failed`, no pending field, no workers, and no matching live pane/agent; or
2. an exact pending-dispatch field for the same invocation whose disposition proves no worker start completed.

The classifier reuses #392's owner-bound scope, publication projection, strict current handoff, task-only diff, terminal evidence, branch, HEAD, lock, and product-clean invariants. It additionally requires the incomplete owner; empty `workers`; no standard `s${issue}-implement` or remediation `r${issue}-implement` agent; no live pane matching the recorded consumed dispatch pane or either agent identity; exact read-only archive bytes, path identity, and digest; and parameter-free invocation. Unrelated sibling/user panes are tolerated. It returns `consumed-dispatch-available`, never `loop-recovery-available`.

Any mismatch is blocking. A `started` disposition, durable worker ownership, matching live agent/pane, completed owner, explicit selector, or previously resumed marker makes the dispatch unavailable.

### Same-invocation resumption

A bare parameter-free run carries the proven invocation id into the leased controller boundary. It repeats the full classifier, preflights and allocates a fresh standard pane from the actual controller pane, and CAS-updates the pending record for that same invocation. It does not archive again, call `consumeSafeRecovery()`, append `recoveries[]`, clear or replace failure evidence, or enter remediation.

It then persists standard worker ownership and a non-offerable start disposition before invoking only `agentStart({ name: s${issue}-implement, kind: omp })`. Agent-start failure remains resumable only while no live agent exists and the owned pane can be proven unused. Successful start makes discovery unavailable before prompt activation, so process loss cannot produce duplicate dispatch.

After the resumed implement worker produces a validated successful handoff, the controller removes the ephemeral pending-dispatch field before persisting the next step. The consumed safe-recovery record and immutable run recovery remain authoritative through terminal queue persistence.

### Crash and cleanup boundaries

| Boundary | Durable result | Resume behavior |
|----------|----------------|-----------------|
| Split fails before consumption | Original available #392 state unchanged | Ordinary one-time recovery remains available |
| Split succeeds and prepared CAS persists before archive/consume, process exits | Prepared dispatch retains the exact pane and invocation; safe record and run recovery remain absent | Ordinary repaired-publication recovery re-proves and reuses that prepared pane/invocation once |
| Safe consumption succeeds before post-consumption CAS, process exits | Prepared dispatch and exact consumed safe record/archive bind the invocation; run recovery is absent | Reconcile exactly one matching run recovery in the next CAS, then dispatch; never duplicate |
| Post-consumption CAS succeeds, process exits | Exact invocation pending with one consumed run recovery | `consumed-dispatch-available` |
| Agent start fails after pending CAS | Same invocation stopped/pending; no worker process | Resume same invocation only |
| Worker ownership/start disposition persists | Dispatch non-offerable | Existing worker/prompt recovery only |
| Start succeeds, controller exits | Worker ownership remains authoritative | Never offer consumed dispatch again |

Cleanup never infers ownership from a pane id alone. It closes only a pane created by the current attempt and proven to have no associated worker/agent. Immutable archives, safe-recovery records, checkpoint tuples, and failure evidence are never removed.

## Failure Modes

| Condition | Result |
|-----------|--------|
| Controller layout unreadable or split fails | `pane_split_failed`; no consumption |
| First-time under-lease revalidation fails after split | Close attempt-owned unused pane; no consumption |
| Pending CAS races or fails | Existing CAS failure; no agent start |
| Agent start fails after consumption | Same invocation remains pending/stopped and resumable |
| Archive missing, mutable, symlinked, identity-changed, or digest-mismatched | Consumed dispatch blocked |
| Run/head/branch/owner/handoff/task/scope/worktree drift | Consumed dispatch blocked |
| Existing worker, pane, agent, lock, completed owner, started disposition, or explicit selector | Consumed dispatch blocked |
| Duplicate resume attempt | Consumed dispatch blocked; no mutation |

## Verification Strategy

1. Exact real-Git fixture models revision 14, issue 108 `implement`, invocation `571f27fa-bc11-4778-9034-b1b992e85638`, immutable archive, stopped `pane_split_failed`, incomplete owner, empty workers, absent pane/agent, and unchanged product paths.
2. Controlled Herdr fixtures prove split failure occurs before archive/consumption, start failure persists the same invocation, pending discovery/resume allocates from the actual main pane, and only `s108-implement` starts.
3. Repeat discovery after durable start is unavailable.
4. Adversarial table coverage mutates archive, run, HEAD, branch, owner, handoff, task, worktree/product state, invocation, disposition, workers, pane/agent presence, lock, and selector while asserting byte-identical blocked state.
5. Existing #392, safe recovery, execute, command synchronization, plugin/current-spec, inventory, contribution, version, and full Jest checks remain green.

## Security and Portability

All durable paths remain canonical repository-relative paths. Archive reads use bounded no-follow regular-file checks and SHA-256. Git and Herdr identities are compared structurally. Pane direction depends only on actual controller geometry. No repository, issue, branch, pane, or invocation value is embedded in runtime code. Node built-ins only.

## Alternatives Rejected

| Alternative | Reason |
|-------------|--------|
| Grant a new recovery allowance | Violates #392 one-time semantics |
| Delete the consumed record or recovery tuple | Destroys durable authority and failure history |
| Replay `consumeSafeRecovery()` and accept `consumed: false` | Cannot prove the caller is finishing the same dispatch |
| Reuse a pane id from stopped state | Pane ids alone do not prove current ownership or emptiness |
| Resume every `pane_split_failed` run | Broad replay would cross recovery classes and non-pane failure boundaries |
| Add an explicit resume selector | User-controlled selectors are outside the parameter-free proof contract |
| Special-case PathCast issue 108 or its invocation | Non-portable and unsafe |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #394 | 2026-09-14 | Initial approved design |
