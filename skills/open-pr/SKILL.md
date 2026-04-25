---
name: open-pr
description: "Create a pull request with spec-driven summary, linking GitHub issue and spec documents. Use when user says 'create PR', 'open pull request', 'submit for review', 'push for review', 'ready to merge', 'make a PR for issue #N', 'how do I create a PR', 'how do I open a pull request', or 'ship this'. Do NOT use for implementing code, verifying specs, creating issues, or committing/pushing — version bumping and pushing live in $nmg-sdlc:commit-push. Links specs and acceptance criteria into the PR body. Seventh step in the SDLC pipeline — follows $nmg-sdlc:commit-push and precedes $nmg-sdlc:address-pr-comments."
---

# Open PR

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

Read `../../references/interactive-gates.md` when the workflow reaches any manual-mode user decision, menu, review gate, or clarification prompt — Codex asks through `request_user_input` in Plan Mode, then finalizes a `<proposed_plan>` before execution.

Create a pull request with a spec-driven summary that links to the GitHub issue and references specification documents.

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before Step 1 if the project still keeps SDLC artifacts under `.codex/steering/` or `.codex/specs/`.

Read `../../references/unattended-mode.md` when the workflow starts — the sentinel actively suppresses the Step 7 CI-monitor prompt (the runner owns CI monitoring and merging). Version-bump and push duties have moved to `$nmg-sdlc:commit-push` as of FR1; this skill no longer owns a human-review gate for version bumping.

Read `../../references/feature-naming.md` when locating the spec directory for the issue and no `{feature-name}` is already known — the reference covers the `feature-{slug}` / `bug-{slug}` convention and the `**Issues**` frontmatter fallback chain.

Read `../../references/versioning.md` when you need the versioning invariants — single-source-of-truth (`VERSION`), major-bumps-are-manual, `.codex-plugin/plugin.json` manifest update, CHANGELOG conventions, and the epic-child downgrade rule. This skill reads the version artifacts (`VERSION`, `CHANGELOG.md`) to populate the PR body but does NOT modify them — `$nmg-sdlc:commit-push` owns the bump itself.

Read `../../references/steering-schema.md` when reading `steering/tech.md` for the `## Versioning` bump matrix or stack-specific versioned-files table — `tech.md` is the authoritative source for project-specific bump behaviour.

## Prerequisites

1. Implementation is complete (all tasks from `tasks.md` done).
2. Verification has passed (via `$nmg-sdlc:verify-code`).
3. Changes are committed AND pushed via `$nmg-sdlc:commit-push` — this skill reads `git log origin/main..HEAD` but does not push.

---

## Workflow

### Step 0: Parse Arguments

Inspect the invocation arguments for a `--major` token (alongside the issue number, e.g., `$nmg-sdlc:open-pr #42 --major`).

- `--major` present → set a `major_requested` flag and remember it through Step 2. This is the only supported path to a major version bump — the label-based classification matrix never produces one on its own.
- `--major` absent → `major_requested` is false and the rest of the workflow behaves normally.

**Unattended-mode escalation**: if `.codex/unattended-mode` exists AND `major_requested` is true, print this line exactly and stop:

```
ESCALATION: --major flag requires human confirmation — unattended mode cannot apply a major version bump
```

Do NOT continue to Step 1, do NOT commit or push, and do NOT create a PR. Version-bump mutation lives in `$nmg-sdlc:commit-push`; this skill does not touch `VERSION` or `CHANGELOG.md`, but the escalation still fires here because the `--major` decision is a release-level call that belongs with PR opening.

### Step 1: Read Context

Read `references/preflight.md` when Step 1 begins — the gate aborts before PR creation if the working tree is dirty, the branch has no non-bump commits, or local is not an ancestor of `origin/main` (i.e., `$nmg-sdlc:commit-push` has not yet reconciled divergence).

Gather all information needed for the PR:

1. **Read the issue** — `gh issue view #N` for title, description, acceptance criteria.
2. **Check for spec files** — file discovery for `specs/*/requirements.md` and match against the current issue number or branch name (see the feature-naming pointer above for the fallback chain). Found match → set a **specs-found** flag. No match → set **specs-not-found** flag.
3. **Read spec files (specs-found only)**:
   - `specs/{feature-name}/requirements.md` for acceptance criteria.
   - `specs/{feature-name}/tasks.md` for the testing phase.

   Skip this sub-step if specs-not-found — acceptance criteria will be extracted from the issue body already fetched in step 1.
4. **Read git state**:
   - `git status` — any uncommitted changes (must be empty; $nmg-sdlc:commit-push should have committed everything)?
   - `git log main..HEAD --oneline` — commits on this branch.
   - `git diff main...HEAD --stat` — files changed vs main.
5. **Read version artifacts for the PR body** — read `VERSION` and the latest heading in `CHANGELOG.md` to populate the PR body's Version line. Do NOT modify these files; `$nmg-sdlc:commit-push` is the only skill that writes version artifacts.

### Step 4: Generate PR Content

Read `references/pr-body.md` when assembling the PR title and body — the reference covers the conventional-commit title format, the specs-found Template A (full spec-linked body), and the specs-not-found Template B (fallback to issue-body ACs). Both templates include the conditional Version and epic-child "Bump" lines. The Version line is populated from the committed `VERSION` file (and the latest CHANGELOG heading); this skill does not compute or write the bump itself.

**Spike PRs**: the PR body template omits the `Version` line entirely and adds `Type: Spike research (no version bump)` in its place when the issue carries the `spike` label. The rest of the template (summary, specs reference, test plan) is unchanged.

### Step 5: Ancestry Check and Create PR

Verify local contains every commit in `origin/main`:

```bash
git merge-base --is-ancestor origin/main HEAD
```

- **Exit code 0**: local is up-to-date with or ahead of `origin/main` — proceed to `gh pr create`.
- **Non-zero**: local is behind `origin/main` (divergence has not been reconciled). Exit non-zero with this exact line on stdout:

  ```
  DIVERGED: re-run commit-push to reconcile before creating PR
  ```

  Do NOT rebase, do NOT amend, do NOT push, do NOT force-push. The SDLC runner reads the `DIVERGED:` sentinel via `bounceContext` and bounces control to `$nmg-sdlc:commit-push`, which owns rebase and push. In interactive use, the user re-runs `$nmg-sdlc:commit-push` manually.

Once the ancestry check passes, create the PR:

```bash
gh pr create --title "[title]" --body "[body]"
```

Add labels matching the issue when appropriate. Read `references/pr-body.md` for the output block.

### Step 6: Output (Base Case)

Follows the output block from `references/pr-body.md`. After printing, branch on `.codex/unattended-mode`:

- **Sentinel exists**: print `Done. Awaiting orchestrator.` and stop. Do NOT proceed to Step 7 — the runner owns CI monitoring and merging.
- **Sentinel absent**: fall through to Step 7.

### Step 7: Interactive CI Monitor + Auto-Merge (Opt-In)

Read `references/ci-monitoring.md` when `.codex/unattended-mode` does NOT exist — the reference covers the opt-in prompt, the 30-second polling loop with 30-minute timeout, the pre-merge `mergeStateStatus == CLEAN` check, the squash-merge-and-cleanup path, the failure path (which leaves the user on the feature branch), and the no-CI graceful-skip path. In unattended mode this step is actively suppressed and must not run.

---

## Integration with SDLC Workflow

```
$nmg-sdlc:draft-issue  →  $nmg-sdlc:start-issue #N  →  $nmg-sdlc:write-spec #N  →  $nmg-sdlc:write-code #N  →  $nmg-sdlc:simplify  →  $nmg-sdlc:verify-code #N  →  $nmg-sdlc:commit-push  →  $nmg-sdlc:open-pr #N  →  $nmg-sdlc:address-pr-comments #N
                                                                                                                              ▲ You are here
```
