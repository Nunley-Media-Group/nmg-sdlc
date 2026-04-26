---
name: open-pr
description: "Prepare delivery and create a pull request with spec-driven summary, linking GitHub issue and spec documents. Use when user says 'create PR', 'open pull request', 'submit for review', 'push for review', 'ready to merge', 'make a PR for issue #N', 'how do I create a PR', 'how do I open a pull request', or 'ship this'. Stages eligible work, applies the version bump, commits, rebases safely, pushes, and creates the PR. Seventh step in the SDLC pipeline — follows $nmg-sdlc:verify-code and precedes $nmg-sdlc:address-pr-comments."
---

# Open PR

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

Read `../../references/interactive-gates.md` when the workflow reaches any manual-mode user decision, menu, review gate, or clarification prompt — Codex asks through `request_user_input` in Plan Mode, then finalizes a `<proposed_plan>` before execution.

Create a pull request with a spec-driven summary that links to the GitHub issue and references specification documents.

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before Step 1 if the project still keeps SDLC artifacts under `.codex/steering/` or `.codex/specs/`.

Read `../../references/unattended-mode.md` when the workflow starts — the sentinel actively suppresses the Step 7 CI-monitor prompt (the runner owns CI monitoring and merging) and pre-approves deterministic delivery preparation except for explicit escalation branches such as `--major`.

Read `../../references/feature-naming.md` when locating the spec directory for the issue and no `{feature-name}` is already known — the reference covers the `feature-{slug}` / `bug-{slug}` convention and the `**Issues**` frontmatter fallback chain.

Read `../../references/versioning.md` when you need the versioning invariants — single-source-of-truth (`VERSION`), major-bumps-are-manual, `.codex-plugin/plugin.json` manifest update, CHANGELOG conventions, and the epic-child downgrade rule.

Read `../../references/steering-schema.md` when reading `steering/tech.md` for the `## Versioning` bump matrix or stack-specific versioned-files table — `tech.md` is the authoritative source for project-specific bump behaviour.

## Prerequisites

1. Implementation is complete (all tasks from `tasks.md` done).
2. Verification has passed (via `$nmg-sdlc:verify-code`).
3. `origin` is reachable for fetch, rebase, push, and PR creation.

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

Do NOT continue to Step 1, do NOT commit or push, and do NOT create a PR. Major version bumps are a release-level call that cannot be made headlessly.

### Step 1: Read Context

Read `references/preflight.md` when Steps 1–3 have collected issue context and prepared version artifacts — it stages eligible non-runner work, preserves `.codex` runtime-artifact filtering, classifies clean/no-op branches, fetches origin, rebases when needed, pushes safely, and verifies that no unpushed commits remain before PR creation.

Gather all information needed for the PR:

1. **Read the issue** — `gh issue view #N` for title, description, acceptance criteria.
2. **Check for spec files** — file discovery for `specs/*/requirements.md` and match against the current issue number or branch name (see the feature-naming pointer above for the fallback chain). Found match → set a **specs-found** flag. No match → set **specs-not-found** flag.
3. **Read spec files (specs-found only)**:
   - `specs/{feature-name}/requirements.md` for acceptance criteria.
   - `specs/{feature-name}/tasks.md` for the testing phase.

   Skip this sub-step if specs-not-found — acceptance criteria will be extracted from the issue body already fetched in step 1.
4. **Read git state**:
   - `git status` — eligible changes after delivery preparation.
   - `git log main..HEAD --oneline` — commits on this branch.
   - `git diff main...HEAD --stat` — files changed vs main.
5. **Read version artifacts for the PR body** — read `VERSION`, `CHANGELOG.md`, and the delivery-preparation results to populate the PR body's Version line.

### Step 2: Determine Version Bump

Read `references/version-bump.md` when a `VERSION` file exists at the project root and the issue does not carry the `spike` label. Classify the version bump from `steering/tech.md`, honor `--major` only in interactive mode, apply the epic-child downgrade rule, and record `old_version`, `new_version`, `bump_type`, `siblingClass`, and `epicParentNumber`.

### Step 3: Apply Version Artifacts

Use `references/version-bump.md` to update `VERSION`, `CHANGELOG.md`, `.codex-plugin/plugin.json`, and any stack-specific version files from `steering/tech.md`. Stage the version artifacts with the rest of the delivery changes so the delivery commit contains a coherent release state. If there are no implementation changes and only version artifacts changed, use the `chore: bump version to {new_version}` commit message.

### Step 4: Generate PR Content

Read `references/pr-body.md` when assembling the PR title and body — the reference covers the conventional-commit title format, the specs-found Template A (full spec-linked body), and the specs-not-found Template B (fallback to issue-body ACs). Both templates include the conditional Version and epic-child "Bump" lines. Generate this content after delivery preparation so the Version line reflects committed artifacts.

**Spike PRs**: the PR body template omits the `Version` line entirely and adds `Type: Spike research (no version bump)` in its place when the issue carries the `spike` label. The rest of the template (summary, specs reference, test plan) is unchanged.

### Step 5: Push and Create PR

Before `gh pr create`, confirm the delivery-preparation postconditions from `references/preflight.md`:

- local contains `origin/main`;
- `git log origin/{branch}..HEAD --oneline` is empty;
- runner artifacts remain untracked/unpublished;
- `delivery_commit_created` accurately records whether this invocation created a commit.

Then create the PR:

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
$nmg-sdlc:draft-issue  →  $nmg-sdlc:start-issue #N  →  $nmg-sdlc:write-spec #N  →  $nmg-sdlc:write-code #N  →  $nmg-sdlc:simplify  →  $nmg-sdlc:verify-code #N  →  $nmg-sdlc:open-pr #N  →  $nmg-sdlc:address-pr-comments #N
                                                                                                       ▲ You are here
```
