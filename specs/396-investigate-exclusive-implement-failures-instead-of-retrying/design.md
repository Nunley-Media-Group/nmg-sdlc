# Root Cause Analysis: Investigate exclusive implement failures instead of retrying

**Issue**: #396
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/372-restore-bounded-operator-authorized-recovery-of-stopped-delivery/

## Root Cause

The existing repaired-publication recovery proves exact HEAD and a narrow tasks-file discrepancy. It cannot accept a normal exclusive implement worker that committed authorized work before failing. The general recovery path therefore interprets the strict-descendant current HEAD as a checkpoint mismatch. Issue #398 separately replaced File(s)-based publication authorization with outcome policy, so this recovery must consume that policy rather than recreate a verification-report allowlist.

## Recovery Classifier

Add `EXCLUSIVE_IMPLEMENT_RESUME = 'exclusive_implement_resume'` and export `inspectExclusiveImplementResume({ cwd, checkpoint, handoff, run, allowOwnedLease })` beside `inspectRepairedPublicationIntervention`.

The classifier must prove:

1. The checkpoint is an incomplete execute run at implement.
2. The worker map is empty.
3. Exactly one incomplete safe-recovery owner exists, with `ownerId === runId`, implement identity, and a nonempty planned subject.
4. Current branch is the issue branch.
5. Current HEAD differs from checkpoint HEAD and `git merge-base --is-ancestor checkpoint.head checkout.head` succeeds.
6. The range contains exactly one single-parent commit whose parent is checkpoint HEAD and whose subject equals the owner's planned subject.
7. Every observed commit path passes the outcome-policy denied-path classifier.
8. The implement handoff is readable, failed with `implementation_failed`, and has boolean intervention plus null next.
9. The owner-bound probe reports `mutationPolicy: outcome`, the four Approved inputs in `readOnlyPaths`, matching branch/owner identity, and no discrepancy except the stale checkpoint branch.
10. No recovery tuple for the same run, issue, step, and `exclusive_implement_resume` class was consumed.
11. Lease, controller-state, clean tracked/untracked state, ignored implementation paths, bounded workspaces, and terminal goal evidence satisfy the repaired-publication safety predicates.

Return `{ class, issue, step: 'implement', runId, ownerId, branch, head, publicationPaths, workflowEvidencePaths, handoff, handoffPath, handoffDigest, handoffIdentity, scope, discrepancies }`.

Discovery order is repaired publication first, exclusive implement resume second, and the existing intervention block last. Exclusive discovery evidence includes owner, checkpoint/current HEAD, observed publication paths, and discrepancies. Discovery never mutates files.

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
5. Append a recovery tuple whose source records class, archive, pre-CAS `checkpointHead`, `currentHead`, observed publication paths, workflow evidence, and failed handoff.
6. Set `runState.head = proof.head`, clear `failed`, delete remediation, and persist through the old-head CAS.
7. Set `recoveryDispatch` to `${issue}:implement`.

When the pending worker is `s${issue}-implement` and the invocation-local recovery dispatch points to implement with latest recovery source class `exclusive_implement_resume`, render `exclusiveResumePrompt`. Repaired publication continues to use ordinary `workerPrompt`. Never create remediation state or `rN-implement` for exclusive resume.

## Outcome Publication Integration

Exclusive recovery does not grant paths from task File(s). It requires the probe's `mutationPolicy: outcome`, preserves the four current spec inputs in `readOnlyPaths`, and validates the observed implementation commit through `publicationPathDenied`. The current verification report remains publishable under issue #398 even when omitted from File(s); every other `specs/` path remains denied.

## Failure Boundaries

Equal or non-ancestor HEAD, multiple or merge commits, a non-owner subject, denied commit paths, wrong branch, live worker, absent or ambiguous owner, unreadable or mismatched handoff, dirty tracked/untracked work, unsafe ignored implementation state, invalid terminal evidence, lease conflict, or consumed recovery remains blocked. No branch rewrite or product rollback is permitted. Persistence precedes dispatch; ambiguous dispatch cannot be reconstructed into a second allowance.

## Verification

Focused Jest fixtures create commit A as checkpoint and one owner-subject commit B as current HEAD. They prove read-only discovery, observed non-denied paths, one `s81-implement` exclusive prompt, archived handoff, checkpoint CAS, consumed no-replay, repaired-publication compatibility, outcome-scope integration, ignored-state safety, and adversarial equal/multiple/merge/subject/path blocks. Run focused execute and safe-recoveries suites, then the complete repository suite.
