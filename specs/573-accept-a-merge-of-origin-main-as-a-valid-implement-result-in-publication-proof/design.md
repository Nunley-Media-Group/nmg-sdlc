# Root Cause Analysis: Accept a merge of origin/main as a valid implement result in publication proof

**Issue**: #573
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/551-add-parallel-delivery-with-worktree-isolation-a-merge-queue-change-scoped-validation-tiers-and-one-pass-verification/

## Root Cause

`scripts/sdlc-safe-recoveries.mjs` proves publication only for single-parent stage commits.

1. **Bind counts the default branch's files as the issue's changes.**
   - `runCli` `bind` reads `git status --porcelain` and runs `publicationPathDenied` on every path.
   - During a merge of `origin/<default>`, the index holds every file the default branch changed, including other issues' `specs/<M>-*/` directories. Those are denied, so bind throws `publication_scope_unproven`.
   - The same staged entries also trip the `hasStagedNonRuntimeEntry` rule for a supplied subject, which throws `publication_subject_unproven`.
2. **The clean-path scope is empty for a merge tip.**
   - When the worktree is clean, `reconcile` derives `allowedPaths` from `git diff-tree … HEAD`.
   - For a merge commit, that diff is empty, so the output does not end in `\0` and reconcile throws `publication_scope_unproven`.
3. **Reconcile requires every ahead commit to be a stage commit.**
   - `reconcileStagePublication` lists `git rev-list @{u}..HEAD`, which includes the default branch's own commits brought in by the merge. When nothing is ahead, it lists `[HEAD]`.
   - Each listed commit must have the expected subject and exactly one parent. A merge tip, or main's commits, fail with `Publication commit subject is not the expected stage subject` or `… not a proven single-parent stage commit`.
4. **The workflow passes the merge's subject.**
   - write-code step 4 reads `git log -1 --format=%s HEAD`, which for a merge tip is `Merge remote-tracking branch …`.
   - `validImplementationSubject` rejects that subject, and `runCli` returns `publication_subject_unproven`.
   - The worker is told not to add a commit to satisfy the check, so the stage cannot pass.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/sdlc-safe-recoveries.mjs` | `runCli` bind/reconcile path | Dirty-path and clean-path scope observation |
| `scripts/sdlc-safe-recoveries.mjs` | `reconcileStagePublication` | Ahead-commit subject, parent and path proof |
| `workflows/write-code/WORKFLOW.md` | Commit and Push Implementation steps 1–4; `queue_integration_conflict` repair line | Subject source and merge conclusion |

## Fix Strategy

**Default-branch ref (`integrationBaseRef(run, cwd, remote)`)**
- It resolves the default branch name from `git symbolic-ref --short refs/remotes/<remote>/HEAD`, falling back to `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name` (the same call as `defaultBranchName` in `scripts/sdlc-execute.mjs`).
- It validates the name, fetches `refs/heads/<name>:refs/remotes/<remote>/<name>`, and returns that ref.
- It is called only after a merge commit or `MERGE_HEAD` is observed. Any failure throws `publication_scope_unproven`.

**Integration merge (`integrationParent(run, cwd, sha, baseRef)`)**
- It returns the second parent when:
  - `sha` has exactly two parents;
  - the second parent is an ancestor of `baseRef` (`git merge-base --is-ancestor`);
  - the first parent is not an ancestor of `baseRef`.
- Otherwise it returns `null`.
- `inProgressIntegration(run, cwd, baseRef)` applies the same test to a single `MERGE_HEAD` against `HEAD`.

**Integration change set (`integrationChangeSet(run, cwd, base, { worktree })`)**
- Committed: `git diff --name-only --no-renames -z <base> HEAD`.
- In progress: `git diff --name-only --no-renames -z <base>` (working tree), plus `git ls-files --others --exclude-standard -z`.
- Runtime paths are dropped, and unmerged index entries throw `publication_scope_unproven`.

**Bind**
- When `inProgressIntegration` holds, bind runs the deny check on the integration change set instead of the porcelain paths, and skips the staged-entry subject rule.
- A `MERGE_HEAD` that is not an integration merge throws `publication_scope_unproven`.

**Reconcile, clean path in `runCli`**
- When `HEAD` is an integration merge, `allowedPaths` is the committed integration change set from its second parent, instead of `diff-tree HEAD`.

**`reconcileStagePublication`**
- The ahead commits are `git rev-list --first-parent @{u}..HEAD`, or `[HEAD]` when nothing is ahead. Their count is checked against `git rev-list --first-parent --count @{u}..HEAD`, and the `@{u}...HEAD` left count must still be `0`.
- Each listed commit is either:
  - an integration merge, which needs no subject; or
  - a stage commit under the existing single-parent and exact-subject rules.
  - Any other merge fails with `Publication merge is not an integration of the default branch`.
- When any listed commit, or `HEAD`, is an integration merge:
  - The observed path set is the committed integration change set from the second parent of the newest first-parent integration merge.
  - That set is subject to the existing `allowedPaths`, deny, and set-equality checks.
  - When no stage commit is listed, the newest non-merge commit on `git rev-list --first-parent --no-merges <merge-base>..HEAD` must have subject `expectedSubject`, and `validImplementationSubject` must accept it. `<merge-base>` is the merge base of `HEAD` and `baseRef`.
- A run with no merge takes the existing code path unchanged.

**write-code**
- Step 4 reads the subject with `git log -1 --first-parent --no-merges --format=%s HEAD`.
- The `queue_integration_conflict` repair:
  1. runs bind with that existing implementation subject while the merge is in progress;
  2. concludes the merge with `git commit --no-edit`;
  3. pushes;
  4. reconciles.
- It never adds a commit only to carry the issue subject.

## Blast Radius

- Only implement publication on branches that contain a merge commit or an in-progress merge changes.
- Verify and deliver subjects, and branches without merges, behave as before (FR5).
- A merge of a non-default branch is still refused.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Rebase the issue branch onto main instead of merging | Rejected | Needs a force-push, which delivery forbids |
| Skip scope checks for any merge | Rejected | AC3 requires out-of-scope changes beyond main to be refused |
| First-parent walk + diff from the merged-in default commit | Selected | Proves exactly the issue's own changes and keeps the single-parent rule for stage commits |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #573 | 2026-11-19 | Initial defect report |
