# PR Body Templates

**Consumed by**: `open-pr` Steps 4 (generate PR content) and 5 (create PR).

Step 4 picks the PR body template based on the specs-found / specs-not-found flag from Step 1. Step 5 verifies local ancestry vs. `origin/main` and invokes `gh pr create`. Push and rebase responsibilities have moved to `$nmg-sdlc:commit-push` — this reference no longer covers them.

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

## Step 5: Create PR

Ancestry, push, and rebase are owned by `$nmg-sdlc:commit-push` (see `skills/commit-push/references/rebase-and-push.md` for the force-with-lease envelope). By the time this reference is consulted, local must already be pushed and `origin/main` must already be an ancestor of HEAD.

SKILL.md Step 5 runs a final ancestry check:

```bash
git merge-base --is-ancestor origin/main HEAD
```

Exit 0 → proceed to `gh pr create`. Non-zero → exit non-zero with the sentinel line `DIVERGED: re-run commit-push to reconcile before creating PR` on stdout. The SDLC runner reads this sentinel through `bounceContext` and bounces control back to `$nmg-sdlc:commit-push`; in interactive use, the user re-runs `$nmg-sdlc:commit-push` manually.

### Create the PR

```bash
gh pr create --title "[title]" --body "[body]"
```

### Labels

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

Then branch on the `.codex/unattended-mode` sentinel:

- **Sentinel exists**: print `Done. Awaiting orchestrator.` and stop. Do NOT proceed to Step 7 — the runner owns CI monitoring and merging.
- **Sentinel absent**: fall through to Step 7 (see `ci-monitoring.md`).
