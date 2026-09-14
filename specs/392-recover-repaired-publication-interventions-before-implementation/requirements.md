# Defect Report: Recover repaired publication interventions before implementation

**Issue**: #392
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/390-read-only-owner-bound-implementation-scope-probe/

---

## Reproduction

1. Start an execute run whose start step passes and whose implement worker stops before product edits because the Approved task package uses recoverable `**Files**:` publication labels.
2. Preserve the failed intervention handoff, incomplete implement owner, execute checkpoint, and failure evidence.
3. Apply the #388 package-scoped publication-only repair so only the issue task document changes and selected detection converges to zero.
4. Run the #390 read-only owner-bound probe and observe a nonempty canonical implementation scope, including any explicit stale checkpoint branch discrepancy.
5. Run `sdlc-execute.mjs discover-recovery` or parameter-free `run` and observe `implementation_failed` remain blocked solely because the preserved handoff has `intervention: true`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Bare discovery proves the exact repaired-publication state without prose inference, returns the existing one-time recovery tuple/action, and bare run atomically consumes it before dispatching only `implement`. |
| **Actual** | Every failed intervention handoff blocks before canonical publication repair, owner binding, clean implementation scope, and byte-exact task-only change can be considered. |

## Acceptance Criteria

### AC1: Discover a safe repaired-publication intervention

**Given** a failed run, failed intervention handoff, and one incomplete recovery owner bind the same issue, implement step, run id, canonical project root, exact current HEAD, and actual owner branch
**And** an explicitly surfaced stale run branch is the only permitted branch discrepancy
**And** handoff artifacts are limited to the exact issue task document and derived controller/handoff evidence paths, with each controller handoff filename and payload issue/step derived from the current checkpoint queue/lifecycle, and claim no implementation output
**When** parameter-free bare recovery discovery runs
**Then** it continues only if the current owner-bound probe passes with a nonempty canonical `allowedPaths`
**And** it returns the existing one-time recovery tuple/action only after every remaining publication, worktree, evidence, lock, and consumption invariant passes

### AC2: Prove the exact canonical task repair

**Given** the run HEAD version and working-tree version of the singular Approved task document
**When** repair proof is evaluated through the supported publication detector
**Then** at least one detector-selected rewrite changes only the ASCII label token `**Files**:` to `**File(s)**:`
**And** applying only those selected token replacements to the run HEAD bytes yields the current bytes exactly, including line endings and every unrelated byte
**And** current selected publication detection contains no rewrite or finding
**And** the combined tracked diff from run HEAD contains only that task document and no staged change

### AC3: Bound implementation and workflow state

**Given** the owner-bound probe returns tracked writable and explicitly untracked evidence paths
**When** discovery inspects Git state
**Then** none of those allowed implementation paths is modified, staged, or untracked and no other tracked path differs from run HEAD
**And** arbitrary untracked or ignored files block recovery, including basename-only ignored files such as nested `.DS_Store`, unless the file occupies an exact documented bounded location
**And** preserved untracked workflow/failure evidence is accepted only through a closed structural ownership/evidence contract with exact documented paths, regular-file bounds, schema relations, and terminal session evidence
**And** no controller lock exists, no matching prior recovery record exists, and the matching owner remains incomplete

### AC4: Consume and dispatch exactly once

**Given** discovery returns the safe repaired-publication recovery
**When** parameter-free bare run acquires the existing controller lease
**Then** it re-proves the state at the mutation boundary, consumes one durable `repaired_publication_intervention` record, appends the existing run recovery tuple through checkpoint CAS, preserves the failed handoff and history, and dispatches only `implement`
**And** a controlled worker boundary can complete the resumed implement handoff without executing product implementation
**And** repeat discovery never offers the same recovery

### AC5: Reject adversarial states

**Given** any changed product path, arbitrary spec edit, unsupported publication rewrite, byte mismatch, staged change, wrong head, issue, step, run, root, branch, or owner, malformed handoff, controller handoff whose filename or payload issue/step is unrelated to the current checkpoint queue/lifecycle, claimed implementation output, empty or failed probe, controller lock, prior recovery record, complete owner, unproven untracked path, or basename-only ignored file outside an exact documented bounded location
**When** discovery runs
**Then** it remains blocked with stable structured evidence and performs no mutation

### AC6: Preserve existing recovery and public workflow behavior

**Given** existing resumable, consumed, exhausted-loop, stale-lease, retained-worker, and intervention fixtures
**When** relevant recovery and execute suites run
**Then** their behavior remains unchanged except for the newly proven repaired-publication state
**And** CONTRIBUTING, execute workflow documentation, README, and changelog describe the fail-closed one-time contract without a version bump

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Add a generic read-only repaired-publication classifier; do not parse handoff prose or special-case a repository, issue, branch, or evidence basename | Must |
| FR2 | Reuse #388 detector output for selected rewrite authority and exact byte reconstruction | Must |
| FR3 | Reuse #390 owner-bound probe for issue/run/owner/branch/scope binding | Must |
| FR4 | Require exact HEAD, task-only unstaged tracked state, no allowed implementation changes, controller handoffs whose filenames and payload issue/step derive from the current checkpoint queue/lifecycle, and a closed structurally validated workflow-evidence set that authorizes ignored files only at exact documented bounded locations | Must |
| FR5 | Consume one durable recovery record and one existing checkpoint recovery tuple under current lease/CAS semantics | Must |
| FR6 | Preserve failed handoff/history and dispatch only implement | Must |
| FR7 | Add exact consumer-like positive coverage, adversarial negatives, existing-loop/stale regressions, and a disposable controlled-worker exercise | Must |
| FR8 | Update required public/contribution/workflow/changelog surfaces with no version bump | Must |

## Out of Scope

- Product repository or installed-plugin mutation
- Parsing handoff summary prose
- Consumer, issue-number, branch-name, or basename exceptions
- Broad ignore of untracked or ignored files
- New recovery aliases or alternate run entry points
- Product implementation in tests or exercises
- Simplification, independent review, push, pull request, merge, issue closure, installation, or version bump

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #392 | 2026-09-14 | Initial approved defect report |
| #392 | 2026-09-14 | Approved amendment: shared recovery API scope and stricter handoff/ignored-file bounds |
