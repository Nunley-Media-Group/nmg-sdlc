# Tasks: Add parallel delivery with worktree isolation, a merge queue, change-scoped validation tiers, and one-pass verification

**Issue**: #551
**Date**: 2026-11-13
**Status**: Approved
**Author**: Claude Code (write-spec)
**Related Spec**: specs/546-sdlc-execute-stop-losing-time-to-idle-workers-restarts-and-truncated-gate-evidence/

## Implementation Tasks

### T001: Extend the steering manifest schema

**File(s)**: `src/sdlc-steering-runtime.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR4/FR10/FR15–FR17/FR20: validations accept optional `tier`, `selection`, `fallbackPaths`, and `heavy`. The manifest accepts optional `worktree`, `changelog.fragments.dir`, and `fullGreen.actions`, with the validation rules in design.md.
- Invalid values fail with `steering_validation_invalid`. Manifests without the new keys load unchanged.

### T002: Add the host-wide heavy-job pool

**File(s)**: `scripts/sdlc-heavy-pool.mjs`
**Type**: Create
**Depends**: none
**Acceptance**:
- FR13: `slotCount`, `acquireSlot`, `listHolders`, and the `run`/`list` CLI behave as specified. The size comes from `~/.nmg-sdlc/config.json` `heavyJobSlots` (default 1), and dead-pid locks are reclaimed.

### T003: Add tiers, selection, and heavy slots to the verification runtime

**File(s)**: `src/sdlc-verification-runtime.mjs`, `scripts/sdlc-verify-steering.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- FR15–FR18/FR21: `--tier pre-merge|full` filters validations. Selection, fallback, and the reasons `selected`, `fallback_path`, `selection_data_stale`, `selection_data_missing`, `selection_all`, `selection_failed`, and `selection_empty` are recorded with `selectedCount` and `dataAgeSeconds`. Untiered validations record `tier: null, selection: null` and run unchanged.
- FR13: heavy validations hold a pool slot and record `heavy.waitedMs`.

### T004: Add the worktree manager

**File(s)**: `scripts/sdlc-worktree.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- FR1/FR4/FR5/FR6: `resolveLayout`, `ensureWorktree`, `removeWorktree`, `syncPrimary`, `listWorktrees`, and the CLI behave as in design.md.
- The primary checkout is never checked out or switched.

### T005: Publish specs on the spec branch from a spec worktree

**File(s)**: `scripts/publish-approved-spec.mjs`, `scripts/start-issue.mjs`, `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md`
**Type**: Modify
**Depends**: T004
**Acceptance**:
- FR1/FR2/FR5/FR6: `prepare` creates the `spec-<N>` worktree on `spec/{N}-{slug}` and returns `draftDir`. `commit-push` copies the drafts into the worktree and commits there. `merge` looks up only the spec branch, refuses `pr_scope_invalid`, removes the spec worktree, and returns `primarySync` without checking out the default branch.
- Merged-spec-PR proofs accept `spec/{N}-{slug}` and legacy `{N}-{slug}` heads.
- The workflow text writes into `draftDir` and drops the `default_checkout_failed` remediation.

### T006: Add the merge queue and queue-head processing

**File(s)**: `scripts/sdlc-merge-queue.mjs`
**Type**: Create
**Depends**: T004
**Acceptance**:
- FR7/FR8/FR11: the queue file and lock live in `<git-common-dir>/nmg-sdlc/`, and dead entries and locks are reclaimed.
- `processQueueHead` merges `origin/<default>`, resolves version-artifact-only conflicts to the default's content, prepares the version, runs the gate once, and finalizes. On failure it reverts the version commit and returns `queue_integration_conflict` or `queue_gate_failed`.

### T007: Assemble changelog fragments at version preparation

**File(s)**: `scripts/sdlc-deliver.mjs`, `workflows/write-code/WORKFLOW.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR10: with `changelog.fragments.dir` declared, `prepare-version` inserts `<dir>/<N>.md` bullets into the new version section, deletes the fragment, and skips the generated line when a bullet cites `(#N)`. Without it, behaviour is unchanged.
- write-code directs fragment writing, with bullets ending `(#N)`, only when the opt-in is declared.

### T008: Run execute per issue worktree through the merge queue

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/sdlc-execute-supervisor.mjs`, `scripts/sdlc-safe-recoveries.mjs`
**Type**: Modify
**Depends**: T004, T005, T006, T009
**Acceptance**:
- FR1/FR3: each issue's git and gh calls, handoffs, verification records, lease, and stage spawn `cwd` use its code worktree.
- FR9: the pre-dispatch `prepareVersion` is removed. A verify handoff with `next: "queue"` enqueues, the controller waits for head, runs `processQueueHead`, and then dispatches deliver.
- FR5/FR6: after delivery the worktree and local branch are removed and the primary checkout is synced best-effort. No `git switch` to the default branch remains.
- FR11: a failed queue head dequeues and routes to implement with the failure artifacts.
- FR12: the start stage report carries `overlaps[]`.

### T009: Make verify review-first with a checked checklist

**File(s)**: `workflows/verify-code/WORKFLOW.md`, `agents/architecture-reviewer.md`, `scripts/sdlc-finalize-verification.mjs`, `scripts/sdlc-review-scope.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR22/FR25/FR26: verify runs scope, then parallel review lenses, then the merged checklist, the report, and `finalize --review`. It never runs `sdlc-verify-steering.mjs`. All findings return in one `review_findings` handoff.
- FR23: `--review` refuses `review_checklist_incomplete`, naming null-verdict rows and missing AC or FR rows.
- FR24: the workflow requires real-entry-point exercise and reports `mockedEntryPoints`.
- FR27: `sdlc-review-scope.mjs` returns `scoped` or `full` as in design.md.
- `--queue-gate` keeps today's exact-head gate checks, and `validateHandoff` accepts `next: "queue"`.

### T010: Add /sdlc-verify-full and the full-green check

**File(s)**: `scripts/sdlc-verify-full.mjs`, `workflows/verify-full/WORKFLOW.md`, `commands/sdlc-verify-full.md`, `src/host-events.mjs`, `src/sdlc-commands.mjs`, `src/sdlc-prompt-snippets.mjs`, `scripts/verify-current-specs.mjs`, `references/rewrite-contract.json`, `scripts/skill-inventory.baseline.json`
**Type**: Create
**Depends**: T003, T004
**Acceptance**:
- FR19: `run --ref` records `<git-common-dir>/nmg-sdlc/full-verification/<sha>.json` from a temporary detached worktree, and on failure lists first-parent commits since the last green record.
- FR20: `check --action --commit` exits 0/1/2 as specified.
- The command file is byte-identical to `renderAutomatedCommandMarkdown` output. `node scripts/verify-plugin-surface.mjs --root . --label repository` and `node scripts/skill-inventory-audit.mjs --check` exit 0.

### T011: Report parallel state in status

**File(s)**: `scripts/sdlc-status.mjs`
**Type**: Modify
**Depends**: T002, T004, T006
**Acceptance**:
- FR14: JSON `parallel` and the text `Parallel:` block list in-flight issues, stage, queue position, queue entries, leftover worktrees, and host holders, without mutating anything.

### T012: Route worker heavy commands through the pool

**File(s)**: `src/sdlc-prompt-snippets.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- FR13: implement and verify worker prompts direct heavy validation commands through `sdlc-heavy-pool.mjs run`.

### T013: Test worktree isolation and spec branches (AC1, AC2)

**File(s)**: `scripts/__tests__/sdlc-worktree.test.mjs`, `scripts/__tests__/publish-approved-spec.test.mjs`
**Type**: Create
**Depends**: T004, T005
**Acceptance**:
- AC1: with a temporary bare origin and a dirty primary checkout on the default branch, two concurrent code `ensureWorktree` calls and one spec `prepare` produce three worktrees under `<repo>-wt/`. No reason code is `default_checkout_failed`, `issue_branch_unreadable`, or `branch_checkout_failed`, and the primary's branch, HEAD, and porcelain status are byte-identical before and after.
- AC2: with a fake `gh` that lists an open code PR on `{N}-{slug}`, `merge` queries only `--head spec/{N}-{slug}`, never merges the code PR, and refuses `pr_scope_invalid` for a PR with non-spec files.

### T014: Test the merge queue, versions, and fragments (AC3, AC4, AC5)

**File(s)**: `scripts/__tests__/sdlc-merge-queue.test.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Create
**Depends**: T006, T007
**Acceptance**:
- AC3: an injected gate records call order. B's gate starts only after A's merge, and each branch's gate runs exactly once, on a head containing the default it merges into.
- AC4: with fragments opted in, two queued branches produce different versions, both fragments' bullets appear in `CHANGELOG.md`, the fragment files are deleted, and neither integration reports a conflict.
- AC5: a failing gate yields `queue_gate_failed` with `next: "implement"`, the version commit is reverted, the entry is removed, and the next entry becomes head.

### T015: Test overlap reporting and status (AC6, AC8)

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-status.test.mjs`
**Type**: Modify
**Depends**: T008, T011
**Acceptance**:
- AC6: an in-flight worktree M whose `tasks.md` declares a file that N's also declares yields a start stage report `overlaps: [{issue: M, files: [...]}]`.
- AC8: `runCli(['--project', root, '--json'])` with worktrees, queue entries, and pool locks prints `parallel` with in-flight stage and queue position, the queue, holders, and a leftover worktree with no lease.

### T016: Test the heavy pool (AC7)

**File(s)**: `scripts/__tests__/sdlc-heavy-pool.test.mjs`
**Type**: Create
**Depends**: T002, T003
**Acceptance**:
- AC7: with an injected `hostDir`, `heavyJobSlots: 1`, and two child processes from different project roots, the heavy runs do not overlap, the second records `waitedMs > 0`, and a lock held by a dead pid is reclaimed.

### T017: Test validation tiers (AC9, AC10, AC13)

**File(s)**: `scripts/__tests__/sdlc-verification-runtime.test.mjs`, `scripts/__tests__/sdlc-steering-runtime.test.mjs`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- AC9: a fake selection command returning fresh `selected` tests makes the validation run with those tests appended, and the record holds the tier, provider, `selected`, the count, and the age.
- AC10: a fallback-path change, and `stale` or `missing` data, each run the full command with reasons `fallback_path`, `selection_data_stale`, and `selection_data_missing`.
- AC13: untiered validations all run with full commands and record `tier: null, selection: null`. Schema tests cover accepted and rejected new keys.

### T018: Test full verification and the full-green check (AC11, AC12)

**File(s)**: `scripts/__tests__/sdlc-verify-full.test.mjs`, `scripts/__tests__/plugin-commands.test.mjs`
**Type**: Create
**Depends**: T010
**Acceptance**:
- AC11: a failing full run records the per-commit result and lists the first-parent commits since the last green record.
- AC12: `check` exits 0 for a commit at or behind a green record, 1 otherwise, and 2 for an unknown action.
- The plugin-command tests include `sdlc-verify-full`.

### T019: Test review-first verification (AC14, AC15, AC16)

**File(s)**: `scripts/__tests__/sdlc-finalize-verification.test.mjs`, `scripts/__tests__/sdlc-review-scope.test.mjs`, `scripts/__tests__/verify-review-first-contract.test.mjs`
**Type**: Create
**Depends**: T009
**Acceptance**:
- AC14: a checklist with two blocking findings yields one failed `review_findings` handoff naming both. No `.nmg-sdlc/verification/<N>.json` is written. The contract test asserts that verify-code's WORKFLOW.md does not invoke `sdlc-verify-steering.mjs`.
- AC15: a null-verdict row and a missing AC row yield `review_checklist_incomplete` naming both rows.
- AC16: repair paths inside the finding files give `scoped`, and an outside path gives `full` with `outsidePaths`.

### T020: Document parallel delivery and add the CHANGELOG entry

**File(s)**: `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T008, T010
**Acceptance**:
- The README describes the sibling worktrees, the merge queue, the new manifest keys, `~/.nmg-sdlc/config.json` `heavyJobSlots`, `/sdlc-verify-full`, and review-first verify.
- `CHANGELOG.md` `[Unreleased]` has a bullet ending `(#551)`.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #551 | 2026-11-13 | Initial feature tasks |
