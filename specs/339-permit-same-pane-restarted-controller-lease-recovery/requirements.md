# Defect Report: Permit same-pane restarted controller lease recovery

**Issue**: #339
**Date**: 2026-08-31
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/328-add-explicit-recovery-for-confirmed-stale-controller-leases/

---

## Reproduction

1. Leave a same-run controller lease whose recorded PID is gone (`ESRCH` on a zero-signal existence probe) and whose `controllerPaneId` is the current main pane (example: `w14:p1`).
2. Restart the OMP controller in that same main pane so the invoking `HERDR_PANE_ID` equals the recorded `controllerPaneId`.
3. Confirm there is no separate conflicting controller identity and no surviving recorded delivery worker or pane.
4. Invoke `/sdlc-execute --recover-stale` for the current issue selection from that restarted controller.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Recovery reclaims the unchanged same-run lease and execute continues through normal controller startup. Stdout contains exactly the line `Reclaimed stale controller lease.` |
| **Actual** | Recovery returns status 1 with stderr `controller_lease_held` and leaves the lease in place. The current restarted invoker is treated as the stale live owner because it is listed on the recorded pane id. |

## Acceptance Criteria

### AC1: Same-pane restarted recovery succeeds

**Given** a valid controller lease whose `runId` and canonical project root match the current checkpoint
**And** the recorded PID is conclusively absent (`ESRCH` on a zero-signal existence probe)
**And** the current `HERDR_PANE_ID` exactly equals the recorded `controllerPaneId`
**And** a successful agent listing shows that pane as the current recovering controller with no separate conflicting controller identity
**When** the developer runs `/sdlc-execute --recover-stale` from that restarted controller
**Then** the stale lease is reclaimed and execute continues through normal controller startup
**And** stdout contains exactly the line `Reclaimed stale controller lease.`
**And** no process is killed and no arbitrary runtime state is deleted

### AC2: Fail-closed branches preserve lease bytes

**Given** a controller lease that is malformed, belongs to a foreign run, has a live PID, has an unreadable or unparseable agent list, changes before reclaim completes, belongs to a foreign pane, has ambiguous controller identity, or otherwise fails proof
**When** the developer runs `/sdlc-execute --recover-stale`
**Then** execute fails with `controller_lease_held`
**And** the latest lease bytes remain unchanged
**And** no worker pane, checkpoint, handoff, branch, verification, or delivery mutation is started
**And** no process is killed and no arbitrary runtime state is deleted

This AC covers every existing fail-closed recovery branch and the additional foreign-pane, ambiguous-identity, and failed-proof cases:

- live PID (existence probe returns without throw)
- unknown PID (non-`ESRCH` probe error)
- foreign pane (current `HERDR_PANE_ID` does not equal recorded `controllerPaneId` while that recorded pane is listed as a live owner)
- failed agent list
- unparseable agent list
- foreign `runId`
- malformed or unreadable lease
- lease bytes changed after observations and before unlink
- ambiguous controller identity
- failed proof of any required recovery condition
- without `--recover-stale`, a dead-looking lease remains held and is not inspected for reclaim

Issue #328 pane-absent recovery remains in force: a same-run `ESRCH` lease whose recorded controller pane is absent from a successful agent list still reclaims. This issue does not revoke that path.

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Distinguish the current explicitly recovering controller pane from a foreign live owner. | Must |
| FR2 | Permit same-pane stale recovery when recorded PID is conclusively `ESRCH`, `runId` and canonical project root match, current `HERDR_PANE_ID` exactly equals recorded `controllerPaneId`, and no separate conflicting controller identity is present. | Must |
| FR3 | Preserve lease bytes byte-for-byte on malformed/foreign run, live PID, unreadable agent list, changed lease, foreign pane, ambiguous identity, or failed proof. | Must |
| FR4 | Never kill processes or delete arbitrary runtime state during recovery. | Must |
| FR5 | Add exact behavioral regressions for same-pane restarted recovery success and every existing fail-closed branch listed in AC2. | Must |
| FR6 | Keep the fix stack-neutral and fail-closed; do not change ordinary acquire, `--retain-worker`, silent recovery without `--recover-stale`, or issue #328 pane-absent reclaim. | Must |

## Out of Scope

- Silent or automatic lease recovery without explicit `--recover-stale`
- Killing processes, closing panes, or deleting unrelated runtime files
- Changing lease schema or worker-ownership / `--retain-worker` semantics
- Revoking issue #328 pane-absent reclaim
- Adding a new recovery path from a pane that is neither the recorded controller pane nor a successful proof that the recorded pane is absent

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #339 | 2026-08-31 | Initial defect report |
