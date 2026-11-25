# Root Cause Analysis: Create the spec directory in publish-approved-spec prepare

**Issue**: #619
**Date**: 2026-11-24
**Status**: Approved
**Author**: Claude Code

## Root Cause

`prepare` in `scripts/publish-approved-spec.mjs` calls `specWorktree(name)`, builds `specDir` with `join(tree.path, 'specs', name)`, and returns it. The script imports only `readFileSync` from `node:fs` and never creates a directory. `ensureWorktree` in `scripts/sdlc-worktree.mjs` creates the worktree, its parent directory and `.nmg-sdlc/`, but not `specs/<N>-<slug>/`. A new spec worktree is checked out from the default branch, where that directory does not exist, so the returned `specDir` names a missing path.

`workflows/write-spec/WORKFLOW.md` (Approval Behavior step 1) and `workflows/write-spec/references/publish.md` (Prepare section) tell the model to write the four files in `specDir` and do not say whether the directory exists. The `prepare` tests in `scripts/__tests__/publish-approved-spec.test.mjs` check the returned JSON but not that `specDir` exists.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/publish-approved-spec.mjs` | `prepare` | Creates or reuses the spec worktree and returns `specDir` |
| `workflows/write-spec/WORKFLOW.md` | Approval Behavior step 1 | Describes the `prepare` output |
| `workflows/write-spec/references/publish.md` | Prepare section | Describes the `prepare` output |

## Fix Strategy

1. In `scripts/publish-approved-spec.mjs`, import `mkdirSync` from `node:fs`. In `prepare`, compute `specDir = join(tree.path, 'specs', name)`, call `mkdirSync(specDir, { recursive: true })`, then return the same object as today (`branch`, `worktree`, `specDir`, `created`). A recursive `mkdirSync` on an existing directory does nothing, so a reused worktree's files are untouched. `specWorktree` and `ensureWorktree` are unchanged.
2. In `workflows/write-spec/WORKFLOW.md` Approval Behavior step 1, say that `prepare` creates `specDir`, so it exists when `prepare` succeeds.
3. In `workflows/write-spec/references/publish.md` Prepare section, say the same next to "Write the four spec files in `specDir`".

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/publish-approved-spec.mjs` | `prepare` creates `specDir` recursively before returning | AC1, AC2 |
| `workflows/write-spec/WORKFLOW.md` | Step 1 states `specDir` exists after `prepare` | AC3 |
| `workflows/write-spec/references/publish.md` | Prepare section states `specDir` exists after `prepare` | AC3 |

## Blast Radius

`prepare` is called only by `/sdlc-write-spec` Approval Behavior. Git does not track an empty directory, so a `prepare` that is not followed by file writes adds nothing to `git status` and nothing for `commit-push` to stage. The JSON output is unchanged, so every caller that parses it keeps working. The `spec_outside_worktree` path of `commit-push` and `merge` returns its own `specDir` and is not changed.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Create the directory in `prepare` | Selected | `prepare` owns the returned path, and one recursive `mkdirSync` covers new and reused worktrees |
| Create it in `ensureWorktree` | Rejected | `ensureWorktree` also serves issue worktrees, which have no spec directory to create |
| Tell the workflow to create the directory | Rejected | Leaves a filesystem step to the model that the helper can do deterministically |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #619 | 2026-11-24 | Initial defect design |
