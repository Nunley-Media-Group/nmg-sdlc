---
name: write-spec
description: "Create BDD specifications for an executable GitHub issue. Use when /sdlc-write-spec #N. After approval, publishes specs/{N}-{slug}/ from the default branch, commits, pushes, squash-merges a docs-only spec PR, then asks to continue or finish."
---

# Write Spec

Read `../../references/codex-tooling.md` for OMP tool mapping (read/grep/glob/ask/write to local/xd).

Read `references/publish.md` when executing Approval Behavior or the continue loop.

In the TUI, `/sdlc-write-spec` is rewritten to native `/plan` before this workflow runs. If write/edit tools are present, that is post-approval execution — continue; do not bounce. Do not run this workflow headless (print/RPC); those surfaces fail closed.

## Requirements on $ARGUMENTS

Trim $ARGUMENTS. Must match ^#?\d+$. Else print:

Usage: /sdlc-write-spec #N

and stop.

Let N = the numeric issue id (strip leading #).

Keep an in-memory `published[]` list of issue numbers published in this session. Start empty.

## Discovery

Use glob `specs/${N}-*/` (or read gh issue for title if needed to derive slug).

- If exactly one specs/{N}-* dir exists: update in place (must have **Issue**: #N in files).

- Else: derive slug from gh issue title (or provided), create specs/{N}-{slug}/

Never write into a directory whose leading number != N.

Read gh issue #N --json title,body,labels,state to get title, check labels for bug, check state.

If the dir exists and has **Status**: Approved and the issue is closed/merged: do not rewrite. Print: "Spec already approved for closed issue #N. Open a new issue for follow-up work." Stop.

If open or undelivered: rewrite in place and (later) append revision to Change History.

## Classification from labels / body

- bug label → bug path (defect templates)

- else feature

Never treat a leftover `spike` label as a separate path. `upgrade-project` converts leftover spike artifacts. This skill always writes an ordinary `specs/{N}-{slug}/` package.

## Interview (max 3 asks per issue)

Use ask (rec first) only for prefs if any (e.g. confirm slug on conflict, or scope notes). Typically 0 asks for simple #N; at most 3.

Each interview or preference question includes a short paragraph stating the situation and the facts needed to choose among the shown options. The continue/finish ask stays canned and is not required to add a situation paragraph.

The continue-loop ask does not consume this budget. Each later issue gets a fresh 3-ask interview budget.

No review gates (deleted 3 gates, epic role, umbrella).

## Feature / Bug package

Plan Approach section includes the **full text** of:

- requirements.md (use singular **Issue**: #N , Status: Draft, appropriate heading # Requirements: or # Defect Report: with **Related Spec** if bug)

- design.md

- tasks.md

- feature.gherkin

Every written file, including `feature.gherkin` and defect variants, must carry:

```
**Issue**: #N
**Date**: YYYY-MM-DD
**Status**: Draft
**Author**: ...
```

Approval rewrites **Status** to Approved on all four files. Defect `tasks.md` and defect Gherkin use Draft | Approved only — never Planning / In Progress / Complete / In Review.

Use templates from templates/ (read at runtime), fill from issue body + steering + investigation (read steering/*, glob source for patterns).

## Plan File

Slug: spec-{N}

Write:

local://spec-{N}-plan.md

Content includes:

- issue: N

- slug

- title

- classification: feature|bug

- targetDir

- the full file contents to write on approval

- frontmatter rules: singular **Issue**, Status Approved on approval

- helper commands and continue-loop rules (prepare, write Approved package, commit-push, merge spec PR into the default branch, then ask Continue/Finished)

Only the first spec in a session uses `xd://propose`. Continuation never calls `xd://propose`.

## Approval Behavior (in plan execution after xd propose)

Exact order after first propose approval:

1. `node scripts/publish-approved-spec.mjs prepare --issue N --name {N}-{slug}` (`{N}-{slug}` = basename of `targetDir`). Failure → stop, do not write files.

2. Write/overwrite the four spec files with `**Status**: Approved` (existing frontmatter and Change History rules). Fail closed if any written `**Issue**` ≠ `#N`. Never write into a directory whose leading number ≠ `N`.

3. `node scripts/publish-approved-spec.mjs commit-push --issue N --dir specs/{N}-{slug}`. Failure → stop; leave branch and files. Commit subject is exactly `docs: approve spec for #N`.

4. `node scripts/publish-approved-spec.mjs merge --issue N --dir specs/{N}-{slug}`. Opens a docs-only PR into the repository default branch and squash-merges it. PR title is `docs: approve spec for #N`. PR body must not use `Closes #N` or any other closing keyword. Failure → stop; leave the spec branch and files. After success the helper is on the default branch with the merged spec.

5. Append `N` to in-memory `published[]`.

6. Continue loop. Do not print execute yet.

If this was an existing undelivered package: append row to ## Change History : | #N | today | Spec revised before delivery |

Initial write uses "Initial feature spec" or "Initial defect report"

## Continue loop

Does not consume interview budget. One `ask`, 2–4 options, recommended first.

Candidates: `gh issue list --state open --limit 100 --json number,title`. Drop `published[]`. Drop any `M` whose unique worktree `specs/{M}-*/` is Approved, or whose unique `refs/heads/{M}-*` / `refs/remotes/origin/{M}-*` has an approved four-file package (same rules as execute `specStatus`). Sort by number ascending.

- ≥1 candidate: up to three labels `#M — {title}` (recommended index 0), last option `Finished — stop writing specs`. Extra numbers use automatic Other.

- 0 candidates: `Continue — enter another issue number` (recommended) and `Finished — stop writing specs`. Other supplies `#M` / `M`.

Finished — print exactly:

```
Published specs: #<n> on <n>-<slug>[, ...]
Next step: /sdlc-execute #<first-published>
```

Stay on the repository default branch (the spec is already merged). Stop.

Continue / candidate / Other `#M`:

- Parse `^#?([1-9]\d*)$`. Invalid → re-ask continue.

- Already in `published[]` or already approved → print `Spec already approved for #M.` and re-ask.

- Closed/merged and approved → print `Spec already approved for closed issue #M. Open a new issue for follow-up work.` and re-ask.

- Else: `node scripts/publish-approved-spec.mjs default-branch` (fail → stop; keep the current branch; do not guess `main`). Then Discovery → Classification → Interview (fresh 3-ask budget) → prepare → write Approved package → commit-push → merge → append `M` → loop. No second `xd://propose`.

## Finish (first spec only)

Write plain:

spec-{N}

<title from gh or derived>

to xd://propose
