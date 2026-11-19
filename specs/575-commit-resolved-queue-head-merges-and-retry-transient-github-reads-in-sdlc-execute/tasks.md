# Tasks: Commit resolved queue-head merges and retry transient GitHub reads in /sdlc-execute

**Issue**: #575
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/573-accept-a-merge-of-origin-main-as-a-valid-implement-result-in-publication-proof/

## Implementation Tasks

### T001: Add the commit-merge helper action

**File(s)**: `scripts/sdlc-safe-recoveries.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `commit-merge --issue N --step implement --spec specs/N-SLUG [--controller-run-id R]` reuses #573's `integrationBaseRef`, `inProgressIntegration`, and `integrationChangeSet`.
- For a resolved integration merge, it commits with `git commit --no-edit` and prints `NMG_SDLC_PUBLICATION` with `passed: true` and `commit`.
- It refuses, without committing and with exit 1, with `merge_not_in_progress`, `merge_unresolved`, `merge_unstaged`, `publication_scope_unproven`, `publication_branch_mismatch`, or `merge_commit_failed`, as the design specifies.
- `--subject` and any other unknown option exit 2.

### T002: Conclude resolved integration merges in write-code with commit-merge

**File(s)**: `workflows/write-code/WORKFLOW.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- The `queue_integration_conflict` repair, and any resolved in-progress merge of the remote default branch, is concluded with the `commit-merge` command, followed by push and `reconcile`.
- The workflow never instructs raw `git commit` for that merge.
- A `commit-merge` refusal writes the failed `implementation_failed` handoff.
- The edit is made after invoking the `skill-creator` skill with the `Skill` tool.

### T003: Retry transient GitHub reads in controller evidence collection

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `transientGhFailure` and `retryingRun` are exported, and `statusEvidence` wraps its run adapter with `retryingRun`.
- A transient `gh` failure is retried after 1 s, 2 s, and 4 s, and the first success is returned.
- Non-transient failures and non-`gh` commands are called once.

### T004: Add behavioral regression coverage

**File(s)**: `scripts/__tests__/sdlc-safe-recoveries.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/write-code-contract.test.mjs`
**Type**: Create | Modify
**Depends**: T001, T002, T003
**Acceptance**:
- AC1: in a temporary Git repository fixture with a conflicted merge of the fetched default branch resolved and staged, `commit-merge` creates a two-parent commit whose second parent is the default-branch commit, and exits 0.
- AC1: the same fixture with an unmerged path refuses with `merge_unresolved`, and with no `MERGE_HEAD` refuses with `merge_not_in_progress`. Neither creates a commit.
- FR3: a contract test asserts that `workflows/write-code/WORKFLOW.md` names `sdlc-safe-recoveries.mjs commit-merge` for the integration merge and contains no raw `git commit --no-edit` instruction.
- AC2: a controller test whose fake `gh issue view` fails once with `HTTP 502` and then succeeds dispatches the next stage without throwing `issue #N evidence unavailable`. The injected sleep records `1000`.
- FR5: a test shows an `HTTP 404` `gh` failure is not retried.
- `cd scripts && npm test` exits 0.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #575 | 2026-11-19 | Initial defect tasks |
