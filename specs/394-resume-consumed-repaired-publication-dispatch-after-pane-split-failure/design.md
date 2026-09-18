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
- disposition `prepared`, `pending`, `starting`, `started`, or `stopped`, with reason absent for `prepared`/`starting`/`started`, optional and resume-reason-bounded for `pending`, and required and resume-reason-bounded for `stopped`.

After split and under-lease revalidation, the first CAS reserves the original invocation in one `prepared` dispatch before archive or safe-recovery mutation; `recoveries[]` is still unchanged. Immutable archive creation and safe-recovery consumption then use that invocation. The next CAS creates exactly one matching run recovery and marks the dispatch `pending` before any `agentStart()`. Process loss between the safe record and that CAS is validated from the prepared dispatch, consumed safe record, and immutable archive; same-invocation resume creates the absent run recovery in its next CAS, never a duplicate tuple or another allowance. Worker ownership and `started` disposition are persisted before prompt delivery through the existing standard worker path.

### Read-only consumed-dispatch discovery

Parameter-free discovery first validates every current recovery tuple for the same run, issue, and step against the closed recovery schema and exact run/issue/step identities. This occurs before recovery-class filtering: a malformed, wrong-class, incompatible, or additional tuple blocks classification rather than being ignored. Only after the complete tuple set passes does ordinary #392 classification proceed. If that proof reports consumed, discovery may classify a stranded dispatch only when the exact consumed safe-recovery record, checkpoint recovery tuple, immutable archive, and run identity agree.
Admission requires either:

1. the grounded compatibility shape: current recovery tuple disposition stopped with `pane_split_failed`, no pending field, no workers, and no matching live pane/agent; or
2. an exact pending/stopped dispatch field for the same invocation whose disposition proves no worker start completed; or
3. an exact `started` dispatch with a consumed recovery and `controller_cancelled` or `process_lost` whose workers, recorded pane, matching agents, and live handoff are all absent.

The classifier reuses #392's owner-bound scope, publication projection, strict current failed handoff—or the byte-identical immutable archived failed handoff only for an exact stopped prompt-path `process_lost` or controller-loss-orphaned `started` dispatch—task-only diff, terminal evidence, branch, HEAD, lock, and product-clean invariants. It additionally requires the incomplete owner; empty `workers`; no standard `s${issue}-implement` or remediation `r${issue}-implement` agent; no live pane matching the recorded consumed dispatch pane or either agent identity; exact read-only archive bytes, path identity, and digest; and parameter-free invocation. Unrelated sibling/user panes are tolerated. It returns `consumed-dispatch-available`, never `loop-recovery-available`.

Any mismatch is blocking. A `started` disposition remains unavailable while durable worker ownership, its recorded pane, a matching live agent, a live handoff, or any cleanup failure diagnostic exists. The sole compatibility exception is an otherwise exact `started` dispatch after `controller_cancelled` or `process_lost` with empty workers and absent pane, agents, live handoff, and cleanup failure; its immutable archived failed handoff must independently satisfy every original proof. A completed owner, explicit selector, or previously resumed marker also makes the dispatch unavailable.

### Same-invocation resumption

A bare parameter-free run carries the proven invocation id into the leased controller boundary. It repeats the full classifier, preflights the current controller layout, and only after valid geometry allocates a fresh standard pane. Malformed or unreadable layout fails before `paneSplit()`, archive creation, or consumption. For an exact controller-loss-orphaned `started` dispatch, it reads the immutable archive through the bounded no-follow path and verifies its digest. An absent live implement handoff is created with those exact bytes. An existing live handoff is accepted without rewrite only when bounded no-follow bytes and digest equal the archive; mismatch, symlink, or unreadable state fails closed without overwrite. The restored archive digest is carried through prompt delivery and activation so the archived failed/intervention handoff is ignored until the worker replaces it with different valid bytes. Start or prompt failure before replacement removes only the exact attempt-restored bytes; a replacement is never deleted.

The controller then CAS-updates the pending record for that same invocation. It does not archive again, call `consumeSafeRecovery()`, append `recoveries[]`, clear or replace failure evidence, or enter remediation. It persists standard worker ownership and a non-offerable start disposition before invoking only `agentStart({ name: s${issue}-implement, kind: omp })`. The consumed worker path does not delete the restored live handoff. Successful activation requires a valid handoff whose digest differs from the restored archive; the exact restored failed archive is never consumed as the new worker result. Agent-start or prompt failure cleans exact unchanged restored bytes before preserving same-invocation recovery.

After the resumed implement worker produces a validated successful handoff, the controller removes the ephemeral pending-dispatch field before persisting the next step. The consumed safe-recovery record and immutable run recovery remain authoritative through terminal queue persistence.

### Crash, supervisor, and cleanup boundaries

| Boundary | Durable result | Resume behavior |
|----------|----------------|-----------------|
| Layout is malformed or unreadable | Original available #392 state unchanged; no split attempted | Fail `pane_split_failed` before consumption |
| Split fails before consumption | Original available #392 state unchanged | Ordinary one-time recovery remains available |
| Split succeeds and prepared CAS persists before archive/consume, process exits or is killed | Prepared dispatch retains the exact pane and invocation; safe record and run recovery remain absent | Supervisor closes only that attempt-owned unused pane; ordinary repaired-publication recovery re-proves the invocation |
| Safe consumption succeeds before post-consumption CAS, process exits or is killed | Prepared dispatch and exact consumed safe record/archive bind the invocation; run recovery is absent | Supervisor preserves original `implementation_failed`; next CAS reconciles exactly one matching run recovery, then dispatches |
| Post-consumption pending CAS succeeds before worker persistence, process exits or is killed | Exact invocation pending with one consumed run recovery and an exact attempt-owned unused pane | Supervisor closes only that pane and leaves `consumed-dispatch-available` |
| Agent start fails after pending CAS | Same invocation stopped/pending; no worker process | Resume same invocation only |
| Prompt path proves worker loss | Same invocation persists `process_lost` | Resume same invocation only; never consume or append again |
| Worker ownership/start disposition persists | Dispatch non-offerable | Existing worker/prompt recovery only |
| Started worker is removed by controller cancellation/process loss before a handoff exists | Exact `started` dispatch, consumed recovery, empty workers, absent pane/agents/live handoff, and `controller_cancelled` or `process_lost` | Re-prove every invariant, idempotently restore the live handoff from immutable archive bytes, ignore that digest until replacement, then resume the same invocation without another recovery |

The detached `scripts/sdlc-execute-supervisor.mjs` cleanup path is consumed-dispatch-aware. On controller hard loss, including `SIGKILL`, it preserves the original implementation failure and all consumed authority. It may close and remove only the pane/worker entry whose exact name, pane id, run, issue, step, and attempt ownership prove it belongs to the interrupted attempt and has no live agent. Prepared, crash-gap, and pending state remain resumable under the same invocation.

## Failure Modes

| Condition | Result |
|-----------|--------|
| Controller layout malformed or unreadable | `pane_split_failed` before split or consumption |
| Pane split fails | `pane_split_failed`; no consumption |
| First-time under-lease revalidation fails after split | Close attempt-owned unused pane; no consumption |
| Pending CAS races or fails | Existing CAS failure; no agent start |
| Agent start fails after consumption | Same invocation remains pending/stopped and resumable |
| Standard prompt path proves worker absence | Persist same-dispatch `process_lost`; remain resumable |
| Supervisor observes controller hard loss | Preserve original implementation failure and same-invocation state; close only exact attempt-owned unused pane |
| Any current run/issue/step recovery tuple is malformed, wrong-class, incompatible, or additional | Block before class filtering |
| Archive missing, mutable, symlinked, identity-changed, or digest-mismatched | Consumed dispatch blocked |
| Run/head/branch/owner/handoff/task/scope/worktree drift | Consumed dispatch blocked |
| Existing worker, pane, agent, live handoff, lock, completed owner, unsupported started-state failure, or explicit selector | Consumed dispatch blocked |
| Duplicate resume attempt | Consumed dispatch blocked; no mutation |

## Verification Strategy

1. Exact real-Git fixture models revision 14, issue 108 `implement`, invocation `571f27fa-bc11-4778-9034-b1b992e85638`, immutable archive, stopped `pane_split_failed`, incomplete owner, empty workers, absent pane/agent, and unchanged product paths.
2. Controlled Herdr fixtures prove malformed layout fails before split/consumption, split failure occurs before archive/consumption, start failure persists the same invocation, pending discovery/resume allocates from the actual main pane, prompt-path disappearance persists `process_lost`, and only `s108-implement` starts.
3. Real supervised-process fixtures send `SIGKILL` at prepared CAS, after safe consumption before run-tuple CAS, and after pending CAS before worker persistence; each proves original implementation failure, exact attempt-owned pane cleanup, and same-invocation resumability.
4. Tuple-set coverage proves every current run/issue/step recovery tuple is validated before class filtering and wrong-class or additional tuples block without mutation.
5. Repeat discovery after durable start is unavailable while its worker, pane, agent, or live handoff exists; exact controller-loss orphaning is separately covered as same-invocation recovery.
6. Adversarial table coverage mutates archive, run, HEAD, branch, owner, handoff, task, worktree/product state, invocation, disposition, workers, pane/agent presence, lock, selector, and recovery tuples while asserting byte-identical blocked state.
7. Existing #392, safe recovery, execute, supervisor, command synchronization, plugin/current-spec, inventory, contribution, version, and full Jest checks remain green.
8. The final verification report records the bounded external review evidence defined below. Git output after committing the report supplies its exact commit SHA; the report does not claim its own SHA.

### Final external review evidence

External review is bounded to the final-report evidence gate; it does not authorize review remediation, delivery, push, PR, or merge work. The report records the reviewer or tool identity, exact review command or invocation, exact scoped paths, the reviewed pre-report implementation SHA and tree, outcome, and every finding or an explicit no-findings result. The reviewed SHA must be the direct parent of the final report commit. It can therefore be embedded in the report; the report commit's own SHA cannot.

After the report commit, Git supplies the exact report commit SHA as external delivery evidence. That post-commit value is reported outside the committed report, preventing a self-referential identity claim.

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
| #394 | 2026-09-14 | Approved amendment for supervisor hard-loss cleanup, tuple validation, crash fixtures, and final review evidence |
