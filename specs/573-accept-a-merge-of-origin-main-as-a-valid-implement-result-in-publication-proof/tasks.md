# Tasks: Accept a merge of origin/main as a valid implement result in publication proof

**Issue**: #573
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/551-add-parallel-delivery-with-worktree-isolation-a-merge-queue-change-scoped-validation-tiers-and-one-pass-verification/

## Implementation Tasks

### T001: Recognize integration merges and their change set

**File(s)**: `scripts/sdlc-safe-recoveries.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1/FR2: add `integrationBaseRef`, `integrationParent`, `inProgressIntegration` and `integrationChangeSet` as the design describes.
- `integrationParent` returns the second parent only for a two-parent commit whose second parent is on the fetched default branch and whose first parent is not.
- A merge of another branch, or an octopus merge, returns `null`.
- An unreadable default branch or a failed fetch throws `publication_scope_unproven`.

### T002: Use the integration change set in bind and the clean reconcile path

**File(s)**: `scripts/sdlc-safe-recoveries.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC2/AC3:
  - With an in-progress integration merge, bind runs the deny check only on the integration change set and does not apply the staged-entry subject rule.
  - A denied path in that set is refused with `publication_scope_unproven`.
  - A non-integration `MERGE_HEAD` is refused.
- When `HEAD` is an integration merge, clean reconcile derives `allowedPaths` from the integration change set.
- FR5: with no merge, bind and reconcile behave exactly as before.

### T003: Walk first-parent ahead commits in reconcile

**File(s)**: `scripts/sdlc-safe-recoveries.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC1/FR3:
  - `reconcileStagePublication` lists ahead commits with `--first-parent`.
  - It accepts integration merges without a stage subject.
  - It keeps the single-parent and exact-subject rule for every other ahead commit.
  - It checks the observed path set from the newest integration merge's second parent.
- When only merges are ahead, or nothing is ahead and `HEAD` is a merge, the newest first-parent non-merge commit since the merge base must have the expected subject, and that subject must pass `validImplementationSubject`.
- AC3: a merge whose result also changes a denied path absent from the default branch fails with `Publication commit exceeds approved scope`.
- A non-integration merge fails with `Publication merge is not an integration of the default branch`.

### T004: Take the implement subject from the latest non-merge commit

**File(s)**: `workflows/write-code/WORKFLOW.md`
**Type**: Modify
**Depends**: T002, T003
**Acceptance**:
- FR4:
  - Step 4 reads the subject with `git log -1 --first-parent --no-merges --format=%s HEAD`.
  - The `queue_integration_conflict` repair says to bind with that existing subject during the merge, conclude it with `git commit --no-edit`, push, and reconcile, without adding an issue-subject commit.

### T005: Add behavioral regression coverage

**File(s)**: `scripts/__tests__/sdlc-safe-recoveries.test.mjs`
**Type**: Modify
**Depends**: T001, T002, T003, T004
**Acceptance**:
- The tests use temporary Git repositories with a bare `origin` whose `HEAD` names the default branch. Each test cites its `@SCN` tag:
  - `@SCN001` (AC1): reconcile passes for a pushed tip that merges `origin/main`, whether or not another issue's spec files came in with the merge, given an earlier `fix: … #N` commit.
  - `@SCN002` (AC2): bind passes during an in-progress merge that stages another issue's `specs/<M>-*/` files from main.
  - `@SCN003` (AC3): bind and reconcile refuse a merge whose result also edits a denied path not on main.
- The tests also cover:
  - a merge of a non-default branch, which is refused;
  - a branch without merges, whose bind and reconcile outcomes are unchanged;
  - the write-code step-4 subject command text.
- `cd scripts && npm test` exits 0.

### T006: Add the CHANGELOG entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T005
**Acceptance**:
- `[Unreleased]` has a bullet under `### Fixed` describing that implement publication proof accepts a merge of the default branch and checks only the issue's own changes, ending with `(#573)`.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #573 | 2026-11-19 | Initial defect report |
