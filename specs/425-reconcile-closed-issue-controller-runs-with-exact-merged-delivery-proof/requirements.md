# Defect Report: Reconcile closed issue controller runs with exact merged delivery proof

**Issue**: #425
**Date**: 2026-09-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/409-reconcile-independently-merged-failed-deliver-checkpoint/

## Reproduction

PennyScan #206 retained controller run `52a802ac` at `implement` with `controller_cancelled` and an incomplete safe-recovery owner. PR #208 independently merged at head `626daed9eeab2254c77ebe96028df026d705248f`, merge `b853c36dddfd242341852ce3a7e35d26e2718303`, and closed #206. An explicit next issue hit the active checkpoint mismatch. Use the retained bytes as a read-only source for an isolated fixture, not the live PennyScan runtime.

## Expected versus actual

The controller should release the stale pointer only after proving terminal delivery on the clean current default branch and preserving the exact failed run and its ownership evidence. Currently #409's narrow reconciliation requires `deliver`/`merge_failed`, a recorded `delivery` tuple and a failed deliver handoff; it cannot classify a cancelled pre-delivery run.

## Acceptance criteria

### AC1: Exact terminal proof

For an explicit different issue, require a singular bound old issue and current failed stage, including a failed delivery without #409's recorded `merge_failed` tuple, exact CLOSED issue, a unique merged closing PR whose head branch starts with the old issue number, exact full PR head SHA, base equal to the repository default branch, and full merge SHA. Require a clean current default checkout, local ancestry from checkpoint head to the exact PR head, and ancestry from merge commit to the default checkout; squash merges need not retain the PR head or checkpoint in default history. Missing, conflicting or multiple closing PRs, stale checkout, unresolved worker/lease or ambiguous old queue block.

### AC2: Immutable evidence and ordinary next dispatch

Before removing only `run.json`, archive the raw checkpoint, all expected strict handoffs, implicated verification/review and historical recovery artifacts, recovery-owner ledger entries and owner-proven standalone session bytes byte-for-byte, with SHA-256 manifest and immutable receipt binding issue, PR, head, branch, base, merge, checkout and run identity. Keep original evidence and unrelated owners/records in place; never forge a pass or consume a recovery. Under the owned controller lease, compare original bytes and identities again before release; then start the requested issue through normal admission and worker dispatch.

### AC3: Fail closed

For an unreadable or symlinked path, malformed or missing evidence, dirty worktree, non-default checkout, ambiguous issue/PR/owner or conflicting standalone session/post-merge observation, live or foreign worker or lease, changed bytes, archive collision, missing ancestry or partial archive, leave active pointer and supporting evidence unchanged and dispatch nothing. Report the failed proof and a concrete safe read-only/operator action when known. No force, remote mutation, or old worker replay.

### AC4: Idempotence

A repeated invocation after successful release sees the durable receipt; it neither duplicates archive/PR/recovery consumption nor restarts the closed issue. A failed archive before release remains a blocker rather than silent cleanup.

### AC5: Consumer reproduction and verification

Deterministic isolated tests based on PennyScan #206's retained run, owner ledger, handoff and PR #208 show the old mismatch and new archive/next-dispatch behavior, plus unsafe variants. Immutable byte/hash snapshots of the current PennyScan #217 failed-deliver `run.json` and all handoffs, with owner/recovery evidence and exact PR #230 CLOSED proof, exercise the same #218 preflight and ordinary next-worker dispatch in isolation. The live #217 runtime remains read-only and unchanged; the post-install parent acceptance owns actual `/sdlc-execute #218`. Run focused and full tests, candidate install, registered smoke, PR checks/review and clean pinned install first.
