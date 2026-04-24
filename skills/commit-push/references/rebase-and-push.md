# Rebase on Divergence and Safe Force-Push

**Consumed by**: `commit-push` Steps 5 (rebase on divergence) and 6 (push), including the force-with-lease branch under unattended mode.

Handles two cases that must resolve without human input when the SDLC runner is in unattended mode:

- **Epic-child race**: a sibling PR merged to `origin/main` while this branch was being implemented — local needs to pick up the newer base.
- **Stale remote tip**: an earlier cycle pushed commits that are no longer in local history after rebase.

---

## Step 5: Rebase

Before rebasing, record the remote tip so Step 6's force-with-lease can use it:

```bash
EXPECTED_SHA=$(git rev-parse origin/{branch})
```

Then rebase local onto the advanced base branch:

```bash
git pull --rebase origin {base-branch}
```

Base branch is `main` unless `steering/tech.md` or the runner config specifies otherwise.

### Re-compute the version bump against the new baseline

If Step 2 committed a version bump, the rebase may have pulled in a sibling's bump that changes the baseline. Re-apply the bump logic from `references/version-bump-delegation.md`:

1. Re-read the current version from `VERSION` after the rebase completes.
2. Apply the same `siblingClass`-aware bump classification.
3. If the re-computed version differs from what Step 3 committed, amend the version-bump commit:
   ```bash
   git checkout VERSION CHANGELOG.md [stack-specific files]
   # redo version artifact updates against the new baseline
   git add VERSION CHANGELOG.md [stack-specific files]
   git commit --amend -m "chore: bump version to {re-computed-new-version}" --no-edit
   ```

### Conflict handling

If the rebase produces conflicts in `VERSION`, `.codex-plugin/plugin.json`, `package.json`, or `CHANGELOG.md`, abort:

- **Interactive mode**: print the conflict list and the abort message below, then stop.
- **Unattended mode**: emit the escalation sentinel and exit non-zero — do NOT `git rebase --abort` silently; leave the conflict state for the operator.

Abort message:

```
ERROR: rebase conflict in version file(s): {file-list}. Resolve manually and re-run /commit-push. Force-push never overwrites unresolved conflicts.
```

Unattended escalation:

```
ESCALATION: commit-push — rebase conflict in version file(s): {file-list}. Resolve manually and re-run.
```

Record `rebased = true` before returning to Step 6 so the push takes the force-with-lease branch.

---

## Step 6: Safe force-push branch

When `rebased === true` AND `.codex/unattended-mode` exists, push with `--force-with-lease` bound to the `EXPECTED_SHA` captured **before** the rebase:

```bash
git push --force-with-lease=HEAD:$EXPECTED_SHA
```

### What makes the lease safe

`--force-with-lease=HEAD:$EXPECTED_SHA` tells git: "force-push only if `origin/{branch}` still points at `$EXPECTED_SHA`." Between our fetch and our push:

- **Nobody else pushed**: `origin/{branch}` still matches `$EXPECTED_SHA` → push proceeds with the rewrite. Safe.
- **Someone else pushed**: `origin/{branch}` has advanced → push is rejected non-fast-forward. The force-with-lease aborts instead of overwriting the other person's work. Safe by construction.

The runner interprets the "rejected — stale info" error as a recoverable condition (re-fetch and retry).

### Plain `git push` is wrong here

After a rebase the commit SHAs on local diverge from what the remote still holds. A plain `git push` is non-fast-forward and gets rejected. A plain `git push --force` would blindly overwrite — unsafe if anyone pushed to this branch between our fetch and push. `--force-with-lease` is the only correct push after a rebase.

### Interactive fallback

When `.codex/unattended-mode` is absent (interactive mode), do NOT take the force-with-lease branch automatically. Use interactive user prompt with two options:

- `[1] Force-push with lease — overwrite the remote feature branch`
- `[2] Abort — investigate the divergence manually`

If the user picks `[1]`, run the same `git push --force-with-lease=HEAD:$EXPECTED_SHA` command. If `[2]`, exit non-zero without pushing.
