# Defect Report: Bind SDLC run checkpoints to project identity with CAS writes

**Issue**: #290
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/259-add-controller-owned-fresh-session-remediation-loops/

---

## Reproduction

1. Start `/sdlc-execute` for issue A so `.omp/sdlc/run.json` records A failed or in progress at verify.
2. In the same working tree, start another execute, verify, or deliver helper for issue B, or restore a previously captured A checkpoint by rewriting the file through `writeRun` / `write-run` without the on-disk revision and identity.
3. Observe the later write succeed without comparing expected revision or identity.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Every checkpoint write is identity-bound and monotonic: canonical project root, run/session id, issue, branch, and head are immutable for that file; `issues` stays the same array; revision increases; the write is compare-and-swap. A mismatched identity or stale revision is rejected and the previous bytes remain. Legitimate same-identity lifecycle transitions may update `currentIssue`, `currentStep`, `completed`, `failed`, and `remediation`. |
| **Actual** | Any schemaVersion 1 object can replace the file. There is no revision, no identity lock, and no CAS, so concurrent helpers and manual restores race. |

## Acceptance Criteria

### AC1: Bug Is Fixed

**Given** an existing run checkpoint bound to project P, run R, issue A, branch B, head H, and revision N
**When** a helper attempts a write whose identity differs or whose expected revision is not N
**Then** the write is rejected
**And** the on-disk checkpoint bytes are unchanged
**And** a successful same-identity transition stores revision N+1 with CAS

### AC2: No Regression

**Given** a single controller that owns the current identity
**When** it advances A from one valid step to the next
**Then** the checkpoint updates step and completed/failed fields
**And** project, run, issue, branch, and head remain the same for that transition

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Bind every run-state write to canonical project root, run/session id, issue, branch, head, frozen `issues`, and monotonic revision. | Must |
| FR2 | Reject mismatched identity or stale revision with CAS so the previous checkpoint remains. | Must |
| FR3 | Allow legitimate same-identity lifecycle updates. | Must |

## Out of Scope

- Exclusive controller leases and worker-pane cleanup
- Review-base selection
- Delivery PR persistence and isolated session tokens
- Deleting or stealing `.omp/sdlc/run.json.lock` created by another process
- Changing handoff schema, `schemaVersion`, or `src/extension.ts` `readRunState()`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #290 | 2026-08-27 | Initial defect report |
