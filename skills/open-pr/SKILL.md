---
name: open-pr
description: "Create a pull request with spec-driven summary, linking GitHub issue and spec documents. Use when user says 'create PR', 'open pull request', 'submit for review', 'push for review', 'ready to merge', 'make a PR for issue #N', 'how do I create a PR', 'how do I open a pull request', or 'ship this'. Do NOT use for implementing code, verifying specs, or creating issues. Handles version bumping, changelog updates, and links specs and acceptance criteria. Sixth step in the SDLC pipeline — follows /verify-code and precedes /address-pr-comments."
argument-hint: "[#issue-number] [--major]"
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Write, Edit, Bash(gh:*), Bash(git:*), Bash(sleep:*), AskUserQuestion
model: sonnet
effort: low
---

# Open PR

Create a pull request with a spec-driven summary that links to the GitHub issue and references specification documents.

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before Step 1 if the project still keeps SDLC artifacts under `.claude/steering/` or `.claude/specs/`.

Read `../../references/unattended-mode.md` when the workflow starts — the sentinel pre-approves the Step 2 version-bump confirmation and actively suppresses the Step 7 CI-monitor prompt (the runner owns CI monitoring and merging).

Read `../../references/feature-naming.md` when locating the spec directory for the issue and no `{feature-name}` is already known — the reference covers the `feature-{slug}` / `bug-{slug}` convention and the `**Issues**` frontmatter fallback chain.

Read `../../references/versioning.md` when you need the versioning invariants — single-source-of-truth (`VERSION`), major-bumps-are-manual, dual-file update (plugin.json + marketplace.json), CHANGELOG conventions, and the epic-child downgrade rule.

Read `../../references/steering-schema.md` when reading `steering/tech.md` for the `## Versioning` bump matrix or stack-specific versioned-files table — `tech.md` is the authoritative source for project-specific bump behaviour.

## Prerequisites

1. Implementation is complete (all tasks from `tasks.md` done).
2. Verification has passed (via `/verify-code`).
3. Changes are committed to a feature branch.

---

## Workflow

### Step 0: Parse Arguments

Inspect the invocation arguments for a `--major` token (alongside the issue number, e.g., `/open-pr #42 --major`).

- `--major` present → set a `major_requested` flag and remember it through Step 2. This is the only supported path to a major version bump — the label-based classification matrix never produces one on its own.
- `--major` absent → `major_requested` is false and the rest of the workflow behaves normally.

**Unattended-mode escalation**: if `.claude/unattended-mode` exists AND `major_requested` is true, print this line exactly and stop:

```
ESCALATION: --major flag requires human confirmation — unattended mode cannot apply a major version bump
```

Do NOT continue to Step 1, do NOT read/write `VERSION`, `CHANGELOG.md`, or any stack-specific version file, do NOT commit or push, and do NOT create a PR.

### Step 1: Read Context

Read `references/preflight.md` when Step 1 begins — the gate aborts before any version-artifact read/write if the working tree is dirty or the branch has no non-bump commits.

Gather all information needed for the PR:

1. **Read the issue** — `gh issue view #N` for title, description, acceptance criteria.
2. **Check for spec files** — `Glob` for `specs/*/requirements.md` and match against the current issue number or branch name (see the feature-naming pointer above for the fallback chain). Found match → set a **specs-found** flag. No match → set **specs-not-found** flag.
3. **Read spec files (specs-found only)**:
   - `specs/{feature-name}/requirements.md` for acceptance criteria.
   - `specs/{feature-name}/tasks.md` for the testing phase.

   Skip this sub-step if specs-not-found — acceptance criteria will be extracted from the issue body already fetched in step 1.
4. **Read git state**:
   - `git status` — any uncommitted changes?
   - `git log main..HEAD --oneline` — commits on this branch.
   - `git diff main...HEAD --stat` — files changed vs main.

### Step 2: Determine Version Bump

Read `references/version-bump.md` when a `VERSION` file exists at the project root **AND the issue does not carry the `spike` label** — the reference covers the current-version read, label-matrix lookup in `steering/tech.md`, the `--major` override, and the epic-child sibling-aware downgrade (including the epic-closure warning that gates on interactive vs. unattended mode). If no `VERSION` file exists, skip Steps 2 and 3 entirely. Spike-labelled issues skip Steps 2 and 3 entirely regardless of whether `VERSION` exists — the spike-skip branch is documented in `references/version-bump.md` § Spike handling and records `spike = true` for Step 4's PR body template.

### Step 3: Update Version Artifacts

Read `references/version-bump.md` when Step 2 produced a bump — the same reference covers writing the new version into `VERSION`, rolling the `[Unreleased]` CHANGELOG section under the new version heading (with partial-delivery annotation for intermediate epic children), updating stack-specific files from the `## Versioning` table, and committing with `chore: bump version to {new_version}`. Spike-labelled issues skip this step (no artifacts to update).

### Step 4: Generate PR Content

Read `references/pr-body.md` when assembling the PR title and body — the reference covers the conventional-commit title format, the specs-found Template A (full spec-linked body), and the specs-not-found Template B (fallback to issue-body ACs). Both templates include the conditional Version and epic-child "Bump" lines.

**Spike PRs**: when the session's `spike` flag is `true` (set by Step 2's spike-skip branch), the PR body template omits the `Version` line entirely and adds `Type: Spike research (no version bump)` in its place. The rest of the template (summary, specs reference, test plan) is unchanged.

### Step 5: Push and Create PR

Read `references/pr-body.md` when pushing and creating the PR — the reference covers the pre-push race-detection and re-bump logic for epic children (`git fetch`, ancestry check, rebase-and-amend, conflict handling that never force-pushes), the `git push -u origin HEAD` vs. `git push` branching, the `gh pr create` call, and the specs-found/specs-not-found output block.

### Step 6: Output (Base Case)

Follows the output block from `references/pr-body.md`. After printing, branch on `.claude/unattended-mode`:

- **Sentinel exists**: print `Done. Awaiting orchestrator.` and stop. Do NOT proceed to Step 7 — the runner owns CI monitoring and merging.
- **Sentinel absent**: fall through to Step 7.

### Step 7: Interactive CI Monitor + Auto-Merge (Opt-In)

Read `references/ci-monitoring.md` when `.claude/unattended-mode` does NOT exist — the reference covers the opt-in prompt, the 30-second polling loop with 30-minute timeout, the pre-merge `mergeStateStatus == CLEAN` check, the squash-merge-and-cleanup path, the failure path (which leaves the user on the feature branch), and the no-CI graceful-skip path. In unattended mode this step is actively suppressed and must not run.

---

## Integration with SDLC Workflow

```
/draft-issue  →  /start-issue #N  →  /write-spec #N  →  /write-code #N  →  /simplify  →  /verify-code #N  →  /open-pr #N  →  /address-pr-comments #N
                                                                                                                            ▲ You are here
```
