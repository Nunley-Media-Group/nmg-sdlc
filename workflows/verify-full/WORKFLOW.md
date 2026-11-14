---
name: verify-full
description: "Run a project's full-tier steering validations against a ref and record the result for that commit, or answer whether a commit is full-green for a downstream action. Not part of pre-merge delivery. Use /sdlc-verify-full [REF] or /sdlc-verify-full check --action NAME --commit REF"
---

# Verify Full

Full-tier validations are the ones `steering/manifest.json` declares with `"tier": "full"`. They are not required before merge: `/sdlc-execute` and `/sdlc-verify-code` run only the `change` tier. This command runs the full tier on demand, for example from a schedule, and keeps one record per commit.

It never edits source, never changes a branch in the current checkout, and never merges or closes anything.

## Arguments

Exactly one of:

- nothing, or one `REF` — verify the commit `REF` names (a branch, tag or SHA). Without `REF`, the remote default branch is verified.
- `check --action NAME --commit REF` — report whether `REF` is full-green for the downstream action `NAME`. Both options are required.

Any other form → print:
Usage: /sdlc-verify-full [REF] | check --action NAME --commit REF
and exit non-zero.

## Execution

Resolve the project root via git rev-parse --show-toplevel .

Invoke exactly one of:

node <plugin-root>/scripts/sdlc-verify-full.mjs run [--ref REF] --project <root>
node <plugin-root>/scripts/sdlc-verify-full.mjs check --action NAME --commit REF --project <root>

Omit `--ref` when no `REF` was given. Pass the JSON output through unchanged and exit with the script's status.

## What a run does

1. Resolves `REF` to a commit and checks it out in a temporary detached worktree, so the current checkout is not touched.
2. Runs the manifest's worktree `setup` command there when one is declared.
3. Runs every `full`-tier validation. A validation marked `heavy` takes a slot from the host-wide heavy-job pool first.
4. Runs the worktree `teardown` command and removes the temporary worktree.
5. Records the result for that commit under the repository's git common directory (`nmg-sdlc/full-verification/<sha>.json`), so every worktree sees it. The record's `status` is `passed`, `failed` or `incomplete`.

A `passed` run exits 0. Any other run exits 1, and its output and record list `sinceLastGreen`: the first-parent commits since `lastGreen`, the last passed full run that is an ancestor of the commit, which are the candidates for the regression. When no such record exists, `sinceLastGreen` is null and the output carries `reason: "no_green_record"`.

## What `check` answers

`green: true`, with exit status 0, only when a passed full record exists for `REF` or for a commit that contains it (a record at or after the commit). Otherwise `green: false`, with exit status 1.

`--action NAME` names a downstream action such as a deploy. Steering lists the actions that require a full-green commit in `fullGreen.actions`. An action that is not listed there fails with `full_green_action_unknown` and exit status 2. A deploy script can call the script directly and act on its exit status.

## Read-only outside its records

No source edits, no branch changes in the current checkout, no `gh` mutations.
