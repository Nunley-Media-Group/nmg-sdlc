# Defect Report: Reconcile independently merged failed-deliver checkpoint

**Issue**: #409
**Date**: 2026-09-22
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/374-recover-bounded-automatic-delivery-stops-without-loops/

---

## Reproduction

A prior single-issue execute run retains `run.json` with `failed.step = deliver`, `failed.reasonCode = merge_failed`, and a failed deliver handoff. Its recorded PR has since merged at exactly the recorded head, the issue is closed, and the merge commit is an ancestor of the clean default checkout. Explicit execution of a different approved issue returns `Run checkpoint identity mismatch`; recovery discovery instead sees the old issue branch mismatch. Reproduce without changing the retained MileDar evidence.

## Expected vs Actual

| | Description |
|---|---|
| **Expected** | The new explicit issue can start after the controller independently proves the former issue is completely delivered and archives the unmodified failure evidence. |
| **Actual** | A failed checkpoint remains an unconditional issue-list mismatch even after exact external completion. |

## Acceptance Criteria

### AC1: Strict prior-run reconciliation

**Given** one bound failed-deliver checkpoint for a distinct explicitly selected issue, with exact recorded PR number and expected head
**When** that same PR is `MERGED` at that head, its recorded issue is `CLOSED`, its merge commit is an ancestor of the current default checkout, and the checkout is clean
**Then** admission releases only that stale checkpoint and proceeds through normal fresh-run creation
**And** the prior run, PR, issue, branch, head, revision, failure, and delivery identity are consistent and no controller lock or live/foreign worker owner exists.

### AC2: Immutable forensic evidence

**Given** valid reconciliation proof
**When** the old checkpoint is released
**Then** its exact checkpoint bytes and failed deliver handoff and available verification/handoff evidence remain in a durable, run-identified archive with the reconciliation proof
**And** no passed handoff is forged, prior failure rewritten, or unrelated runtime evidence removed
**And** cleanup is guarded by lock plus byte/revision identity comparison so races and archive collisions block rather than erase evidence.

### AC3: Fail closed

**Given** absent or ambiguous identity/proof, another PR or changed head, open issue, unmerged PR, merge commit not on the default checkout, dirty/foreign checkout, lock, live owner, malformed checkpoint, or incomplete archive
**When** another issue is selected
**Then** admission remains blocked and retains original checkpoint and supporting evidence, without starting workers or making remote mutations.

### AC4: Regression and bounded consumer proof

**Given** the change is installed in a disposable consumer
**When** the positive and rejected variants execute
**Then** focused and full script tests, surface/skill exercises, candidate doctor and read-only MileDar inspection report exact evidence; registered smoke uses fresh approved fixtures only and stops on unchanged/no-progress failures.
