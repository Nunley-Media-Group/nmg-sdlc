---
name: commit-push
description: "Stage, bump version, commit with conventional-commit message, fetch, rebase if diverged, and push the feature branch. Use when user says 'commit and push', 'push my changes', 'push to remote', 'commit the work', 'ship the commit', or when the SDLC runner invokes the commitPush step. Do NOT use for creating PRs, merging, or verifying code. Handles force-with-lease safely under unattended mode after a rebase. Sixth step in the SDLC pipeline — follows /verify-code and precedes /open-pr."
---

# Commit and Push

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

Stage implementation work, bump the project version, write a conventional-commit message, reconcile with the remote base branch if necessary, and push the feature branch. Owns history reconciliation for the pipeline so `/open-pr` can stay scoped to PR creation.

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before Step 1 if the project still keeps SDLC artifacts under `.codex/steering/` or `.codex/specs/` (the current Codex release refuses to Edit/Write there).

Read `../../references/unattended-mode.md` when the workflow starts — the sentinel pre-approves the force-with-lease branch in Step 6 and actively suppresses the interactive confirmation prompt used in manual mode.

Read `../../references/feature-naming.md` when locating the spec directory for the issue and no `{feature-name}` is already known — the reference covers the `feature-{slug}` / `bug-{slug}` convention and the `**Issues**` frontmatter fallback chain.

Read `../../references/versioning.md` when you need the versioning invariants — single-source-of-truth (`VERSION`), major-bumps-are-manual, dual-file update, CHANGELOG conventions, and the epic-child downgrade rule.

Read `../../references/steering-schema.md` when reading `steering/tech.md` for the `## Versioning` bump matrix or stack-specific versioned-files table — `tech.md` is the authoritative source for project-specific bump behaviour.

Read `references/version-bump-delegation.md` when a `VERSION` file exists at the project root and the issue does not carry the `spike` label — the reference points at the canonical bump-matrix lookup and artifact-update procedure.

Read `references/rebase-and-push.md` when `git fetch` shows the remote has diverged from local — the reference covers ancestry detection, rebase-on-divergence, the force-with-lease safety envelope, and conflict handling.

## Prerequisites

1. Implementation commits or uncommitted work exist on the current feature branch.
2. The working tree may be dirty — this skill stages and commits it.
3. `origin` remote is reachable for fetch and push.

---

## Workflow

### Step 1: Stage Changes

Stage all tracked and untracked changes (excluding SDLC runner artifacts already covered by `.gitignore`):

```bash
git add -A
```

If `git status --porcelain` (after staging) is empty AND `git log main..HEAD --oneline` is also empty, there is nothing to commit or push — exit 0 with the note `No changes to commit or push`.

### Step 2: Apply Version Bump

Read `references/version-bump-delegation.md`. Apply the version bump (unless spike-labelled or no `VERSION` file exists). Stage the updated version artifacts (`VERSION`, `CHANGELOG.md`, and any stack-specific files from the `## Versioning` table in `steering/tech.md`).

### Step 3: Commit

Write a conventional-commit message summarising the issue's implementation (e.g., `feat: <short description> (#N)` or `fix: <short description> (#N)`). If the working tree is clean but a version bump was applied in Step 2, commit the bump with `chore: bump version to {new_version}`. If there are implementation changes to commit, combine them into a single commit; otherwise commit the bump separately.

```bash
git commit -m "feat: <description> (#N)"
```

### Step 4: Fetch + Ancestry Check

```bash
git fetch origin
git merge-base --is-ancestor origin/{base-branch} HEAD
```

Base branch is `main` unless steering/config specifies otherwise.

- **Exit code 0**: local contains every commit in `origin/{base-branch}` — no rebase needed, proceed to Step 6.
- **Non-zero**: local does not contain `origin/{base-branch}`'s tip — proceed to Step 5.

### Step 5: Rebase on Divergence

Read `references/rebase-and-push.md` — the reference covers the rebase command, re-computing the version bump against the new baseline, amending the bump commit if the new version differs, and conflict handling.

Mark this session as `rebased = true` so Step 6 takes the force-with-lease branch.

### Step 6: Push

The push branches on four signals: remote tracking state, whether Step 5 rebased, the `.codex/unattended-mode` sentinel, and the force-with-lease safety check.

1. **No remote tracking branch** (first push for this branch):
   ```bash
   git push -u origin HEAD
   ```
2. **Tracking exists, `rebased === false`**, fast-forward:
   ```bash
   git push
   ```
3. **Tracking exists, `rebased === true`, `.codex/unattended-mode` sentinel present, safe lease**:
   ```bash
   git push --force-with-lease=HEAD:$EXPECTED_SHA
   ```
   Where `$EXPECTED_SHA` is the `origin/{branch}` SHA recorded **before** the rebase (the `git fetch` output). The safe-lease check fails if the remote advanced between the fetch and the push — this is the safety envelope.
4. **Tracking exists, `rebased === true`, sentinel absent** (interactive mode):
   Use interactive user prompt with options `[1] Force-push with lease` and `[2] Abort — resolve manually`. Proceed with the user's selection. Abort exits non-zero.

Read `references/rebase-and-push.md` § "Safe lease" for the exact `--force-with-lease` invocation and the recovery path when the lease check rejects the push.

### Step 7: Verify Push Success

After the push returns, verify no unpushed commits remain:

```bash
git log origin/{branch}..HEAD --oneline
```

If the output is non-empty OR `git push` reported an error, exit with a non-zero status code. The SDLC runner's post-step push-validation gate reads the same signal.

---

## Output

```
--- Commit and Push Complete ---
Branch: {branch}
Commits pushed: {N}
Version bump: {old → new | none}
Rebased: {yes | no}
Force-with-lease used: {yes | no}

[If `.codex/unattended-mode` does NOT exist]: Next step: Run `/open-pr #N` to open a pull request.
[If `.codex/unattended-mode` exists]: Done. Awaiting orchestrator.
```

---

## Integration with SDLC Workflow

```
/draft-issue  →  /start-issue #N  →  /write-spec #N  →  /write-code #N  →  /simplify  →  /verify-code #N  →  /commit-push  →  /open-pr #N  →  /address-pr-comments #N
                                                                                                                  ▲ You are here
```

The commit-push skill is invoked by the SDLC runner as the `commitPush` step. Its postcondition — `origin/{branch}` matches `HEAD` after push — is the precondition for `/open-pr`, which checks ancestry with `origin/main` but no longer pushes.
