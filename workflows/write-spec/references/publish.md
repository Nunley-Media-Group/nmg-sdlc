# Publish Approved Spec

**Read when executing Discovery, Approval Behavior, or the continue loop.**

## Helper contract

All six subcommands print exactly one JSON object to stdout. Success exits 0 with `ok: true`. Failure exits non-zero with `ok: false`, a stable `reasonCode`, and optional `detail`, `stdout`, or `stderr`. A `merge` failure after the PR was successfully merged also returns `merged: true` and `pr`; callers must record that publication instead of retrying it.

```text
node <plugin-root>/scripts/publish-approved-spec.mjs discover --issue N
node <plugin-root>/scripts/publish-approved-spec.mjs candidates [--published N ...]
node <plugin-root>/scripts/publish-approved-spec.mjs prepare --issue N --name {N}-{slug}
node <plugin-root>/scripts/publish-approved-spec.mjs commit-push --issue N --dir specs/{N}-{slug}
node <plugin-root>/scripts/publish-approved-spec.mjs merge --issue N --dir specs/{N}-{slug}
node <plugin-root>/scripts/publish-approved-spec.mjs default-branch
```

`{N}-{slug}` is the basename of `targetDir`. `--dir` is exactly `specs/{N}-{slug}` (POSIX, no `..`). Issue arguments are positive integers. Invalid or unknown arguments fail `invalid_arguments`.

## Read-only discovery

`discover --issue N` calls `gh issue view N --json number,title,body,labels,state` and returns:

```json
{
  "ok": true,
  "issue": {
    "number": 197,
    "title": "Move lifecycle rules into code",
    "body": "...",
    "labels": ["enhancement"],
    "state": "OPEN"
  },
  "classification": "feature",
  "slug": "move-lifecycle-rules-into-code",
  "targetDir": "specs/197-move-lifecycle-rules-into-code",
  "spec": {
    "dir": null,
    "approved": false,
    "source": null
  }
}
```

`classification` is `bug` only when a label name case-insensitively equals `bug`; otherwise it is `feature`. `spike` is neutral. Slugs lowercase the title, replace non-alphanumeric runs with `-`, trim separators, and fall back to `issue`.

The shared execute `resolveSpecDir` and `specStatus` contracts populate `targetDir` and `spec`. `source` is `worktree`, `local`, `remote`, or null. A unique existing worktree directory wins over the title-derived target. Invalid GitHub output fails `issue_unreadable`; ambiguous directories or refs fail `spec_status_ambiguous`; an uninspectable worktree `specs/` path fails `spec_status_unreadable`. Discovery never mutates git or GitHub state.

`candidates` accepts repeated `--published N`, deduplicates those numbers, and calls exactly:

```text
gh issue list --state open --limit 100 --json number,title
```

It drops published numbers and packages approved by shared `specStatus`, then returns every remaining unique row sorted numerically:

```json
{
  "ok": true,
  "candidates": [
    { "number": 197, "title": "Move lifecycle rules into code" }
  ]
}
```

Unreadable or malformed issue rows fail `issues_unreadable`; ambiguous status fails `spec_status_ambiguous`; an uninspectable worktree `specs/` path fails `spec_status_unreadable`. The helper does not truncate rows or author ask labels.

## Prepare

`prepare` and `commit-push` abort with `dirty_tree` when `git status --porcelain` is non-empty and the current branch is not already `{N}-{slug}`. They print the porcelain. Do not stash, discard, or guess another branch.

If current differs from `{N}-{slug}`, `prepare` reads the default branch through `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`, fetches it, and runs `git checkout -B {N}-{slug} origin/<defaultBranch>`. Empty default branch fails `default_branch_unreadable`; checkout failure returns `branch_checkout_failed`. Never call `gh issue develop`.

## Commit and push

`commit-push` requires the approved four-file package and stages only `specs/{N}-{slug}`. The commit subject is exactly `docs: approve spec for #N`. It runs `git push -u origin HEAD` without force. Non-fast-forward fails `push_rejected`. An identical tree returns `skippedCommit: true` and still pushes.

## Merge

`merge` requires the approved four-file package. It opens or resumes a docs-only PR titled `docs: approve spec for #N`, with a body that mentions `#N` without `Closes`, `Fixes`, `Resolves`, or another closing keyword. It squash-merges, checks out the repository default branch, fast-forwards it, and applies `spec-created` while leaving issue N open.

Failures before merge include `spec_not_approved`, `pr_create_failed`, and `pr_merge_failed`. After a successful squash merge, `default_checkout_failed` and `spec_created_label_failed` return `merged: true` and the numeric `pr`; the caller records N in `published[]` immediately and must not republish or rewrite it. For `default_checkout_failed`, run `node <plugin-root>/scripts/publish-approved-spec.mjs default-branch`; for `spec_created_label_failed`, run `node <plugin-root>/scripts/spec-created-label.mjs apply --issue N`. Report remediation failure separately and continue the publication loop with N excluded through `--published N`. Never force-push or stage with `git add -A`.

`default-branch` reads the GitHub default branch and checks it out. Failure returns `default_branch_unreadable` or `default_checkout_failed`; keep the current branch and do not guess `main`.

## Continue ask

Pass every in-memory published number to `candidates`. Present one `ask`, 2–4 options, recommended first. This ask does not consume the per-issue interview budget.

- Rows returned: show at most the first three labels `#M — {title}`, then `Finished — stop writing specs`.
- No rows: `Continue — enter another issue number`, then `Finished — stop writing specs`.

Finished prints:

```text
Published specs: #<n> on <n>-<slug>[, ...]
Next step: /sdlc-execute #<first-published>
```

The successful publication session remains on the repository default branch.
