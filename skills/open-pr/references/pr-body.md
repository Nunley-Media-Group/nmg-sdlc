# PR Body Templates and Push Logic

**Consumed by**: `open-pr` Steps 4 (generate PR content) and 5 (push and create PR).

Step 4 picks the PR body template based on the specs-found / specs-not-found flag from Step 1. Step 5 handles race detection with `origin/main` (for epic-child version bumps), the push itself, and the `gh pr create` invocation.

## Step 4: Generate PR content

### Title

- Format: `feat: [description] (#N)` or `fix: [description] (#N)`.
- Concise — under 70 characters.
- Uses conventional commit prefixes: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.

### Body — specs-found (Template A)

```markdown
## Summary

[2-3 bullet points: what changed and why, referencing the spec]

## Acceptance Criteria

From `specs/{feature}/requirements.md`:

- [ ] AC1: [criterion]
- [ ] AC2: [criterion]
- [ ] AC3: [criterion]

## Test Plan

From `specs/{feature}/tasks.md` testing phase:

- [ ] [Test type]: [what was tested]
- [ ] [Test type]: [what was tested]

## Version

<!-- Include this section only if Step 2/3 performed a version bump -->
**{bump_type}** bump: {old_version} → {new_version}

<!-- Include this line only when siblingClass is 'intermediate' or 'final' (epic children) -->
**Bump:** {bump_type} (epic child: {intermediate|final})

## Specs

- Requirements: `specs/{feature}/requirements.md`
- Design: `specs/{feature}/design.md`
- Tasks: `specs/{feature}/tasks.md`

Closes #N
```

### Body — specs-not-found (Template B, fallback to issue body)

```markdown
## Summary

[2-3 bullet points: what changed and why]

> **No spec files found — acceptance criteria extracted from issue body**

## Acceptance Criteria

From issue body:

- [ ] AC1: [criterion from issue body]
- [ ] AC2: [criterion from issue body]

## Test Plan

- [ ] [Test type]: [what was tested]

## Version

<!-- Include this section only if Step 2/3 performed a version bump -->
**{bump_type}** bump: {old_version} → {new_version}

<!-- Include this line only when siblingClass is 'intermediate' or 'final' (epic children) -->
**Bump:** {bump_type} (epic child: {intermediate|final})

Closes #N
```

## Step 5: Push and create PR

### 0. Pre-push race detection (epic children)

If Step 2/3 committed a version bump, detect whether `origin/{base-branch}` advanced during the local bump-and-commit (a concurrent epic-child PR merged first). Base branch is `main` unless a different target was specified.

1. Run `git fetch origin`.
2. Run `git merge-base --is-ancestor HEAD origin/{base-branch}`. Exit code 0 → bases are in sync, skip to step 1 below.
3. Non-zero (local is behind) → rebase:
   ```bash
   git pull --rebase origin {base-branch}
   ```
4. **Re-compute the bump** against the now-current `plugin.json` / `package.json` / `VERSION`:
   - Re-read the current version from `VERSION` (authoritative per `steering/tech.md`).
   - Apply the same `siblingClass`-aware bump logic from Step 2 to the new baseline.
   - If the re-computed version differs from what was committed in Step 3, amend the version-bump commit:
     ```bash
     git checkout VERSION CHANGELOG.md [stack-specific files]
     # redo Step 3 updates against the new baseline
     git add VERSION CHANGELOG.md [stack-specific files]
     git commit --amend -m "chore: bump version to {re-computed-new-version}" --no-edit
     ```
5. **Conflict handling.** If the rebase produces conflicts in `VERSION`, `plugin.json`, `marketplace.json`, `package.json`, or `CHANGELOG.md`, abort with:
   ```
   ERROR: rebase conflict in version file(s): {file-list}. Resolve manually and re-run /open-pr. Force-push is NEVER used by this skill.
   ```
   Exit non-zero. Do NOT pass `--force` or `--force-with-lease` to any `git push` invocation.

### 1. Push

Check if the remote tracking branch exists:

- No remote tracking branch: `git push -u origin HEAD`.
- Tracking branch exists but behind: `git push` (never `--force`).

### 2. Create the PR

```bash
gh pr create --title "[title]" --body "[body]"
```

### 3. Labels

Add labels matching the issue when appropriate.

## Output block

```
PR created: [PR URL]

Title: [title]
Base: main ← [branch-name]
Issue: Closes #N

[If specs-found]: The PR links to specs at specs/{feature}/ and will close issue #N when merged.
[If specs-not-found]: The PR extracts acceptance criteria from the issue body and will close issue #N when merged.
```

Then branch on the `.claude/unattended-mode` sentinel:

- **Sentinel exists**: print `Done. Awaiting orchestrator.` and stop. Do NOT proceed to Step 7 — the runner owns CI monitoring and merging.
- **Sentinel absent**: fall through to Step 7 (see `references/ci-monitoring.md`).
