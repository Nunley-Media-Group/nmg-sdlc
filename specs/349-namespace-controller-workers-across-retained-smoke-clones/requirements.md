# Defect Report: Namespace controller workers across retained smoke clones

**Issue**: #349
**Date**: 2026-08-31
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/291-enforce-one-controller-writer-and-close-stale-workers/

---

## Reproduction

1. Run the required mutable smoke provider for queue `39,40` and retain a failed clone/worker.
2. Retry the provider, which creates a new fresh clone for the same queue.
3. The new clone's controller reaches issue #39 start.
4. Global Herdr lookup resolves the earlier clone's `s39-start` worker.
5. The new run stops with `failed.reasonCode: retained_worker_mismatch` and no worker in its run-state map.

Observed retained clone: `/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-smoke-NwT9O0`; run id `404eb301-c71d-4c01-a03b-0ff3f0789aa6`; failure at `#39 start`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Independent controller runs, including fresh retained smoke clones for the same issue, use collision-free worker identities. Each run resumes only its own persisted workers. Legacy persisted runs remain safely resumable or fail closed without claiming an unrelated worker. No unrelated pane is closed, prompted, or reused. |
| **Actual** | Worker names are globally derived only from issue and step (`s<N>-<step>`, `r<N>-<step>`). `runExecute` filters `existingAgents` with `startsWith(\`s${issue}-\`)`, so a worker retained from an earlier clone collides with the same issue in a later clone and stops at start with `retained_worker_mismatch` before creating its own worker. |

## Acceptance Criteria

### AC1: Cross-Root Runs Do Not Collide

**Given** two controller runs for the same issue in different project roots share one global Herdr agent inventory
**When** the second run reaches the current step (including a live mutable-provider retry past issue start)
**Then** it does not treat the first run's worker as its own
**And** it does not stop with `retained_worker_mismatch` because of that foreign worker
**And** it does not close, prompt, or reuse the first run's pane
**And** it starts or resumes only a worker named for its own persisted run

### AC2: Namespaced Identity Is Stable For Every Worker Kind

**Given** a checkpoint that records `runId` and `workerNamespace`
**When** the controller restarts in the same project root or continues to review, remediation, or delivery workers
**Then** standard, review, remediation, and delivery worker names are derived from that persisted namespace and remain unchanged across restart
**And** retained reuse still requires matching name, pane, project root, run id, issue, step, branch, and head

### AC3: Legacy Checkpoints Fail Closed Without Claiming Foreign Workers

**Given** a schemaVersion 1 checkpoint with a valid run identity and no `workerNamespace` field
**When** execute discovers global Herdr agents
**Then** that run keeps legacy `s<N>-<step>` / `r<N>-<step>` names for its own workers
**And** a live foreign worker from another project root or another namespace is not prompted, closed, or recorded as this run's worker
**And** same-run prefix collisions, missing ownership, or identity mismatches still stop with `retained_worker_mismatch` and leave unrelated panes open
**And** a present but malformed `workerNamespace` stops fail-closed without starting or claiming a worker

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | New checkpoints persist `workerNamespace` as the first 8 lowercase hex characters of SHA-256(`runId`) and name workers `s{ns}-{issue}-{step}` and `r{ns}-{issue}-{step}`. | Must |
| FR2 | Agent discovery for a namespaced run matches only that run's namespaced prefix/exact names, not global `s{issue}-*`. | Must |
| FR3 | Checkpoints without `workerNamespace` keep legacy names; they never adopt another run's live agent. | Must |
| FR4 | Every constructed Herdr agent name must match `^[a-z][a-z0-9_-]{0,31}$`; otherwise stop with `invalid_worker_name`. | Must |
| FR5 | A present `workerNamespace` that is not exactly 8 lowercase hex digits stops with `invalid_worker_namespace`. | Must |

## Out of Scope

- Changing handoff filenames (remain `.omp/sdlc/handoffs/<N>-<step>.json`)
- Renaming live Herdr agents in place
- Closing or prompting another clone's retained worker as cleanup
- Smoke-provider clone retention policy (owned by the smoke extension)

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #349 | 2026-08-31 | Initial defect report |
