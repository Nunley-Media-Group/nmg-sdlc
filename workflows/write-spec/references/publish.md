# Publish Approved Spec

**Read when executing Approval Behavior or the continue loop.**

## Helper argv

```
node scripts/publish-approved-spec.mjs prepare --issue N --name {N}-{slug}
node scripts/publish-approved-spec.mjs commit-push --issue N --dir specs/{N}-{slug}
node scripts/publish-approved-spec.mjs merge --issue N --dir specs/{N}-{slug}
node scripts/publish-approved-spec.mjs default-branch
```

`{N}-{slug}` is the basename of `targetDir`. `--dir` is exactly `specs/{N}-{slug}` (posix, no `..`).

JSON stdout. Non-zero plus `reasonCode` on failure. Never force-push. Never `git add -A`.

## Dirty tree

`prepare` and `commit-push` abort with `dirty_tree` when `git status --porcelain` is non-empty and the current branch is not already `{N}-{slug}`. They print the porcelain. Do not stash, discard, or guess another branch.

If current ≠ `{N}-{slug}` they fetch the default branch and run `git checkout -B {N}-{slug} origin/<defaultBranch>`. Do not call `gh issue develop` here — that development-links the branch and a later spec merge would auto-close #N. `<defaultBranch>` comes from `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`. Empty → `default_branch_unreadable`. Current still wrong → `branch_checkout_failed`. Stop; do not write files on prepare failure. start-issue still uses `gh issue develop … --base <defaultBranch>` for implementation.

## Commit subject and push

`commit-push` stages only `specs/{N}-{slug}`. Commit subject is exactly `docs: approve spec for #N`. Then `git push -u origin HEAD`. Non-fast-forward → `push_rejected`. Identical tree → `skippedCommit: true` and still pushes.

## Merge spec into the default branch

`merge` requires the approved four-file package. It opens a docs-only PR (`docs: approve spec for #N`) into the repository default branch when none exists, then `gh pr merge --squash --delete-branch`. The PR body must mention `#N` without `Closes`, `Fixes`, `Resolves`, or any other GitHub closing keyword. The issue stays open for `/sdlc-execute`. After a successful squash-merge the helper checks out the default branch and fast-forwards it. Failure → `pr_create_failed` or `pr_merge_failed`; leave the spec branch.
Successful `merge` applies `spec-created` to `#N`, creating the repository label when needed. A post-merge apply failure returns `spec_created_label_failed`; it does not undo the squash-merge.


Unapproved four-file package → `spec_not_approved`. Do not invent a second brancher.

## Candidate filter

Continue-loop candidates come from `gh issue list --state open --limit 100 --json number,title`.

Drop:

- every number already in this session's `published[]`
- any `M` whose unique worktree `specs/{M}-*/` is Approved
- any `M` whose unique `refs/heads/{M}-*` or, if none, unique `refs/remotes/origin/{M}-*` has an approved four-file package (same Issue/Status rules as execute `specStatus`)

Sort remaining by number ascending.

## Ask shapes

One `ask`, 2–4 options, recommended first. This ask does not consume the per-issue interview budget.

- ≥1 candidate: up to three labels `#M — {title}` (recommended index 0), last option `Finished — stop writing specs`. Extra numbers use automatic Other.
- 0 candidates: `Continue — enter another issue number` (recommended) and `Finished — stop writing specs`. Other supplies `#M` / `M`.

Finished prints:

```
Published specs: #<n> on <n>-<slug>[, ...]
Next step: /sdlc-execute #<first-published>
```

Stay on the last spec branch.

`default-branch` reads the GitHub default via `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`. Empty or fail → stop and keep the last spec branch. Do not guess `main`.
