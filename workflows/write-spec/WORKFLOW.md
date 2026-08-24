---
name: write-spec
description: "Create BDD specifications for open GitHub issues. Use when /sdlc-write-spec [#N]: bare invocation presents issues missing spec-created, while an explicit number selects one directly. After approval, publishes specs/{N}-{slug}/ from the default branch, commits, pushes, squash-merges a docs-only spec PR, then asks to continue or finish."
---

# Write Spec

Read `../../references/codex-tooling.md` for OMP tool mapping (read/grep/glob/ask/write to local/xd).

Read `references/publish.md` when executing Approval Behavior or the continue loop.

In the TUI, `/sdlc-write-spec` is rewritten to native `/plan` before this workflow runs. If write/edit tools are present, that is post-approval execution — continue; do not bounce. Do not run this workflow headless (print/RPC); those surfaces fail closed.

## Initial issue selection

Trim `$ARGUMENTS`.

If the trimmed value is non-empty:

1. Require it to match `^#?\d+$`. Otherwise print exactly `Usage: /sdlc-write-spec #N` and stop.
2. Let N be the numeric issue id after stripping a leading `#`.
3. Skip the bare picker and continue directly to Discovery.

If the trimmed value is empty:

1. Before any usage gate or `ask`, run:

   ```text
   node scripts/publish-approved-spec.mjs missing-spec-created
   ```

2. Require exit 0 and parse the complete JSON object. On non-zero or malformed output, print its `reasonCode` or helper failure output and stop without asking or inventing choices.
3. Require `issues` to be a complete array of positive safe-integer `number` and non-empty string `title` rows. Invalid rows are `issues_unreadable`; print that reason and stop.
4. If `issues` is empty, print exactly `No open issues missing spec-created.` and stop without `ask` or usage output.
5. Cache the complete `issues` array for this initial picker. Ask once with at most its first three rows as `#M — {title}`, recommended index 0, followed by exactly `Finished — stop without writing a spec`. Automatic Other remains available.
6. A listed choice sets N. Parse automatic Other with `^#?([1-9]\d*)$`; a valid number sets N, while invalid input re-asks the same picker from the cached rows without rerunning the helper.
7. Finished stops immediately without Discovery and without printing `Published specs:` or `Next step:`.

After the initial selection, continue to Discovery with N.

Keep an in-memory `published[]` list of issue numbers published in this session. Start empty.

## Discovery

Run:

```text
node scripts/publish-approved-spec.mjs discover --issue N
```

Require exit 0 and parse the complete JSON object. Use `issue.number`, `title`, `body`, `labels`, and `state`; `classification`; `slug`; `targetDir`; and `spec.dir`, `approved`, and `source` directly. On non-zero or malformed output, print its `reasonCode` and stop. Do not reproduce slug, directory, branch, or approval resolution.

Discovery only returns this result. It never stops or chooses whether to revise based on approval or issue state; its caller owns that control flow.

`classification` is `bug` or `feature`. A leftover `spike` label is neutral; never create a third path.

### Initial discovery result

For the initial `$ARGUMENTS` issue only:

- If `spec.approved` and `issue.state` is closed: do not rewrite. Print: "Spec already approved for closed issue #N. Open a new issue for follow-up work." Stop.
- Otherwise continue to Interview. When `spec.dir` identifies an open or undelivered existing package, revise `targetDir` in place and later append the revision to Change History. Never write into a directory whose leading number differs from N.

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

4. `node scripts/publish-approved-spec.mjs merge --issue N --dir specs/{N}-{slug}`. Require and parse the complete JSON response even on non-zero exit. If the response is malformed, or non-zero without `merged: true`, print its `reasonCode` and stop; leave the spec branch and files. A response with `merged: true` means publication succeeded even when checkout or labeling failed: append `N` to `published[]` exactly once, print the PR number and `reasonCode`, run the matching remediation from `references/publish.md`, report any remediation failure, and continue without rewriting the package. A successful response leaves the helper on the default branch.

5. If `N` was not already recorded from a post-merge failure, append it to in-memory `published[]`.

6. Continue loop. Do not print execute yet.

If this was an existing undelivered package: append row to ## Change History : | #N | today | Spec revised before delivery |

Initial write uses "Initial feature spec" or "Initial defect report"

## Continue loop

Does not consume interview budget. Invoke:

```text
node scripts/publish-approved-spec.mjs candidates [--published N ...]
```

Include one `--published N` pair for every number in the in-memory `published[]` list. Require exit 0 and consume the complete `candidates` array. The helper owns GitHub listing, deduplication, numeric sorting, and shared approval filtering; do not repeat those rules.

Use one `ask`, 2–4 options, recommended first:

- One or more rows: show at most the first three as `#M — {title}` (recommended index 0), followed by `Finished — stop writing specs`. Extra number entry remains available through automatic Other.
- No rows: `Continue — enter another issue number` (recommended) and `Finished — stop writing specs`. Other supplies `#M` / `M`.

Finished — print exactly:

```
Published specs: #<n> on <n>-<slug>[, ...]
Next step: /sdlc-execute #<first-published>
```

Stay on the repository default branch (the spec is already merged). Stop.

Continue / candidate / Other `#M`:

- Parse `^#?([1-9]\d*)$`. Invalid → re-ask continue.
- Already in `published[]` → print `Spec already approved for #M.` and re-ask.
- Otherwise run `node scripts/publish-approved-spec.mjs default-branch` (fail → stop; keep the current branch; do not guess `main`), set N = M, and rerun Discovery.
- If Discovery returns `spec.approved`:
  - Closed issue → print `Spec already approved for closed issue #M. Open a new issue for follow-up work.` and re-ask.
  - Any other issue state → print `Spec already approved for #M.` and re-ask.
  - Discovery must not stop the session or send an approved package to Interview.
- Only when Discovery returns an unapproved package, run Interview (fresh 3-ask budget) → prepare → write Approved package → commit-push → merge → append `M` → loop. No second `xd://propose`.

## Finish (first spec only)

Write plain:

spec-{N}

<title from gh or derived>

to xd://propose
