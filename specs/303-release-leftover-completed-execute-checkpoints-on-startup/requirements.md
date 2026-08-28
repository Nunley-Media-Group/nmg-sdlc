# Defect Report: Release Leftover Completed Execute Checkpoints on Startup

**Issue**: #303
**Date**: 2026-08-27
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/299-remove-completed-execute-runtime-checkpoints/

---

## Reproduction

1. Leave a fully completed execute checkpoint on disk with every delivery step complete, `currentIssue` and `currentStep` cleared, and no failure or remediation.
2. Start `/sdlc-execute` with a different eligible issue list.
3. Observe status 1 with stderr exactly `Run checkpoint identity mismatch` before any worker starts.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Startup releases the terminal checkpoint and its run-owned artifacts, then starts the new issue list. |
| **Actual** | The frozen prior issue list fails the identity gate and blocks the new queue. |

## Acceptance Criteria

### AC1: Leftover Completed Checkpoint Is Released

**Given** an existing execute checkpoint whose run is fully completed and terminal
**When** `/sdlc-execute` starts with a different eligible issue list
**Then** the leftover completed checkpoint and its run-owned handoff and worker-provenance files are released
**And** the new issue list is allowed to start

### AC2: Nonterminal Identity Mismatches Stay Fail-Closed

**Given** an existing execute checkpoint that is still resumable because it is in progress, blocked, or failed
**When** `/sdlc-execute` starts with a different issue list
**Then** the controller exits status 1 with stderr exactly `Run checkpoint identity mismatch`
**And** the resumable checkpoint and supporting runtime remain

### AC3: Successful Finalize Cleanup Still Holds

**Given** a queue that completes every delivery step in the current controller invocation
**When** the controller finalizes that queue
**Then** the completed runtime is released
**And** a later different issue list can start without an identity mismatch

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | On execute startup, release a leftover fully completed terminal checkpoint before starting a different eligible issue list. | Must |
| FR2 | Keep failed, blocked, and in-progress checkpoints and continue to fail closed on identity mismatches. | Must |
| FR3 | Keep genuine mismatch stderr exactly `Run checkpoint identity mismatch`. | Must |
| FR4 | Preserve successful same-invocation finalize cleanup for completed queues. | Must |

## Out of Scope

- Discarding failed, blocked, or in-progress checkpoints
- Changing mismatch stderr for nonterminal leftovers
- Adding a manual runtime repair command
- Bypassing identity validation for nonterminal checkpoints

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #303 | 2026-08-27 | Initial defect report |
