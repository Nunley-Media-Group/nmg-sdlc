# Publish Approved Spec

**Read when executing Discovery, Approval Behavior, or the continue loop.**

## Helper contract

All subcommands run from the current checkout and print exactly one JSON object to stdout. Success exits 0 with `ok: true`. Failure exits non-zero with `ok: false`, a stable `reasonCode`, and optional `detail`, `stdout`, or `stderr`. Every `merge` result that reports `merged: true`, on success or after a post-merge failure, also carries `issue` and `dir` (`specs/N-slug`) beside `pr`; callers must record that publication instead of retrying it. The nmg-sdlc hooks module recognizes the publication from that JSON, so run `merge` verbatim as the whole `Bash` call with `run_in_background: true` (Approval Behavior step 4). After the execution turn ends with an empty prompt box, the hooks module runs `/plan` and submits the Continue prompt into native plan mode.

```text
node "<plugin-root>/scripts/publish-approved-spec.mjs" discover --issue N
node "<plugin-root>/scripts/publish-approved-spec.mjs" candidates [--published N ...]
node "<plugin-root>/scripts/publish-approved-spec.mjs" prepare --issue N --name {N}-{slug}
node "<plugin-root>/scripts/publish-approved-spec.mjs" commit-push --issue N --dir specs/{N}-{slug}
node "<plugin-root>/scripts/publish-approved-spec.mjs" merge --issue N --dir specs/{N}-{slug}
```

`{N}-{slug}` is the basename of `targetDir`. `--dir` is exactly `specs/{N}-{slug}` (POSIX, no `..`), resolved inside the spec worktree. Issue arguments are positive integers. Invalid or unknown arguments fail `invalid_arguments`.

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

Unreadable or malformed issue rows fail `issues_unreadable`; ambiguous status fails `spec_status_ambiguous`; an uninspectable worktree `specs/` path fails `spec_status_unreadable`. The helper does not truncate rows or author `AskUserQuestion` labels.

## Spec branch and worktree

Spec work has its own branch namespace: issue N publishes from `spec/{N}-{slug}`, never from the code branch `{N}-{slug}`. The spec pull request is found and created only by head `spec/{N}-{slug}`, so it can be open beside a code pull request on `{N}-{slug}`, and publication never selects, merges, or closes that code pull request.

The spec branch lives in its own git worktree beside the primary checkout (`<primary-parent>/<repo-name>-wt/spec-{N}`, or under `NMG_SDLC_WORKTREES_DIR`). Every git command of a publication runs there. The current checkout is never switched to a spec branch or to the default branch, and its uncommitted work is neither an obstacle nor touched. Never run `git checkout`, `git switch`, `git stash`, or `gh issue develop` for a publication.

## Prepare

`prepare` reads the default branch through `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`, then creates the worktree for `spec/{N}-{slug}` from the freshly fetched remote default branch, or reuses the worktree an earlier run left. An existing remote `spec/{N}-{slug}` is resumed instead of recreated. It returns:

```json
{
  "ok": true,
  "branch": "spec/197-move-lifecycle-rules-into-code",
  "worktree": "/abs/repo-wt/spec-197",
  "specDir": "/abs/repo-wt/spec-197/specs/197-move-lifecycle-rules-into-code",
  "created": true
}
```

`prepare` creates `specDir`, so `specDir` exists after `prepare` succeeds. Write the four spec files in `specDir`. Empty default branch fails `default_branch_unreadable`; other failures are `worktree_create_failed`, `worktree_setup_failed`, and `worktree_path_occupied` (a directory that is not this branch's worktree is in the way; report it, never delete it).

## Commit and push

`commit-push` resolves the same worktree, requires the approved four-file package there, and stages only `specs/{N}-{slug}`. The commit subject is exactly `docs: approve spec for #N`. It runs `git push -u origin HEAD` in the worktree without force, publishing `spec/{N}-{slug}`. Non-fast-forward fails `push_rejected`. An identical tree returns `skippedCommit: true` and still pushes. The result carries `branch` and `worktree`.

A package that is approved in the current checkout but absent from the spec worktree fails `spec_outside_worktree` with `worktree` and `specDir`: write the four files in `specDir` and rerun. The helper never copies or publishes files from the current checkout.

## Merge

`merge` requires the approved four-file package in the spec worktree. It opens or resumes a docs-only PR from `spec/{N}-{slug}` titled `docs: approve spec for #N`, with a body that mentions `#N` without `Closes`, `Fixes`, `Resolves`, or another closing keyword. Before creating a PR it checks merged PR history for the same branch, base, and exact local head. An independently proven merged PR skips creation, readiness polling, and merge; an open PR still passes the full readiness and exact-head checks before squash merge. A spec PR carries the spec package and nothing else: before waiting for readiness, `merge` reads the PR's changed files and refuses with `pr_scope_invalid`, naming the `outside` files, when any of them is outside `specs/{N}-{slug}/`. It then applies `spec-created` while leaving issue N open. Every result that reports `merged: true` includes `issue` and `dir`.

After a proven merge the helper cleans up, best-effort: it deletes the remote spec branch, fast-forwards the primary checkout only when it is on the default branch with no uncommitted or untracked work, and removes the spec worktree and its local branch. None of these can fail the command, and no step checks out the default branch. The success result is `{ "ok": true, "branch": "spec/{N}-{slug}", "base": "<defaultBranch>", "pr": 412, "merged": true, "issue": N, "dir": "specs/{N}-{slug}", "fastForwarded": true, "remoteBranchDeleted": true, "worktreeRemoved": true, "cleanup": [], "squash": true, "labeled": true }`; `cleanup` holds one line per skipped step. A false `fastForwarded`, `remoteBranchDeleted`, or `worktreeRemoved` is information, not a failure: do not check out, pull, stash, or delete anything to change it. A leftover spec worktree is reused by the next run for that issue.

If `gh pr merge` exits nonzero, inspect that exact PR independently. Only `MERGED` with the expected PR number, head SHA, head branch, and base counts as publication; otherwise `pr_merge_failed` returns without `merged: true` and without labeling. Preserve the CLI failure diagnostic. Never retry a possibly completed merge. A repeated invocation recognizes the same merged PR and performs only safe outstanding bookkeeping, not another PR creation or merge.

Failures before proven merge include `spec_not_approved`, `spec_outside_worktree`, `pr_create_failed`, `pr_scope_invalid`, and `pr_merge_failed`; they queue no continuation and leave the spec worktree and branch in place for a rerun. After proven merge, the only failure is `spec_created_label_failed`, which returns `merged: true`, the numeric `pr`, and the same cleanup fields. The caller records N in `published[]` immediately and must not republish or rewrite it. For `spec_created_label_failed`, run `node "<plugin-root>/scripts/spec-created-label.mjs" apply --issue N`. Report remediation failure separately. Finish remediation and settle the execution turn; the queued native-plan follow-up retains N in `published[]` and owns the next Continue/Finished decision. Never force-merge or bypass protection.

## Native-plan continuation

After each merged publication and its documented remediation, end the execution turn without calling `candidates` or `AskUserQuestion`. The nmg-sdlc hooks module then runs `/plan` and submits the post-publication continuation prompt, listing every published `N-slug`, into native plan mode in the same TUI session. It skips Initial issue selection and starts at the Continue loop. Plan approval may clear context; `published[]` survives because the hooks module holds it and lists it in that prompt.

That plan-mode turn passes every in-memory published number to `candidates`. Present one `AskUserQuestion` question, 2–4 options, recommended first with ` (Recommended)` appended to its label. This question does not consume the per-issue interview budget.

- Rows returned: show at most the first three labels `#M — {title}` (the first labelled `#M — {title} (Recommended)`), then `Finished — stop writing specs`.
- No rows: `Continue — enter another issue number (Recommended)`, then `Finished — stop writing specs`.

Selecting M permits only read-only discovery and preference interview before overwriting the plan file with M's distinct complete plan headed `# spec-{M}: <title>` with current `published[]` and calling `ExitPlanMode`. Do not call `prepare` or mutate a worktree, branch, file, commit, push, pull request, label, or merge for M before that plan is approved.

Finished prints:

```text
Published specs: #<n> on <n>-<slug>[, ...]
Next step: /sdlc-execute #<first-published>
```

The publication session leaves the current checkout on the branch it started on. Both Finished choices (this one and the initial picker's `Finished — stop without writing a spec`) end the reply by calling `ExitPlanMode` as its last action, with no other output after it and without another `AskUserQuestion`. The nmg-sdlc hooks module recorded the Finished selection and approves that one `ExitPlanMode` call, so plan mode ends without an approval dialog and the Finished output stays the last reply. If the reply ends without that call, the hooks module sends one prompt asking for it, then warns once with `NMG SDLC: write-spec finished, but plan mode is still active; Shift+Tab exits it.`
