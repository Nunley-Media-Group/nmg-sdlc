# Defect Report: Recover issue-unreadable failed START

**Issue**: #411
**Date**: 2026-09-22
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/374-recover-bounded-automatic-delivery-stops-without-loops/

## Reproduction

On MileDar #169, an approved spec and merged spec PR #170 preceded run `d27814f1-c1cd-482a-af83-46d931cdaafa`. START wrote a valid failed `169-start.json` with `issue_unreadable` because a worker lacked the per-pane `GH_TOKEN`; its pane closed before branch/code mutation. With authorized credentials restored, `gh issue view 169` succeeds but discovery still reports blocked `issue_unreadable`, offering only inspect/keep.

## Expected vs Actual

| | Behavior |
|---|---|
| Expected | A parameter-free, one-use controller recovery can re-read the exact issue and dispatch normal START under its lease without hiding the failed handoff. |
| Actual | A valid failed START intervention blocks recovery; `closed_worker_resume` admits only missing/invalid handoffs in remediable stages. |

## Acceptance Criteria

### AC1: Prove the original failure and fresh issue availability

**Given** the current checkpoint names START on the original run/issue and a valid failed, intervention-required `issue_unreadable` handoff
**And** exact branch and HEAD remain clean with no prior START branch mutation, live worker, foreign lease or recovery tuple
**When** credentials return and a fresh issue read succeeds for the exact issue
**Then** read-only discovery identifies a single bounded retry with the original handoff identity and does not modify any artifact

### AC2: Archive and redispatch once

**Given** AC1 remains true under the acquired controller lease
**When** parameter-free execute consumes the recovery
**Then** it archives the original failed handoff bytes immutably, durably records one run/issue/START invocation, and dispatches the ordinary START worker once
**And** it never manufactures a passed handoff or updates the consumer branch before that worker

### AC3: Fail closed on changed evidence

**Given** malformed or changed handoff bytes, failed fresh read, changed branch/HEAD, dirty tree, prior START branch mutation, foreign lease, live or ambiguous worker, different run/issue, or consumed retry
**When** discovery or execution checks the recovery
**Then** it blocks without archive replacement or another worker dispatch

### AC4: A repeated failure never replenishes recovery

**Given** one consumed START retry that itself fails or loses its worker
**When** discovery repeats
**Then** the original archive and invocation remain auditable, the second failure remains blocked, and no further automatic retry occurs

### AC5: Preserve existing boundaries

**Given** a successful START or another stop class
**When** the controller resumes
**Then** existing handoff, worker, lease and recovery behavior is unchanged; MileDar retained evidence and pane are read-only during plugin repair, and plugin self-delivery is never invoked

## Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR1 | Bind START recovery to exact current checkpoint, issue, branch, HEAD, failed handoff identity and fresh issue read. | Must |
| FR2 | Consume at most one durable invocation under controller lease before ordinary worker dispatch, preserving immutable failed evidence. | Must |
| FR3 | Refuse dirty, mutated, foreign-owned, unreadable, malformed and repeated states without forging success. | Must |

## Out of Scope

Generic START replay, credential propagation or mutation, replacing a failed handoff with passed evidence, changing MileDar checkpoint/pane, replaying a stopped smoke issue, and running any `/sdlc-*` command on nmg-sdlc itself.
