# Root Cause Analysis: Reconcile closed issue controller runs

**Issue**: #425
**Date**: 2026-09-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/409-reconcile-independently-merged-failed-deliver-checkpoint/

## Root cause

Explicit admission rejects a different issue before it can distinguish a genuinely unfinished old implementation from independent terminal delivery. The #409 predicate only admits a completed-through-verify failed delivery with a recorded delivery tuple. A cancelled implement checkpoint has no delivery tuple, although immutable run/owner/handoff bytes and GitHub closure can establish terminal delivery independently.

## Design

Extend only explicit different-issue preflight. Keep #409's recorded `merge_failed` path, but classify cancelled pre-delivery and other failed-deliver checkpoints separately with one old issue and no active worker or remediation. Read strict handoff slots, including generated review handoffs and referenced historical recovery handoffs, the safe recovery ledger, and bounded owner-proven standalone sessions without following symlinks; bind every implicated owner, recovery record and session delivery tuple to the old run/PR/head, preserving the original ledger byte-for-byte. Query read-only issue/closing-PR evidence and reject zero, multiple or truncated closing relations. Verify issue CLOSED, PR MERGED, repository-qualified closing reference, head SHA, issue-prefixed branch, base default, merge SHA, checkpoint ancestry to the exact PR head and merge ancestry on the clean default checkout. Squash merges need not retain the PR head or checkpoint in default history. Do not infer successful implementation from a passed handoff or commit alone.

The active controller lease is acquired before reconciliation; foreign/live leases and Herdr agents block. Build an exclusive run-id archive with raw checkpoint, handoffs, ledger, implicated standalone sessions, referenced history and review/verification files, SHA-256 per file and a receipt describing exact remote/local proof. Recheck source file identities and bytes under `run.json.lock`, archive contents and Git state before unlinking the pointer. A partial/colliding archive blocks release. Original handoffs, sessions, verification, reviews and safe ledger stay untouched; a fresh run uses the normal explicit issue path. A rerun sees the receipt and does not reconcile again.

## Scope and risks

`scripts/sdlc-execute.mjs` owns admission and archive; `scripts/sdlc-safe-recoveries.mjs` validates the archived ledger shape without writing it. `scripts/__tests__/sdlc-execute.test.mjs` owns deterministic consumer-backed positive and negative fixtures. No background service, force operation, worker replay, synthetic delivery or remote write. A closed issue alone or a merged PR alone is insufficient. Symlink, partial evidence and changed proof stop without deleting originals. The archive may be left partial on I/O failure, but the pointer remains; an operator can inspect it without automatic overwrite.

## Verification

Reproduce the pre-fix mismatch in the disposable #206 retained-byte fixture, then exercise successful ordinary next-issue admission and fail-closed variants. Snapshot the live #217 failed-deliver run, all root handoffs and owner-proven session bytes with source hashes; stub GitHub/Herdr and adapt only project-root identity in an isolated fixture to prove PR #230 closure and #218 next-worker eligibility without touching PennyScan. The fixture synthesizes a root-adapted minimal ledger and canonical verification artifact while retaining their live source digests as provenance; it never claims those two synthesized files match live bytes. Run the focused and full script suite, candidate install, registered smoke, exact-head PR review/checks and pinned install; reserve actual `/sdlc-execute #218` for the post-install parent acceptance.
