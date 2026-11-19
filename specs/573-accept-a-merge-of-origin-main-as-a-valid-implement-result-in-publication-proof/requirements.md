# Defect Report: Accept a merge of origin/main as a valid implement result in publication proof

**Issue**: #573
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/551-add-parallel-delivery-with-worktree-isolation-a-merge-queue-change-scoped-validation-tiers-and-one-pass-verification/

## Reproduction

1. Run `/sdlc-execute` with two or more issues, so a branch reaches the head of the merge queue after the default branch has moved.
2. The controller's integration hits a conflict outside the version artifacts and sends the issue back to implement with `queue_integration_conflict`.
3. The implement worker merges `origin/<default>` into the issue branch, resolves the conflicts, and runs `sdlc-safe-recoveries.mjs bind --issue N --step implement --spec specs/N-slug --subject "<subject>"`.
   - The merge stages files that come only from the default branch, including other issues' `specs/<M>-*/` directories.
   - Bind refuses with `publication_scope_unproven`.
4. Alternatively, the branch tip is already a pushed merge of `origin/<default>`: either the controller's own version-only integration merge, or a merge from an earlier repair.
   - The worker runs `reconcile` with the tip's subject `Merge remote-tracking branch 'origin/main' into <branch>`.
   - Reconcile refuses with `publication_subject_unproven`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | A merge commit whose first parent is the issue branch and whose second parent is on the fetched default branch is accepted as an implement result. The issue's scope is checked against the diff between the merged-in default-branch commit and the branch tip. |
| **Actual** | Bind and reconcile treat files brought in by the merge as the issue's own changes, and require every ahead commit, including the merge and the default branch's own commits, to be a single-parent commit with the issue subject. The run halts until someone rebuilds the branch by hand. |

## Acceptance Criteria

### AC1: A merge-of-main tip passes the subject proof

**Given** an issue branch whose tip is a merge of the fetched `origin/<default>`, and whose own first-parent history contains a commit with the issue's implementation subject
**When** `reconcile --step implement` runs with that implementation subject
**Then** it passes without requiring an issue-subject commit at the tip

### AC2: Files from the default branch are outside the scope check

**Given** a branch that merged `origin/<default>`, either committed or with the merge still in progress
**When** `bind` or `reconcile` checks the changed paths
**Then** only the paths that differ between the merged-in default-branch commit and the branch tip (or working tree) are checked against the issue's publication scope

### AC3: Real out-of-scope changes are still refused

**Given** a merge of `origin/<default>` whose result also changes a denied path that the default branch does not contain, such as another issue's `specs/<M>-*/` file or this issue's Approved spec input
**When** `bind` or `reconcile` runs
**Then** it is refused, as before, with `publication_scope_unproven` from `bind` or a failed `reconcile`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | An integration merge is a commit, or an in-progress merge with one `MERGE_HEAD`, whose first parent is not an ancestor of the fetched default branch and whose second parent (or `MERGE_HEAD`) is. Any other merge is not accepted | Must |
| FR2 | For an integration merge, the issue's change set is `git diff --name-only --no-renames` from the merged-in default-branch commit to the tip, or to the working tree plus untracked files during an in-progress merge. Publication deny rules apply to that set only | Must |
| FR3 | Reconcile walks only the first-parent ahead commits. Integration merges need no stage subject. Every other ahead commit keeps the existing single-parent and exact-subject rules. When no non-merge commit is ahead, the expected subject must match the latest first-parent non-merge commit since the merge base with the default branch | Must |
| FR4 | write-code reads the implement subject from the latest first-parent non-merge commit, and concludes a `queue_integration_conflict` merge with `git commit --no-edit` instead of adding an issue-subject commit | Must |
| FR5 | Branches with no merge commit keep exactly the current bind and reconcile behavior | Must |

## Out of Scope

- The controller's own queue-head integration in `scripts/sdlc-execute.mjs` (`integrateDefault`)
- Accepting merges of anything other than the repository's default branch
- Force-push or history-rewriting recovery

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #573 | 2026-11-19 | Initial defect report |
