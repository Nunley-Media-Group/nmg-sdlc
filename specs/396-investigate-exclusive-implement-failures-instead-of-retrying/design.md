# Root Cause Analysis: Investigate exclusive implement failures instead of retrying

**Issue**: #396
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/372-restore-bounded-operator-authorized-recovery-of-stopped-delivery/

## Root Cause

The existing repaired-publication recovery proves exact HEAD and a narrow tasks-file discrepancy. It cannot accept a normal exclusive implement worker that committed authorized work before failing. The general recovery path therefore interprets the descendant current HEAD as a checkpoint mismatch. Separately, `inspectPublicationScope` marks `specs/` read-only before considering whether the approved implement task explicitly creates its verification report.

## Recovery Classifier

Add `EXCLUSIVE_IMPLEMENT_RESUME = 'exclusive_implement_resume'` and export `inspectExclusiveImplementResume({ cwd, checkpoint, handoff, run, allowOwnedLease })` beside `inspectRepairedPublicationIntervention`.

The classifier must prove:

1. The checkpoint is an incomplete execute run at implement.
2. The worker map is empty.
3. Exactly one incomplete safe-recovery owner exists, with `ownerId === runId` and implement identity.
4. Current branch is the issue branch.
5. `git merge-base --is-ancestor checkpoint.head checkout.head` succeeds; failure is `checkpoint_head_mismatch`.
6. The implement handoff is readable and failed, whether `intervention` is true or false.
7. No recovery tuple for the same run, issue, step, and `exclusive_implement_resume` class was consumed.
8. Lease evidence satisfies the same unowned or owner-bound proof used by repaired publication.

Return `{ class, issue, step: 'implement', runId, ownerId, branch, head: checkout.head, handoff, handoffPath, handoffDigest, handoffIdentity, scope, discrepancies }`.

Discovery order is repaired publication first, exclusive implement resume second, and the existing intervention block last. Exclusive discovery evidence is `{ ownerId, head, checkpointHead: checkpoint.head, discrepancies }`. Discovery never mutates files.

## Exclusive Resume Prompt

Export `exclusiveResumePrompt({ issue, cwd, controllerRunId, checkpointHead, currentHead, branch, handoff })` next to `remediationPrompt`. Do not reuse remediation text because remediation instructs the worker to rerun the failed step contract.

The prompt begins:

```text
You are resuming exclusive implement for issue #N after the prior worker closed.
This is not a fresh implement and not a remediation retry.
```

It includes checkpoint/current HEAD, branch, failed reason, summary, and artifact lines. Before edits it requires reading the four approved spec artifacts, current and archived handoffs, Git log/diff/porcelain, then mapping every tasks acceptance bullet to satisfied, remaining-authorized, or blocked. It forbids reimplementation, reset, rebase, and discard. If the only remaining work is the same currently forbidden prerequisite, it writes a failed intervention handoff without an empty or duplicate product commit. Otherwise it completes only remaining authorized work and follows existing simplify, publication, reconciliation, and passed-handoff gates. It never asks, never uses remediation identity, and appends the existing implement `workerPrompt` contract.

## Recovery Consumption and Dispatch

Generalize the repaired recovery branch to accept `repaired_publication_intervention` and `exclusive_implement_resume`, only for parameter-free recovery. Under the lease:

1. Re-read the latest matching checkpoint.
2. Re-run the matching inspector with `allowOwnedLease: true`.
3. Archive the failed handoff read-only under the class-specific history directory. Exclusive archives use `.omp/sdlc/history/exclusive-implement-resume/{issue}-implement-{digest}.json`.
4. Consume safe recovery for the proven class.
5. Append a recovery tuple whose source records class, archive, pre-CAS `checkpointHead`, `currentHead`, and failed handoff.
6. Set `runState.head = proof.head`, clear `failed`, delete remediation, and persist.
7. Set `recoveryDispatch` to `${issue}:implement`.

When the pending worker is `s${issue}-implement` and the invocation-local recovery dispatch points to implement with latest recovery source class `exclusive_implement_resume`, render `exclusiveResumePrompt`. Repaired publication continues to use ordinary `workerPrompt`. Never create remediation state or `rN-implement` for exclusive resume.

## Publication Scope

Inside `inspectPublicationScope`, before the general `specs/` read-only branch, recognize only the exact `${spec}/verification-report.md` operation. A non-read-only Create/Modify operation is tracked writable; an explicitly untracked operation follows the existing untracked classification. Continue immediately. The exception exists only when the exact path is declared in approved `tasks.md`; all other spec paths remain read-only.

## Failure Boundaries

Wrong branch, live worker, absent or ambiguous owner, non-ancestor HEAD, unreadable handoff, mismatched lifecycle identity, unsafe worktree scope, lease conflict, or consumed recovery remains blocked. No branch rewrite or product rollback is permitted. Persistence precedes dispatch; ambiguous dispatch cannot be reconstructed into a second allowance.

## Verification

Focused Jest fixtures create commit A as checkpoint and clean descendant commit B as current HEAD. They prove read-only discovery, one `s81-implement` exclusive prompt, archived handoff, checkpoint CAS, consumed no-replay, repaired-publication compatibility, adversarial blocks, and writable verification-report scope. Run `cd scripts && npm test -- sdlc-execute.test.mjs`.
