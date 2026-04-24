# Stale Remote Branch Reconciliation

**Consumed by**: `start-issue` Step 3.5 (before `gh issue develop --checkout` in Step 4).

When the runner re-picks an issue that already has a remote feature branch from an earlier cycle, the remote tip reflects work against a now-outdated `main`. Step 4's `gh issue develop --checkout` checks out that stale tip, and any subsequent rebase-plus-push in `/commit-push` or `/open-pr` collides with the remote. This step detects that state and deletes the stale remote branch before a fresh cycle rebuilds local.

The probe runs in **both** interactive and unattended modes — the difference is only whether deletion requires confirmation.

---

## Step 3.5 procedure

### 1. Derive the feature branch name for issue #N

Try the sources in order; stop at the first one that produces a branch name.

1. **GitHub linked branches** — `gh issue view N --json linkedBranches --jq '.linkedBranches[0].name // empty'`. This is the authoritative source when the issue already has a branch linked via `gh issue develop`.
2. **Fallback to the `{N}-{slug}` convention** — see `feature-naming.md` for the slug rules. Compute the expected name from the issue title.

If both sources return empty, there is no stale branch to reconcile — skip to Step 4 silently (no log line needed; the probe found nothing to do).

### 2. Probe for the remote branch

```bash
git ls-remote --heads origin {branch}
```

- **Empty output**: no remote branch exists — green path, proceed to Step 4 silently.
- **Non-empty output**: a remote branch exists. Capture the remote tip SHA from the `ls-remote` output.

### 3. Reachability check

Fetch `main` so the ancestor check uses fresh data:

```bash
git fetch origin main
```

Then check whether the remote tip is reachable from `origin/main`:

```bash
git merge-base --is-ancestor {remote-tip-sha} origin/main
```

- **Exit 0**: the remote tip is already merged into `main` (or is `main`'s current tip) — the branch is not stale, skip to Step 4 silently.
- **Non-zero**: the remote tip is NOT reachable from `origin/main` — the branch is **stale**. Proceed to Step 4 of this procedure.

### 4. Delete the stale remote branch

Unattended-mode deterministic-default (per `../../../references/unattended-mode.md`): delete without prompting. Interactive mode: confirm first.

#### Unattended mode (`.codex/unattended-mode` exists)

```bash
git push origin --delete {branch}
```

Log exactly:

```
Reconciled stale remote branch {branch} (tip {short-sha} not ancestor of origin/main)
```

Proceed to Step 4 — `gh issue develop --checkout` will now create a fresh branch against current `origin/main`.

#### Interactive mode

Use interactive user prompt with two options:

- `[1] Delete stale branch and proceed` — issue `git push origin --delete {branch}`, log the "Reconciled stale remote branch" line, and proceed to Step 4.
- `[2] Abort — keep stale branch for inspection` — exit non-zero without creating a branch so the user can inspect the remote state before re-running.

### 5. Logging rules

- The probe emits no log line when there is no remote branch (green path).
- The probe emits no log line when the remote branch is reachable from `origin/main` (already merged, not stale).
- The probe emits exactly one log line on a successful deletion: `Reconciled stale remote branch {branch} (tip {short-sha} not ancestor of origin/main)`.
- An interactive abort (option `[2]`) emits no log line — the user chose to inspect.

The `--is-ancestor` check is authoritative. Do not fall back to timestamp comparisons or commit-count heuristics — either the remote tip is in `origin/main`'s history or it is not.

---

## Why `origin/main` (not `main`)

The probe runs before Step 4, and Step 4's branch creation uses `gh issue develop --checkout` which writes a new local branch but does not update local `main`. Using `origin/main` (after the `git fetch origin main`) ensures the ancestor check compares against the freshest remote state, not whatever stale local `main` the working tree happens to hold.

## Edge cases

| Case | Behaviour |
|------|-----------|
| Remote branch exists but `git ls-remote` returns it with a tag-like suffix | Match strictly on the full ref name; ignore tags |
| Multiple remote branches match (e.g. `249-foo` and `249-foo-v2`) | Take the branch whose name the `gh issue view` linked-branches query reports; ignore others |
| `git fetch origin main` fails (network/auth) | Skip the probe entirely; emit `WARNING: stale-remote probe skipped (fetch failed)` and proceed to Step 4. Do not abort — the runner's dirty-tree check still fires before branch creation. |
| The remote branch exists AND is reachable from `origin/main` | Skip silently — the branch has been merged and the remote hasn't been cleaned up yet; it is not stale for our purposes |
