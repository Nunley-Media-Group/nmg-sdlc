# Root Cause Analysis: Recover bounded automatic delivery stops without loops

**Issue**: #374
**Date**: 2026-09-07
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/372-restore-bounded-operator-authorized-recovery-of-stopped-delivery/

---

## Root Cause

Stage helpers treat recoverable Git/GitHub/review outcomes as terminal intervention or fabricated success. `runReviewMain` rewrites empty artifacts to `No findings.\n` and passes. Missing artifacts share `review_failed`. `reviewProtocolPrompt` assigns files in prose and launches three task-tool reviewers inside one sibling OMP worker whose cwd is the full project; `herdr.agentStart` accepts only `{ name, paneId, kind: 'omp' }` with no path allowlist. A union of all reviewers' files (or findings that merely name paths) cannot detect the observed out-of-assignment read (BDD files from a CLI-assigned slice) while `bash`/`eval` remain available.

`finalizeVerification` and `runApplyReview` commit then push only while the path is dirty. A successful commit plus failed push leaves a clean ahead branch that later fails closed. Write-code publication in `workflows/write-code/WORKFLOW.md` has the same commit-then-push shape.

`classifyPrDeliveryState` already returns remediable `mergeability_defect` for `BEHIND`/`DIRTY`/`CONFLICTING`. Deliver remediates only `checks_failed` and `review_threads_unresolved`, so mergeability becomes `merge_failed` without inspecting actual base/head/conflicts. Bot `CHANGES_REQUESTED` is collapsed to `human_review`. One post-merge observe fails `merge_failed` while identity is settling.

Installed `#372` (reviewed `bda2935`) stores one exhausted-run allowance in `run.json` `recoveries[]` keyed by `runId`+`issue`+`step`, consumed by bare `/sdlc-execute` with no flags. There is no `--retry-stopped`. `#369` uses `remediation.completedAttempts`. This issue must not write substitute exhausted-run records into `recoveries[]` or increment `#369` attempts.

Standalone `sdlc-finalize-verification.mjs` / `sdlc-deliver.mjs` use `enterControllerLease({ runId: controllerRunId })` and must not fabricate execute `run.json`.

### Affected Code

| File | Role |
|------|------|
| `scripts/sdlc-review-main.mjs` | Empty rewrite to `No findings.\n` |
| `scripts/sdlc-execute.mjs` | Review protocol, paneSplit cwd, persistRunState, `#369` loop, `#372` `recoveries[]` on reviewed tree |
| `scripts/sdlc-apply-review.mjs` | Dirty-only commit+push; empty findings treated as fix no-op |
| `scripts/sdlc-finalize-verification.mjs` | Dirty-only report commit+push; standalone lease |
| `scripts/sdlc-deliver.mjs` | mergeability → merge_failed; bot → human_review; one observe; standalone lease |
| `scripts/pr-delivery-state.mjs` | Classifier already remediable for mergeability and changes_requested |
| `scripts/sdlc-controller-lease.mjs` | `enterControllerLease`; standalone acquires UUID runId |
| `workflows/write-code/WORKFLOW.md` | Implement commit then `git push` |
| `scripts/__tests__/sdlc-review-main.test.mjs` | Pins empty→pass |

### Triggering Conditions

- A file-assigned nested reviewer can read paths outside its slice because the worker cwd is the full repo.
- Empty or missing review artifact.
- Report/fix/implement commit exists, worktree clean, branch ahead of `@{u}`.
- Classifier `mergeability_defect` for `BEHIND`, `DIRTY`, or `CONFLICTING`.
- Bot `CHANGES_REQUESTED` or pathless automation thread.
- Merge/close command returned or transport-failed and the next read is not exact MERGED+CLOSED.

---

## Fix Strategy

### Approach

Add `.omp/sdlc/safe-recoveries.json` as the durable owner for `#374` classes. Do not create execute `run.json` from standalone finalizer/deliver. CAS-write the file the same way `persistRunState` CAS-writes `run.json` (lock + expected revision). Each record:

```json
{
  "class": "invalid_review_slice",
  "runId": "<lease-or-execute-runId>",
  "issue": 374,
  "step": "review1",
  "invocationId": "<uuid>",
  "consumedAt": "<ISO>",
  "disposition": "consumed",
  "evidence": {}
}
```

**Allowance key is exactly `class` + `runId` + `issue` + `step`.** At most one consumed record per that tuple. `evidence` (head SHA, base SHA, spec digest, slice snapshot ids, commitSha, mergeStateStatus, assignment) is revalidation material only. If current evidence does not match stored evidence, stop fail-closed; do **not** insert a second record. Changing head, reason, scope, version, summary, or plugin does not replenish.

`runId` is `run.json.runId` when an execute checkpoint exists and the lease `runId` matches it. Otherwise `runId` is the controller lease `runId` from `enterControllerLease`. Standalone `--controller-run-id` uses that id. Standalone without execute never writes `run.json`.

Do not append to `#372` `recoveries[]`. Lookup of exhausted-run remains `recoveries.find(runId, issue, step)` with no `class` field. Ordinary explicit-queue reinvocation and `--recover-stale` still do not grant `#372` allowances; only the installed bare-execute transition does.

Consume under the lease **before** side effects. Persistence failure dispatches nothing.

### Composed finite bounds

- `invalid_review_slice`: one replacement for the **entire** `review1` or `review2` step for that run, not per nested slice and not per head.
- `stage_publication` (implement / fix1 / fix2 / verify): one push-or-ack of a known commit per step.
- `mergeability_defect`: one reconciliation attempt per deliver step for that run. After a content or base change, invalidate completed `review1`/`fix1`/`review2`/`fix2`/`verify` for that issue (do not delete their artifacts) and re-run **all** those gates on the new head. That re-entry does not mint new `invalid_review_slice` or `mergeability_defect` allowances. Stale review approvals must not be retained.
- `automatic_review` and `post_merge_observation`: one consume each per deliver step.
- `#369` two-attempt remediation and `#372` `recoveries[]` stay isolated; `#374` actions do not increment them.
- Progress for work-dispatching `#369` remains `currentStep`/`completed` advancement. New SHA/wording/PID/time is not `#369` progress and is not a new `#374` allowance.
- Re-entry to verify/deliver after mergeability is composed under already-consumed keys, not a new epoch.
- Identical `NMG_SDLC_REMEDIATION` fingerprints are not re-emitted.
- Healthy jobs have no wall-clock deadline (`#286`). `POLL_INTERVAL_MS` (30000) is an observe interval, not a failed command.

### Stop-class inventory (AC1)

Disposition is proof-based. A newly observed class with known-outcome settlement is safe; it is not forced to intervention by default.

| Family | Current | Disposition |
|--------|---------|-------------|
| Lease held / stale-lease | `controller_lease_held`; `#328`/`#339` | Existing adequate |
| Cancel / process-loss / supervisor | `#369` cleanup | Existing adequate |
| Live/unreadable ownership | `retained_worker_mismatch`, `unknown_pane` | Required intervention |
| Positively absent recorded pane / `pane_close_failed` when Herdr list proves the recorded `(name,paneId)` absent | `#372` `absentWorkers` reconcile, do not claim closed | **Safe settlement** (existing `#372` in `bda2935`): record `absentWorkers`, drop live ownership, do not replay pane-close. Ambiguous/reused pane remains intervention |
| Checkpoint identity mismatch | persist CAS | Required intervention |
| Unrelated dirty_tree | `dirty_tree` | Required intervention |
| Missing/invalid handoff | `missing_handoff`, `invalid_handoff` | Required intervention |
| `#369` remediation_loop | two attempts no stage advance | Existing adequate; do not refill |
| `#372` exhausted-run | `recoveries[]` one-shot via bare execute | Existing adequate; do not refill; do not add `--retry-stopped` |
| Dependency graph / spec authority / credentials | fail-closed | Required intervention |
| Implementation remediable fail | `#366` | Existing adequate |
| Implement publication: commit exists, push missed, clean ahead with only implement paths | `implementation_failed` | **Safe** `stage_publication` on `implement`: push known commit or ack exact upstream; never duplicate commit/force |
| Apply-review publication: same for `fix: apply reviewN findings` | `apply_review_failed` | **Safe** `stage_publication` on `fix1`/`fix2` |
| Apply-review missing review artifact | `review_artifact_missing` | Required intervention |
| Review picker / base missing | `review_failed` | Required intervention |
| Invalid review slice (out-of-assignment **host-prevented or host-proven** read) | whole-step `review_failed` | **Safe** one replacement per review step |
| Empty review | rewrite pass | **Required intervention** `review_empty` |
| Missing review | `review_failed` | **Required intervention** `review_artifact_missing` |
| Exact written `No findings.` | pass | Existing adequate |
| Review scope unproven (no snapshot isolation, missing host proof) | pass or review_failed | **Required intervention** `review_scope_unproven`; not a pass; not a slice replacement |
| Verify Fail/Partial | `#354` | Existing adequate; never flip to Pass |
| Verify Incomplete | intervention | Existing adequate |
| Verify publication commit+no push or exact upstream | `verification_publish_failed` | **Safe** `stage_publication` on `verify` |
| Unexpected dirty/divergent publish | `verification_publish_failed` | Required intervention |
| Pending CI | pending loop | Existing adequate |
| Checks failed / path-bearing bot threads | `NMG_SDLC_REMEDIATION` | Existing adequate |
| Contribution-gate unchanged body | `contribution_evidence_incomplete` | Existing adequate |
| `mergeability_defect` BEHIND/DIRTY/CONFLICTING | `merge_failed` | **Safe inspect-and-reconcile** once; unresolved/unsafe leftover → intervention with evidence, not enum-only stop |
| Human CHANGES_REQUESTED / human threads | `human_review` | Required intervention |
| Bot CHANGES_REQUESTED | `human_review` | **Safe** automatic attribution |
| Pathless automation | `human_review` | **Safe** classify as `automatic_review_unactionable`, not human |
| Post-merge observe / transport | one-shot `merge_failed` | **Safe** bounded read-only reconcile |
| Merged PR, issue open | `merge_failed` | After reconcile: proven workflow close or `merged_pr_child_still_open` |
| Exact-head CAS mismatch | `delivery_reconciliation_required` | Existing adequate |
| Historical intervention records | stop | Existing adequate; not eligibility |
| Smoke `#96` | n/a | Forbidden replay |

Additional families found in implementation get a proof-based row (safe with preconditions, existing adequate, or intervention with rationale). They must not narrow this issue to review-only.

### Review slices (AC2) — prevent, then replace once

`herdr.agentStart` has no path allowlist. Scanning findings filenames, self-attested compliance flags, or `read`/`grep` argv while the same worker still has `bash`/`eval` against the project cwd is **not** certification.

**Prevention (required for a passing review):**

1. Partition the merge-base diff so each changed path belongs to exactly one slice (`reviewer-1`..`reviewer-3`). Do not use the union of all reviewers' files as any slice's allowlist (that allowed the BDD-vs-CLI violation).
2. Bind metadata: issue, step, immutable `baseSha`, `headSha`, spec digest (hash of the four spec files at `headSha`), `sliceId`, exact `allowedPaths`, `invocationId`. Persist as `.omp/sdlc/reviews/<N>-<step>.assignment.json` and never rewrite `allowedPaths` on replacement.
3. Materialize an immutable snapshot **outside the project tree** (`fs.mkdtempSync` under the process temp dir, name `nmg-sdlc-review-<runId>-<issue>-<step>-<sliceId>`). Copy only `allowedPaths` at `headSha` into that directory. Do not place the snapshot under the repo (parent `..` would escape to the project).
4. Launch each slice via existing Herdr `paneSplit({ direction, cwd: snapshotDir })` then `agentStart({ name, paneId, kind: 'omp' })`. Pane cwd is the snapshot; out-of-assignment paths are absent. Full-file context is only files copied into that snapshot.
5. Record pane id, snapshot path, and assignment identity in `safe-recoveries` evidence / assignment JSON. Slice workers do not write the canonical step handoff.

If paneSplit `--cwd` cannot be set to the snapshot (Herdr failure) or the started agent's cwd is not that directory, do not pass the review. Reason `review_scope_unproven`, intervention true. Do not invent an OMP SDK path-allowlist. Do not accept a model-written "I only read assigned files" receipt.

**Contamination:** a slice pane whose cwd is the project, or any host-recorded filesystem access (Herdr/OMP integration events, if present) whose path is outside that slice's snapshot. Findings text naming extra paths is not a read.

**On first proven contamination or first failed isolation for that step:** consume `invalid_review_slice` for `class/runId/issue/step`. Do **not** unlink or rewrite the original `.omp/sdlc/reviews/<N>-<step>.md` or `.omp/sdlc/handoffs/<N>-<step>.json`. Write `.omp/sdlc/reviews/<N>-<step>.invalidation.json` `{ reason, invocationId, originalArtifact, originalHandoff, at }`. Launch at most one replacement of **all** slices for that step with the **same** assignment JSON (same allowedPaths). Replacement artifacts go to `.omp/sdlc/reviews/<N>-<step>.attempt-2.md` and `.omp/sdlc/handoffs/<N>-<step>.attempt-2.json`. Execute consumes attempt-2 as current; originals remain bytes-identical.

Second contamination or replacement failure: fail `invalid_review_slice` intervention. Do not convert historical intervention/invalidation files into a pass.

Reuse a slice result only when `baseSha`, `headSha`, spec digest, `sliceId`, and `allowedPaths` all match exactly and isolation cwd proof exists. "Discard offending evidence" in AC2 means do not use it as the current passing artifact; it does not mean delete files.

### Empty or missing review (AC3)

`runReviewMain`:

1. `--result review_failed` → `review_failed` (unchanged).
2. Missing file → `review_artifact_missing`; do not create the file.
3. Trim empty → `review_empty`; do not write `No findings.\n`.
4. Trim equals `No findings.` → pass as today.
5. Non-empty findings → pass through to fix.

`runApplyReview` may keep empty/`No findings.` as zero-git for the **fix** step. Empty review must not reach it.

### Stage publication (AC4 and apply-review/write-code)

Shared rule `reconcileStagePublication({ cwd, issue, step, expectedSubject, allowedPaths })`:

- Unexpected dirty paths → fail intervention (existing reason for that step).
- Clean and `@{u}...HEAD` is `0 0` and HEAD contains the expected tree → pass (ack).
- Clean, branch is `N-*`, `behind=0`, `ahead>=1`, every ahead commit subject matches `expectedSubject` and touches only `allowedPaths` → consume `stage_publication` for that step; `git push` without force and without a new commit. Success + `0 0` → pass. Push fail → existing failed reason; no second consume.
- Any other divergence → fail closed.

Subjects: implement = the existing conventional implement subject; fix1/fix2 = `fix: apply review1 findings for #<N>` / `review2`; verify = `docs: record verification for #<N>`; deliver-side PR evidence = `docs: record PR evidence for #<N>`.

Never change Fail/Partial/Incomplete to Pass.

### Mergeability (AC5)

Do not `merge_failed` only because checks/threads handlers missed. Do not stop solely because `mergeStateStatus === 'CONFLICTING'`.

When classifier status is `remediate` and reason is `mergeability_defect` for `BEHIND`, `DIRTY`, or `CONFLICTING`:

1. Consume `mergeability_defect` once.
2. Fetch default branch (`gh repo view` defaultBranchRef, same helper as today).
3. Inspect actual divergence: `git merge-base`, `git rev-list`, and a no-commit trial (`git merge --no-commit --no-ff` in a throwaway or `git merge-tree`) to list conflicted paths. Abort the trial; do not leave the issue branch mid-merge on failure.
4. **Safe in-scope:** every conflicted path (if any) is inside the approved delivery changed-path set, and the trial merge produces a tree with **no remaining conflict markers**. Then perform that merge on the issue branch (no `-X ours/theirs`, no force-push). Push without force. CAS-update `delivery.expectedHead`.
5. **Unsafe/unresolved:** any conflicted path outside approved scope, leftover markers, merge failure, or unreadable inspection → restore/abort, fail intervention `mergeability_defect` with the inspected path list in the summary. Do not resolve hunks by hand or policy.
6. GitHub `DIRTY` with unrelated **local** porcelain remains `dirty_tree`, not this class.

If step 4 produced a new HEAD (content or base change): do not merge the PR. Mark `review1`,`fix1`,`review2`,`fix2`,`verify` incomplete for that issue without deleting their files. Set `currentStep` to the first incomplete gate (`review1` if reviews existed). Re-run those gates on the new head. This is not a `#369` deliver remediation and does not mint new `#374` keys. Stale passed review handoffs are not reused.

### Automatic vs human review (AC6)

Carry `authorLogin` and `authorTypename` on review snapshots. `isBot` = `typename === 'Bot'` or login in `configuredBotLogins` (`coderabbitai` plus steering `logins`).

1. Human unresolved thread or non-bot `CHANGES_REQUESTED` → `human_review`. Never resolve human threads.
2. All-bot `CHANGES_REQUESTED` / all-bot threads: consume `automatic_review`. Path-bearing bot threads → existing `NMG_SDLC_REMEDIATION`. Pathless → `automatic_review_unactionable`, not `human_review`.

### Post-merge (AC7)

After squash `--match-head-commit` or generic merge/close transport: consume `post_merge_observation`. Read-only observe up to 3 times at `POLL_INTERVAL_MS`. Never re-issue merge. Never close a non-expected issue.

- Exact MERGED + expected head + CLOSED → pass.
- MERGED + expected head + issue OPEN after budget: `gh issue close` only with proven linkage and authorized delivery scope; else `merged_pr_child_still_open`.
- Still not MERGED at expected head after budget → `merge_failed`.

Completed-delivery re-entry uses the same bounded read-only reconcile.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-safe-recoveries.mjs` (new; no equivalent exists) | CAS file owner for class/runId/issue/step | Standalone + execute without fabricating run.json |
| `scripts/sdlc-execute.mjs` | Snapshot panes; invalidation without delete; gate invalidation after mergeability; do not touch `recoveries[]` | AC2, AC5, AC8, `#372` |
| `scripts/sdlc-review-main.mjs` | `review_empty` / `review_artifact_missing` | AC3 |
| `scripts/sdlc-finalize-verification.mjs` | Stage publication reconcile; use lease runId + safe-recoveries.json | AC4, AC8 |
| `scripts/sdlc-apply-review.mjs` | Same publication reconcile | AC1/AC4 |
| `workflows/write-code/` | Same publication reconcile after skill-creator | AC1 |
| `scripts/sdlc-deliver.mjs` | Inspect mergeability; bot vs human; post-merge observe; standalone safe-recoveries | AC5–AC7 |
| `scripts/pr-delivery-state.mjs` | Author typename/login on reviews | AC6 |
| Tests + workflow exercises + fresh smoke | See tasks T003–T004 | AC10 |

### Blast Radius

Direct: review launch, publication resume, deliver classify/merge/close, execute completed-step invalidation. Indirect: `#208` empty rewrite, `#282` publish, `#372` `recoveries[]`, `#369` attempts, `#354` verify rem, `#195` exact-head. Risk: High if keys include head SHA or `recoveries[]` is reused.

---

## Regression Risk

| Risk | Mitigation |
|------|------------|
| Head change refills slice replacement | Key excludes head; test second head does not add a record |
| `#372` recoveries length grows | Assert `recoveries` unchanged on `#374` actions |
| Empty review still passes | Delete rewrite test; assert `review_empty` |
| Findings-text treated as reads | Isolation cwd test; prose extra paths with snapshot isolation still pass |
| CONFLICTING enum skips inspect | Fixture auto-mergeable in-scope conflict reconciles; out-of-scope conflict stops with paths |
| Stale reviews kept after rebase | completed[] loses review/verify after new HEAD |
| Standalone writes run.json | finalize/deliver without execute checkpoint leaves run.json absent |
| Smoke `#96` replay | T004 uses fresh NMG_SDLC_SMOKE_ISSUES only |

---

## Validation Checklist

- [x] Root cause identified with code references
- [x] Fix is minimal
- [x] Blast radius assessed
- [x] Regression risks documented
- [x] Follows `structure.md` (scripts + workflows, skill-creator on bundles)
