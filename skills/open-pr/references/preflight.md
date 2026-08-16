# Open-PR Delivery Preparation

**Consumed by**: `open-pr` Step 1.

Before PR creation or resumption, `$nmg-sdlc:open-pr` prepares the branch for terminal delivery. Dirty eligible work is committed, refreshed base changes are merged without rewriting published history, safe pushes happen here, and clean already-pushed branches continue without a redundant commit.

## Step 1a: Inspect the Delivery Scope

Read `../../../references/dirty-tree.md` when Step 1a runs:

- run `git status --porcelain`;
- compare every dirty path with the implementation/specification scope approved for this delivery;
- stop for user direction when unrelated dirty changes overlap or cannot be separated safely.

## Step 1b: Stage Eligible Changes

If eligible changes exist, stage only the explicit approved paths:

```bash
git add -- <approved-path-1> <approved-path-2> ...
```

Never use `git add -A` or `git add .`. Then inspect
`git diff --cached --name-only` and require exact equality with the approved
eligible path set. If the staged set is empty, record `eligible_dirty = false`;
otherwise record `eligible_dirty = true`.

## Step 1c: Prepare Version Artifacts

Run `open-pr` Steps 2 and 3 before creating the delivery commit:

- skip version work for `spike` issues or projects without `VERSION`;
- apply the label-based bump from `steering/tech.md`;
- update `VERSION`, `CHANGELOG.md`, `.codex-plugin/plugin.json`, and stack-specific files declared in `steering/tech.md`;
- stage those version artifacts with the eligible delivery changes.

Use the explicit version gate defined by `references/version-bump.md` before writing version artifacts.

## Step 1d: Create or Skip the Delivery Commit

After staging, inspect `git diff --cached --name-only`.

- **Staged files exist and implementation/spec/docs files are included**: commit once with `feat: <short description> (#N)` for enhancement labels or `fix: <short description> (#N)` for bug labels.
- **Only version artifacts are staged**: commit with `chore: bump version to {new_version}`.
- **No staged files exist**: set `delivery_commit_created = false`, print `No additional commit needed — branch already clean.`, and continue to ancestry/push verification.

If the branch has no commits ahead of `main` after this step, stop with `No implementation commits found on this branch — run $nmg-sdlc:write-code before opening a PR.`

## Step 1e: Fetch and Merge the Base if Behind

Fetch the base and branch refs:

```bash
git fetch origin
git merge-base --is-ancestor origin/main HEAD
```

- **Exit 0**: local already contains `origin/main`; set `base_merged = false`.
- **Non-zero**: local is behind `origin/main`; merge the refreshed base without rewriting any feature commit:

```bash
git merge --no-edit origin/main
```

If the merge brings in a sibling version bump, re-run Step 1c against the post-merge baseline. If the computed version changes, create a new correction commit containing only the approved version artifacts; do not amend a pushed commit.

### Merge Conflicts

If merge conflicts touch `VERSION`, `.codex-plugin/plugin.json`, `CHANGELOG.md`, or stack-specific version files, print `ERROR: merge conflict in version file(s): {file-list}. Resolve the exact conflict and re-run $nmg-sdlc:open-pr. Delivery never force-pushes.` and stop. Other safe conflicts may be fixed in scope, reverified, committed, and re-observed through the terminal loop.

## Step 1f: Push Safely

Branch on remote state:

1. No remote tracking branch:
   ```bash
   git push -u origin HEAD
   ```
2. Tracking branch exists:
   ```bash
   git push
   ```
Never use `--force`, `--force-with-lease`, or update a remote feature ref through any other history-rewriting mechanism. A non-fast-forward rejection means remote state changed; fetch, inspect, and merge compatible remote work or report the exact external-authority blocker.

## Step 1g: Verify Delivery State

Before PR creation, run:

```bash
git log origin/{branch}..HEAD --oneline
git merge-base --is-ancestor origin/main HEAD
```

Both checks must pass: no unpushed commits and local contains `origin/main`. If either fails, exit non-zero with a concise explanation. Do not create a PR from an unpushed or stale branch.
