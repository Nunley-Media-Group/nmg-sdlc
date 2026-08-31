# Requirements: Add explicit recovery for confirmed stale controller leases

**Issue**: #328
**Date**: 2026-08-30
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/291-enforce-one-controller-writer-and-close-stale-workers/

---

## User Story

**As a** developer operating an Oh My Pi / Herdr delivery controller
**I want** an explicit option to recover a controller lease that is confirmed stale for the current run
**So that** a run whose controller process and exact Herdr controller pane are both gone can resume without weakening protection for live or uncertain ownership

---

## Background

The execute controller uses an exclusive project lease at `.omp/sdlc/controller.lock` and a durable checkpoint `runId` to prevent competing writers. Issue #291 left silent stale-lease stealing out of scope: an existing lease cannot be deleted or guessed stale. When a controller process and its exact Herdr controller pane are both gone, the leftover lease currently fails `controller_lease_held` with no user-invoked recovery.

This follow-up adds only explicit stale-controller-lease recovery behind `--recover-stale`. It must not change ordinary lease acquisition, owned-worker cleanup, default execution behavior, or `--retain-worker`.

---

## Acceptance Criteria

Each criterion becomes a Gherkin scenario.

### AC1: Reclaim a confirmed-dead lease for the same run

**Given** the current checkpoint identifies run R and its controller lease identifies the same run
**And** the lease's recorded PID is demonstrably absent
**And** a successful Herdr agent listing proves that the exact recorded controller pane is absent
**When** the developer runs `/sdlc-execute --recover-stale` for the current issue selection
**Then** the stale lease is reclaimed and execute continues through its normal controller startup
**And** stdout contains exactly the line `Reclaimed stale controller lease.`

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
| FR1 | Accept `--recover-stale` at most once among normal execute issue tokens and preserve existing issue selection behavior. | Must | Same token stream as `--retain-worker` and `#N` |
| FR2 | Reclaim only a lease whose run identity matches the current checkpoint and whose recorded PID and exact Herdr controller pane are both proven absent. | Must | Both observations required |
| FR3 | Treat live, unknown, malformed/unreadable, and foreign leases as held; leave their bytes and protected artifacts unchanged. | Must | Reason code remains `controller_lease_held` |
| FR4 | Compare the observed lease identity atomically during reclaim so changed or newly-created leases cannot be deleted or overwritten. | Must | Byte-compare then unlink; never restore |
| FR5 | Preserve default execute behavior and keep `--retain-worker` semantics independent and unchanged. | Must | |

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
