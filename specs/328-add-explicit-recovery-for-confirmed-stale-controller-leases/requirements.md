# Requirements: Add explicit recovery for confirmed stale controller leases

**Issue**: #328
**Date**: 2026-08-30
**Status**: Approved
**Author**: NMG
**Related Spec**: Existing controller lease and worker ownership contract

---

## User Story

**As a** developer operating an Oh My Pi / Herdr delivery controller
**I want** an explicit option to recover a controller lease that is confirmed stale for the current run
**So that** a run whose controller process and exact Herdr controller pane are both gone can resume without weakening protection for live or uncertain ownership

---

## Background

The execute controller uses an exclusive project lease and durable run identity to prevent competing writers. That protection must remain fail-closed when a controller stops unexpectedly: an existing lease cannot be silently deleted or guessed stale. A developer needs a deliberate recovery path for the narrower case where both independent ownership observations prove that the recorded controller is gone.

This follow-up adds only explicit stale-controller-lease recovery. It does not change ordinary lease acquisition, owned-worker cleanup, default execution behavior, or the explicit `--retain-worker` debugging escape.

---

## Acceptance Criteria

### AC1: Reclaim a confirmed-dead lease for the same run

**Given** the current checkpoint identifies run R and its controller lease identifies the same run
**And** the lease's recorded PID is demonstrably absent
**And** a successful Herdr agent listing proves that the exact recorded controller pane is absent
**When** the developer runs `/sdlc-execute --recover-stale` for the current issue selection
**Then** the stale lease is reclaimed and execute continues through its normal controller startup
**And** the recovery reports that the stale lease was reclaimed

### AC2: Preserve live, unknown, malformed, and foreign leases

**Given** a controller lease is live, has unknown PID or pane evidence, is malformed/unreadable, or belongs to a different run
**When** the developer runs `/sdlc-execute --recover-stale`
**Then** execute fails with `controller_lease_held`
**And** the lease bytes remain unchanged
**And** no worker pane, checkpoint, handoff, branch, verification, or delivery mutation is started

### AC3: Protect changed or newly-created leases atomically

**Given** a same-run lease was confirmed absent-owner from an earlier observation
**When** the lease changes or a new lease appears before stale recovery completes
**Then** recovery fails closed with `controller_lease_held`
**And** it does not delete, overwrite, or restore over the changed or newly-created lease
**And** the latest lease bytes remain intact

### AC4: Preserve default and retained-worker behavior

**Given** an existing lease or an execute lifecycle that uses owned workers
**When** execute runs without `--recover-stale`, or with the existing `--retain-worker` option
**Then** ordinary existing-lease rejection and controller/worker ownership behavior remain unchanged
**And** stale-owner inspection and reclamation occur only when `--recover-stale` is explicitly supplied
**And** `--retain-worker` continues to control intentional worker retention independently of stale recovery

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Accept `--recover-stale` at most once among normal execute issue tokens and preserve existing issue selection behavior. | Must | Existing issue, comma, whitespace, and OMP-expanded token forms remain supported. |
| FR2 | Reclaim only a lease whose run identity matches the current checkpoint and whose recorded PID and exact Herdr controller pane are both proven absent. | Must | The exact pane identity is required; prefix matches are not evidence. |
| FR3 | Treat live, unknown, malformed/unreadable, and foreign leases as held; leave their bytes and protected artifacts unchanged. | Must | Failed or incomplete Herdr listing evidence is unknown. |
| FR4 | Compare the observed lease identity atomically during reclaim so changed or newly-created leases cannot be deleted or overwritten. | Must | Recovery is fail-closed if the snapshot no longer matches. |
| FR5 | Preserve default execute behavior and keep `--retain-worker` semantics independent and unchanged. | Must | No stale-owner inspection occurs without the explicit recovery flag. |

---

## Out of Scope

- Reimplementing controller lease acquisition, worker ownership, or controller-owned pane cleanup
- Automatically or silently recovering a lease without the explicit `--recover-stale` option
- Recovering a lease for another run, project, process, or controller pane
- Killing processes, closing panes, or deleting unrelated lease files as part of recovery
- Changing `--retain-worker`, review, verification, delivery, spec publication, or issue-selection semantics beyond carrying the new option

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #328 | 2026-08-30 | Initial feature spec |
