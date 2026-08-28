# Defect Report: Enforce one controller writer and close stale workers

**Issue**: #291
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/290-bind-sdlc-run-checkpoints-to-project-identity-with-cas-writes/

---

## Reproduction

1. Start `/sdlc-execute #N` until a worker named `sN-step` exists.
2. Cancel the controller or let it stop after a failed, blocked, stalled, or missing handoff.
3. Start another execute in a different worktree, invoke `/sdlc-verify-code` or `/sdlc-open-pr` beside the active controller, or expose an unrelated Herdr agent whose name starts with `sN-`.
4. Observe the foreign helper or prefix-matched agent become a writer, or observe the controller-owned pane remain open and collide with a later run.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | One controller holds an exclusive lease for the canonical project. A second controller or unscoped verify/deliver helper fails before changing run state, handoffs, branches, verification evidence, or pull requests. Retained reuse requires the exact step name and a durable ownership record matching project root, run id, issue, pane, branch, and head. Cancellation and terminal stops close only controller-owned panes unless `--retain-worker` was explicitly supplied. |
| **Actual** | Agent discovery prefix-matches any `s{issue}-*` name, controller ownership is not persisted, direct phase helpers do not observe a controller lease, and `stopResult()` deliberately leaves failed panes open. |

## Acceptance Criteria

### AC1: Competing Writers Fail Closed

**Given** canonical project P has an active controller lease for run R
**When** a second execute or an unscoped verify/deliver helper starts for P
**Then** it fails before changing run state, handoffs, branches, verification evidence, or pull requests
**And** the active controller and its owned worker remain unchanged

### AC2: Retained Workers Require Exact Ownership

**Given** a checkpoint for run R records the expected `sN-step` worker and pane
**When** execute discovers Herdr agents for issue N
**Then** it reuses only the exact name and pane whose recorded project root, run id, issue, step, branch, and head match the current checkpoint and checkout
**And** prefix collisions, missing ownership metadata, or identity mismatches fail with `retained_worker_mismatch`
**And** unrelated panes remain open

### AC3: Controller-Owned Panes Close by Default

**Given** execute created or validly resumed a controller-owned worker pane
**When** the controller is cancelled or reaches a terminal non-debug stop
**Then** it closes that owned pane and releases its controller lease
**And** `--retain-worker` is the only option that keeps the owned pane open
**And** a successful passed-handoff lifecycle still closes the owned pane and advances normally

### AC4: Prompt Composition Has No Size Ceiling

**Given** an automated command body, worker prompt, plugin fragment, builtin fragment, or project fragment is structurally valid
**When** the prompt registry loads and renders it
**Then** prompt construction does not reject it because of its UTF-8 byte length
**And** automated-body and worker-prompt ceiling constants and tests do not exist
**And** fragment schemas contain no `byteBound` compatibility or enforcement path
**And** provenance, placeholder, provider, consumer, slot, ordering, source-path, and non-empty-body validation remains unchanged

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Acquire one exclusive controller lease per canonical project before any controller mutation and release only the lease owned by the current process. | Must |
| FR2 | Guard standalone verify and deliver controllers against a foreign active lease; execute-scoped workers must present the matching run id. | Must |
| FR3 | Persist worker ownership and require exact name, pane, project root, run id, issue, step, branch, and head before retained reuse. | Must |
| FR4 | Close only controller-owned panes on cancellation or terminal stop by default; honor explicit `--retain-worker`. | Must |
| FR5 | Remove every automated-body, worker-prompt, plugin-fragment, builtin-fragment, and worker-header prompt-size ceiling. Reject `byteBound` as an unknown fragment or manifest key instead of accepting, stripping, or enforcing it. | Must |

## Out of Scope

- Checkpoint identity and CAS implementation owned by issue #290
- Review-base selection owned by issue #292
- Delivery exact-head CAS and isolated session tokens owned by issue #293
- Stealing or automatically deleting a controller lease owned by another live or unknown process
- Removing prompt provenance byte counts or unrelated structural prompt validation
- Closing unrelated Herdr panes

## Historical Quota Supersession

Issue #291 explicitly supersedes only the prompt-quota rules from issues #193, #259, #265, and #271. Their prompt-size ceilings, measured-plus-margin constants, plugin/builtin `byteBound` declarations, worker-header bound, exceeded-bound failure paths, and legacy project-`byteBound` compatibility no longer constrain current behavior. Their unrelated workflow, controller, rendering, provenance, and project-snippet capabilities remain required.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #291 | 2026-08-28 | Extended to remove all prompt-size ceilings and supersede historical quota rules from #193, #259, #265, and #271 |
