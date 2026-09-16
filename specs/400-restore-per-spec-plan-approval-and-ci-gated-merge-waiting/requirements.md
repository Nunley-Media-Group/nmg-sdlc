# Defect Report: Restore per-spec plan approval and CI-gated merge waiting

**Issue**: #400
**Date**: 2026-09-15
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/197-move-write-spec-publication-lifecycle-into-code-while-keeping-native-plan/

---

## Reproduction

### Continuation approval

1. In the OMP TUI, invoke `/sdlc-write-spec #N` for an open issue without an approved spec.
2. Approve and publish the generated spec plan.
3. Select another eligible issue M from Continue/Finished.
4. Observe that M proceeds without returning to native plan mode or receiving its own `local://spec-{M}-plan.md` approval.

### CI readiness

1. Deliver an exact-head pull request while required checks are registering, queued, pending, or represented by GitHub as BLOCKED because CI policy is incomplete.
2. Let terminal delivery evaluate the pull request before those checks reach terminal evidence.
3. Observe delivery classify the snapshot as non-mergeable, consume the merge path, or write a failed handoff instead of continuing observation.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Every published spec returns the same TUI session to native plan mode before Continue/Finished. Each selected continuation issue has a distinct complete local plan and `xd://propose` approval before mutation. Terminal delivery polls exact-head CI every 30 seconds without a workflow deadline until checks are terminal, merging only after a fresh successful/CLEAN snapshot. |
| **Actual** | Only the first spec is proposed. Continuation issues reuse that approval, and missing or CI-attributable BLOCKED check evidence can become `merge_failed` instead of pending observation. |

## Acceptance Criteria

### AC1: Return to native plan mode after every publication

**Given** `/sdlc-write-spec #N` has merged an approved spec and completed any post-merge remediation
**When** publication execution settles
**Then** the extension queues exactly one follow-up that runs builtin `/plan` in the same TUI session before Continue/Finished is presented
**And** pre-merge publication failures queue no continuation
**And** candidate ordering, canned labels, exact Finished output, and the repository default-branch postcondition remain unchanged

### AC2: Require a distinct approval before each continuation mutation

**Given** published issue numbers are retained for the active write-spec session
**When** the operator selects another eligible issue M
**Then** discovery and any preference interview for M remain read-only
**And** write-spec creates a distinct complete `local://spec-{M}-plan.md` and calls `xd://propose` for M
**And** `default-branch`, `prepare`, file writes, commit, push, pull-request creation, labeling, and merge for M occur only after that proposal is approved
**And** declining, abandoning, or leaving the proposal performs none of those mutations for M

### AC3: Keep incomplete CI evidence pending

**Given** terminal delivery is bound to the persisted exact pull-request head
**And** a required or declared check is not registered, queued, pending, in progress, waiting, or requested, or BLOCKED is attributable to that incomplete CI evidence
**When** delivery classifies the snapshot
**Then** it returns a pending state and observes again after 30 seconds without a workflow deadline
**And** it does not consume merge recovery, issue the merge, dispatch remediation, or write a failed handoff solely for that non-terminal CI state

### AC4: Preserve terminal failure and exact-head merge proof

**Given** the exact-head CI observations become terminal
**When** every required and declared check is present and successful and a fresh snapshot is CLEAN
**Then** delivery issues exactly one squash merge guarded by `--match-head-commit` for the persisted head
**And** success still requires the exact PR to be MERGED and its linked issue CLOSED before cleanup
**But Given** a check explicitly fails or a human-review, mergeability, or other proven non-CI blocker remains
**Then** delivery uses the existing remediation or failed-handoff route instead of treating that state as pending

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Queue native-plan re-entry exactly once from a validated successful or post-merge-failed publication result. | Must |
| FR2 | Require one complete local plan and `xd://propose` approval for every issue selected in a write-spec session before issue-specific mutation. | Must |
| FR3 | Preserve Continue/Finished candidate filtering, labels, summaries, publication order, and post-merge remediation behavior. | Must |
| FR4 | Treat missing, registering, and explicit pending required-check evidence as non-terminal without a workflow deadline. | Must |
| FR5 | Attribute BLOCKED to CI only when missing or pending required-check evidence supports that classification; retain fail-closed non-CI blocker handling. | Must |
| FR6 | Reconfirm terminal check success, exact head, and CLEAN merge readiness immediately before the one authorized merge. | Must |
| FR7 | Preserve existing remediation budgets, reconciliation, merge transport ambiguity handling, merged-PR proof, issue closure, and cleanup ordering. | Must |

## Out of Scope

- Changing spec templates, issue discovery, candidate ordering, or the exact Published specs / Next step output
- Redesigning automatic-review remediation, base reconciliation, safe-recovery allowances, or post-merge closure handling
- Enabling GitHub auto-merge or adding a bounded CI timeout

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #400 | 2026-09-15 | Initial defect report |
