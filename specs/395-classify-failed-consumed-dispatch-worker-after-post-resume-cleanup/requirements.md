# Defect Report: Classify failed consumed-dispatch worker after post-resume cleanup

**Issue**: #395
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/394-resume-consumed-repaired-publication-dispatch-after-pane-split-failure/

---

## Reproduction

1. Resume the one-time repaired-publication invocation through the consumed-dispatch path defined by #394.
2. Let the fresh standard implement worker return a distinct valid `failed`, `intervention: true`, `implementation_failed` handoff.
3. Close the proven-owned worker pane successfully and persist the run with empty `workers`, the fresh ordinary failure, and the original recovery stopped at its prior disposition.
4. Observe that the ephemeral `consumedDispatch` still has disposition `started` and names the now-closed pane and agent.
5. Run parameter-free recovery discovery and observe `implementation_failed` blocked with `recoveryEvidenceReasonCode: consumed_dispatch_unproven` instead of entering ordinary approved-intervention classification.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Successful validation and cleanup of the fresh resumed worker terminalizes or clears only the ephemeral consumed-dispatch marker. Discovery then classifies the fresh failure through the ordinary approved intervention path while immutable recovery authority remains unchanged. |
| **Actual** | The stale started marker makes the old consumed invocation appear orphaned and prevents any legal fresh approved intervention after a specification amendment. |

## Acceptance Criteria

### AC1: Transition after a fresh validated intervention failure

**Given** a consumed repaired-publication dispatch started one fresh standard implement worker
**And** that worker returns a strict, current, validated `failed`, `intervention: true`, `implementation_failed` handoff distinct from the archived source handoff
**When** the controller successfully closes the proven-owned worker pane and removes the worker entry
**Then** it deterministically terminalizes or clears the ephemeral consumed-dispatch marker in the same persisted transition
**And** the current failed state continues to describe the fresh ordinary intervention failure

### AC2: Preserve original one-time recovery evidence

**Given** the original recovery tuple identity, archive identity and digest, source failure evidence, and safe-recovery record
**When** the post-resume worker failure is settled and the existing outcome fields record that fresh stop
**Then** every immutable original recovery and source field remains unchanged
**And** no recovery tuple, safe-recovery record, allowance, or invocation is appended, minted, replayed, or consumed again

### AC3: Rediscover through ordinary approved intervention classification

**Given** successful post-resume cleanup has removed the stale ephemeral dispatch blocker
**And** a later singular Approved specification or scope amendment establishes the ordinary intervention prerequisites
**When** parameter-free recovery discovery runs
**Then** it evaluates the fresh `implementation_failed` handoff through the ordinary approved intervention path
**And** it does not return `consumed_dispatch_unproven`, offer the old invocation, require a checkpoint edit, or require newly minted authority

### AC4: Fail closed until settlement is proven

**Given** a wrong or malformed handoff, a handoff not distinct from the archived source, incomplete worker cleanup, a live worker or pane, or pane cleanup failure
**When** the failure path runs or discovery inspects the state
**Then** the consumed-dispatch state is not cleared or reclassified
**And** discovery remains blocked with stable structured evidence and performs no mutation

### AC5: Preserve successful and resumable dispatch behavior

**Given** prepared, pending, stopped-resumable, started-live, and successfully completed consumed-dispatch fixtures from #394
**When** relevant supervisor and discovery paths run
**Then** their existing one-time, no-replay, exact-identity, and cleanup behavior is unchanged
**And** only the newly proven fresh failed-intervention settlement gains the ordinary classification transition

### AC6: Verify the exact observed boundary

**Given** a fixture matching run `5045d7eb-1038-49d7-9d81-d17ba22e7a62` after revision 28 in all behaviorally relevant fields
**When** the focused reproduction and parameter-free discovery run
**Then** the owned pane is closed, `workers` is empty, the fresh failure remains, immutable recovery evidence is unchanged, and stale consumed-dispatch state no longer blocks ordinary classification
**And** repeated discovery proves no unchanged replay and no manual `run.json` edit requirement

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Settle ephemeral consumed-dispatch state only after strict fresh failed handoff validation and proven-owned pane cleanup | Must |
| FR2 | Preserve original recovery tuple identity, archive, source evidence, record, and one-time semantics while allowing existing outcome fields to record the fresh stop | Must |
| FR3 | Route subsequent parameter-free discovery through the existing ordinary approved intervention classifier instead of selecting consumed dispatch from historical class alone | Must |
| FR4 | Keep malformed evidence, live ownership, incomplete cleanup, and cleanup failure blocked without mutation | Must |
| FR5 | Add exact supervisor transition and parameter-free discovery regression coverage, including no replay and no hand edit | Must |
| FR6 | Preserve all #394 dispatch crash-boundary, resume, success, and adversarial behavior | Must |

## Out of Scope

- PathCast product or repository mutation
- Replaying the old consumed invocation
- Appending or minting recovery authority
- Hand-editing runtime checkpoints or archived evidence
- Broadening handoff, worker, pane, archive, or ownership acceptance
- CodeRabbit review
- Installation into PathCast
