# Defect Report: Remove completed execute runtime checkpoints

**Issue**: #299
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/290-bind-sdlc-run-checkpoints-to-project-identity-with-cas-writes/

---

## Reproduction

1. Run `/sdlc-execute` for an eligible issue and allow every delivery step to complete successfully.
2. Observe that `.omp/sdlc/run.json`, run-owned handoffs, and worker prompt provenance remain after the controller reports success.
3. Invoke `/sdlc-execute` for a different eligible issue list.
4. Observe `Run checkpoint identity mismatch` before a worker launches.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | A fully successful queue releases its identity-bound checkpoint and exact run-owned handoff and prompt-provenance files. A later queue can establish a new identity. Interrupted, blocked, or failed queues retain their resumable runtime. Cleanup errors fail closed with a stable reason. |
| **Actual** | The controller persists a terminal checkpoint with null current fields. Startup correctly rejects a different issue identity, so the stale completed checkpoint blocks all later queues. |

## Acceptance Criteria

### AC1: Completed Runtime Is Removed

**Given** an execute queue whose issues have all completed delivery successfully
**When** the controller finalizes the queue
**Then** the completed checkpoint and its run-owned handoffs and provenance are removed from `.omp/sdlc/`

### AC2: A New Issue Can Start

**Given** a prior execute queue completed successfully and its runtime cleanup succeeded
**When** `/sdlc-execute` starts with a different eligible issue list
**Then** no stale checkpoint identity mismatch prevents the new run from starting

### AC3: Resumable State Is Preserved

**Given** an execute queue is interrupted, blocked, or failed
**When** the controller exits before successful queue completion
**Then** its checkpoint and supporting runtime artifacts remain available for safe resumption and diagnosis

### AC4: Cleanup Failure Fails Closed

**Given** all issues completed delivery but the controller cannot safely remove all completed run artifacts
**When** final cleanup is attempted
**Then** the controller exits nonzero with reason `completed_cleanup_failed`
**And** it does not report the queue as successfully finalized

### AC5: Tracking Files Stay Gitignored

**Given** execute runtime tracking files exist under `.omp/sdlc/`
**When** git ignore rules and index status are inspected
**Then** those tracking files remain gitignored and are not tracked in the Git index

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Release the identity-bound checkpoint and exact runtime files owned by a fully completed execute queue. | Must |
| FR2 | Retain runtime artifacts for every run that has not fully completed. | Must |
| FR3 | Treat unsafe or incomplete final cleanup as `completed_cleanup_failed`. | Must |
| FR4 | Permit a differently identified execution after successful cleanup. | Must |
| FR5 | Keep `.omp/sdlc/` execute tracking files gitignored and untracked. | Must |

## Out of Scope

- Discarding checkpoints for interrupted, blocked, or failed runs.
- Bypassing identity validation when a nonterminal checkpoint exists.
- Adding a manual runtime repair command.
- Purging historical reviews, verification evidence, or unrelated runtime files.
- Changing worker orchestration, issue selection, or delivery semantics.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #299 | 2026-08-27 | Approved defect contract for completed-run cleanup |
