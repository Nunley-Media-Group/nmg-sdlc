# Root Cause Analysis: /sdlc-execute routes an empty issue branch to verify when the local default branch is stale

**Issue**: #502
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/470-fix-sdlc-execute-closing-worker-panes-while-their-background-work-runs/

## Root Cause

`branchCommits` in `scripts/sdlc-execute.mjs` runs `git rev-list --count <defaultBranch>..HEAD`, where `<defaultBranch>` is the bare branch name from `evidence.project.defaultBranch`, so git resolves it to the local `refs/heads/<defaultBranch>`. New issue branches are created from the remote default branch (`gh issue develop --base <default>` in `scripts/start-issue.mjs`). After a delivery, `leaveDeliveredBranch` only runs `git switch <default>` and never moves the local ref forward.

In a multi-issue run, the next issue's branch therefore sits ahead of the stale local ref by the previous issue's squash-merge commit. The count is non-zero, `unimplemented` is false, routing selects `verify`, and `prepareVersion` commits a version bump on a branch with no implementation.

`branchCommits` also returns `true` ("has commits") when the default branch name is missing or `rev-list` fails. That fails toward the same verify-and-prepare path.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/sdlc-execute.mjs` | `branchCommits` | Counts commits against the local default ref; treats unreadable counts as "has commits" |
| `scripts/sdlc-execute.mjs` | step routing (`unimplemented`, `prepareVersion` call) in the per-issue loop | Uses `branchCommits` to choose between implement and verify/deliver and gates version preparation |
| `scripts/sdlc-execute.mjs` | `leaveDeliveredBranch` | Leaves the local default branch stale after delivery (unchanged; context only) |

## Fix Strategy

Change `branchCommits` so that:

1. It reads `defaultBranch` from `evidence.project.defaultBranch`. If it's missing, it throws `new Error('default_branch_unreadable')`.
2. It runs `git fetch --quiet --no-tags origin refs/heads/<defaultBranch>:refs/remotes/origin/<defaultBranch>`, the same refspec shape `scripts/start-issue.mjs` uses. If the fetch fails, it throws `default_branch_unreadable`.
3. It runs `git rev-list --count refs/remotes/origin/<defaultBranch>..HEAD`. If that fails or prints something that isn't a non-negative integer, it throws `default_branch_unreadable`.
4. It returns `count > 0`.

The routing expression `!implementedHeads.has(current.head) && !branchCommits(...)` keeps its short-circuit, so a head this invocation has already implemented skips the fetch and count. The error thrown inside the per-issue loop reaches the existing controller failure path: non-zero exit with the reason code on stderr, and no worker dispatch or `prepare-version` for that iteration. Update the comment above `branchCommits` to say that it compares against the fetched remote default ref and throws when it can't read it.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/sdlc-execute.mjs` | `branchCommits` fetches the remote default ref, counts against `refs/remotes/origin/<defaultBranch>`, and throws `default_branch_unreadable` when the name, fetch or count is unreadable | AC1, AC2, AC3; FR1–FR3 |
| `scripts/__tests__/sdlc-execute.test.mjs` | Add stale-local-default regression tests for the empty-branch, real-commits and fetch-failure cases | AC4; FR4 |

## Blast Radius

Only the issue-branch routing path calls `branchCommits`. Each routing pass on an issue branch that has no implement pass at its head now does one extra `git fetch` of the default branch. The fetch writes only `refs/remotes/origin/<defaultBranch>`, which `start-issue` already maintains. The local default branch, the worktree and the issue branch are left untouched. Verify/deliver routing for branches with real commits is unchanged.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Compare against the fetched `refs/remotes/origin/<default>` | Selected | Matches the base `start-issue` uses for new branches, independent of the local ref position |
| Fast-forward the local default branch in `leaveDeliveredBranch` | Rejected | Only fixes the path through that function; a stale local ref from any other cause would still misroute |
| Keep "has commits" on unreadable count | Rejected | Fails toward version preparation on a possibly empty branch |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #502 | 2026-10-25 | Initial defect design |
