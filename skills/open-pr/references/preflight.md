# Open-PR Delivery Preparation

**Consumed by**: `open-pr` Step 1.

Before `gh pr create`, `$nmg-sdlc:open-pr` prepares the branch for delivery. Dirty eligible work is committed, local divergence is rebased, safe pushes happen here, and clean already-pushed branches continue without a redundant commit.

## Step 1a: Filter Runner Artifacts

Read `../../../references/dirty-tree.md` when Step 1a runs — use its filtering rule for SDLC runtime artifacts:

- run `git status --porcelain`;
- remove rows whose path ends with `.codex/sdlc-state.json` or `.codex/unattended-mode`;
- treat the remaining rows as eligible delivery changes.

Never publish `.codex/sdlc-state.json` or `.codex/unattended-mode`. If only those runtime artifacts are dirty, record `eligible_dirty = false` and continue.

## Step 1b: Stage Eligible Changes

If eligible changes exist, stage them with normal git staging while preserving the runtime-artifact filter:

```bash
git add -A
git reset -- .codex/sdlc-state.json .codex/unattended-mode
```

Then inspect `git diff --cached --name-only`. If the staged set is empty, record `eligible_dirty = false`; otherwise record `eligible_dirty = true`.

## Step 1c: Prepare Version Artifacts

Run `open-pr` Steps 2 and 3 before creating the delivery commit:

- skip version work for `spike` issues or projects without `VERSION`;
- apply the label-based bump from `steering/tech.md`;
- update `VERSION`, `CHANGELOG.md`, `.codex-plugin/plugin.json`, and stack-specific files declared in `steering/tech.md`;
- stage those version artifacts with the eligible delivery changes.

If the version computation requires a human-only decision, use the gate defined by `references/version-bump.md`; in unattended mode, use its documented deterministic default or escalation path.

## Step 1d: Create or Skip the Delivery Commit

After staging, inspect `git diff --cached --name-only`.

- **Staged files exist and implementation/spec/docs files are included**: commit once with `feat: <short description> (#N)` for enhancement labels or `fix: <short description> (#N)` for bug labels.
- **Only version artifacts are staged**: commit with `chore: bump version to {new_version}`.
- **No staged files exist**: set `delivery_commit_created = false`, print `No additional commit needed — branch already clean.`, and continue to ancestry/push verification.

If the branch has no commits ahead of `main` after this step, stop:

- **Interactive mode**: print `No implementation commits found on this branch — run $nmg-sdlc:write-code before opening a PR.`
- **Unattended mode**: emit `ESCALATION: open-pr — No implementation commits found on this branch — run $nmg-sdlc:write-code before opening a PR.`

## Step 1e: Fetch and Rebase if Behind

Fetch the base and branch refs:

```bash
git fetch origin
git merge-base --is-ancestor origin/main HEAD
```

- **Exit 0**: local already contains `origin/main`; set `rebased = false`.
- **Non-zero**: local is behind `origin/main`; record the remote feature-branch tip and rebase:

```bash
EXPECTED_SHA=$(git rev-parse origin/{branch})
git pull --rebase origin main
```

If the rebase pulls in a sibling version bump, re-run Step 1c against the post-rebase baseline. If the computed version changes, amend the delivery commit so the final commit contains the correct version artifacts.

### Rebase Conflicts

If rebase conflicts touch `VERSION`, `.codex-plugin/plugin.json`, `CHANGELOG.md`, or stack-specific version files:

- **Interactive mode**: print `ERROR: rebase conflict in version file(s): {file-list}. Resolve manually and re-run $nmg-sdlc:open-pr. Force-push never overwrites unresolved conflicts.` and stop.
- **Unattended mode**: emit `ESCALATION: open-pr — rebase conflict in version file(s): {file-list}. Resolve manually and re-run.` and exit non-zero.

## Step 1f: Push Safely

Branch on remote state and `rebased`:

1. No remote tracking branch:
   ```bash
   git push -u origin HEAD
   ```
2. Tracking branch exists and `rebased === false`:
   ```bash
   git push
   ```
3. Tracking branch exists and `rebased === true`:
   ```bash
   git push --force-with-lease=HEAD:{EXPECTED_SHA}
   ```

The `EXPECTED_SHA` value is captured before the rebase. If the lease rejects the push, stop rather than overwriting remote work:

- **Interactive mode**: print the rejection and stop for manual investigation.
- **Unattended mode**: emit `ESCALATION: open-pr — force-with-lease rejected because the remote branch advanced. Re-run after fetching the latest remote state.`

## Step 1g: Verify Delivery State

Before PR creation, run:

```bash
git log origin/{branch}..HEAD --oneline
git merge-base --is-ancestor origin/main HEAD
```

Both checks must pass: no unpushed commits and local contains `origin/main`. If either fails, exit non-zero with a concise explanation. Do not create a PR from an unpushed or stale branch.
