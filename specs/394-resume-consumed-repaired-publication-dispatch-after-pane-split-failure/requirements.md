# Defect Report: Resume consumed repaired-publication dispatch after pane split failure

**Issue**: #394
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/392-recover-repaired-publication-interventions-before-implementation/

---

## Reproduction

1. Begin parameter-free repaired-publication recovery for an exact state admitted by #392.
2. Archive the failed handoff and consume the one-time `repaired_publication_intervention` record before the standard implement worker pane exists.
3. Make the first standard worker pane split fail.
4. Observe a stopped run with `pane_split_failed`, one consumed invocation and checkpoint recovery, an incomplete owner, empty workers, no standard implement pane or agent, and no product changes.
5. Run parameter-free discovery again and observe the consumed record prevents dispatch even though no worker was ever started.

The grounded consumer state is PathCast run revision 14 at issue 108 `implement`, invocation `571f27fa-bc11-4778-9034-b1b992e85638`, with an immutable repaired-publication archive and no product output. The implementation and classifier remain generic and must not special-case these values.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Pane capacity is proven before first consumption. If consumption succeeded but process loss or agent start prevented dispatch, an exact persisted pending dispatch allows the next parameter-free bare run to resume the same invocation once without another consumption or recovery tuple. |
| **Actual** | Consumption precedes pane allocation. A split failure strands the one-time invocation with no worker and no supported fail-closed continuation. |

## Acceptance Criteria

### AC1: Split failure before consumption preserves the allowance

**Given** parameter-free bare run has re-proven an available repaired-publication recovery under its controller lease
**When** the standard worker pane cannot be allocated from the actual controller pane
**Then** no handoff archive, safe-recovery record, checkpoint recovery, pending dispatch, worker, or product state is created or changed
**And** only a pane proven to have been created and still unused by this attempt may be closed

### AC2: Persist exact pending dispatch before start

**Given** a standard worker pane was allocated and repaired-publication recovery is ready to consume
**When** the controller crosses the archive and consumption boundary
**Then** a checkpoint CAS first reserves the original invocation with the exact prepared dispatch identity and no recovery tuple
**And** after immutable archive creation and safe-recovery consumption, the next CAS creates exactly one matching run recovery and marks the dispatch pending before agent start
**And** same-invocation resume reconciles an absent tuple only at that crash boundary and never creates a duplicate or a new recovery allowance

### AC3: Discover only the stranded consumed dispatch

**Given** a consumed repaired-publication invocation whose owner is incomplete and whose run has empty workers
**When** parameter-free discovery evaluates the stopped `pane_split_failed` disposition or an exact pending dispatch
**Then** it returns distinct state `consumed-dispatch-available` only after exact archive/hash, run/head/branch/owner/handoff/task/worktree, absent recorded dispatch pane and matching standard/remediation agent identities, absent lock, and no-drift proof; unrelated sibling/user panes do not block
**And** ordinary loop recovery is not offered

### AC4: Resume the same invocation exactly once

**Given** discovery returns `consumed-dispatch-available`
**When** the next parameter-free bare run acquires its lease and preflights geometry and a standard pane from the actual controller pane
**Then** it re-proves the consumed dispatch, updates its disposition through checkpoint CAS, starts only `s${issue}-implement`, and activates the existing standard prompt path
**And** it does not call `consumeSafeRecovery`, append `recoveries[]`, create a new invocation, or select remediation
**And** after start, repeat discovery cannot offer the dispatch again
**And** a validated successful implement handoff clears only the ephemeral pending-dispatch field before next-step or terminal persistence while retaining immutable safe-recovery and run-recovery evidence

### AC5: Preserve deterministic crash boundaries

**Given** process loss occurs after split, after pending persistence, or during agent start
**When** the next parameter-free discovery runs
**Then** durable state unambiguously identifies either an unconsumed recovery or the exact same pending consumed dispatch
**And** cleanup closes only a proven-owned unused pane and never deletes consumed authority, immutable history, active worker ownership, or failure evidence

### AC6: Reject every mismatch and alternate entry

**Given** any non-pane failure; missing, replaced, mutated, symlinked, or digest-mismatched archive; changed run, HEAD, branch, owner, handoff, task, publication proof, worktree, or product state; complete owner; existing worker or matching pane/agent; wrong invocation; duplicate resume; controller lock; or explicit issue/session/run selector
**When** discovery or run evaluates consumed-dispatch resumption
**Then** it remains blocked with stable structured evidence and performs no mutation

### AC7: Preserve existing recovery contracts

**Given** all existing #392 and other safe-recovery fixtures
**When** focused and full verification runs
**Then** #392 remains one-time, every existing recovery class retains its behavior, and only exact consumed-dispatch resumption gains a new transition
**And** workflow, command, contributor, README, changelog, inventory, plugin/current-spec, contribution, version, and diff checks remain synchronized

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Preflight standard worker geometry and pane ownership before first repaired-publication consumption | Must |
| FR2 | Persist a schema-validated exact pending-dispatch record before agent start using existing checkpoint CAS | Must |
| FR3 | Classify the grounded revision-14 shape generically without repository, issue, branch, pane, or invocation exceptions | Must |
| FR4 | Resume only the same consumed invocation from parameter-free bare run without `consumeSafeRecovery` or another recovery tuple | Must |
| FR5 | Require byte-exact immutable archive and all #392 identity, publication, scope, handoff, owner, lock, and clean-worktree proofs | Must |
| FR6 | Make split, persist, start, and cleanup crash boundaries deterministic and close only proven-owned unused panes | Must |
| FR7 | Start only the standard `s${issue}-implement` worker and make the dispatch unavailable immediately after durable start ownership | Must |
| FR8 | Add exact positive and adversarial fixtures and synchronize public/contributor/workflow/changelog surfaces without a version bump | Must |

## Out of Scope

- PathCast product implementation or mutation
- A second safe-recovery allowance, record, tuple, or invocation
- Explicit-selector recovery
- General replay of consumed recoveries
- New behavior for non-pane failures or other recovery classes
- Simplification, independent review, push, pull request, merge, issue closure, installation, or version bump

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #394 | 2026-09-14 | Initial approved defect report |
