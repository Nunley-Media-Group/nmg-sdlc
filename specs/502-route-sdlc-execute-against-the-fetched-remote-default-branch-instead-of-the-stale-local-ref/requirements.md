# Defect Report: /sdlc-execute routes an empty issue branch to verify when the local default branch is stale

**Issue**: #502
**Date**: 2026-10-25
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/470-fix-sdlc-execute-closing-worker-panes-while-their-background-work-runs/

## Reproduction

1. In a repository whose local `main` matches `origin/main`, run `/sdlc-execute #A #B` with two issues that have Approved specs.
2. Issue A delivers: its PR squash-merges into `origin/main`, and the controller switches back to the local `main` without fast-forwarding it.
3. Issue B starts, and its branch is created from the updated `origin/main` with no commits of its own.
4. Routing for B counts `main..HEAD` against the stale local `main`. It sees A's merge commit, selects `verify`, and invokes `prepare-version` on B's empty branch.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Routing counts the issue branch against the freshly fetched `refs/remotes/origin/<defaultBranch>`. A branch with no commits of its own routes to `implement` and no version is prepared. If the remote default ref can't be fetched or the count can't be read, routing stops with a reason code. |
| **Actual** | Routing counts against the local default branch. A stale local ref makes an empty branch look implemented, so it routes to `verify` and `prepare-version` commits a version bump with no implementation behind it. |

## Acceptance Criteria

### AC1: Stale local default branch no longer skips implement

**Given** a local default branch that is behind `refs/remotes/origin/<defaultBranch>`
**And** an issue branch created from `origin/<defaultBranch>` with no commits of its own
**When** `/sdlc-execute` routes that issue
**Then** the selected step is `implement`
**And** `prepare-version` is not invoked before the implement worker starts

### AC2: Branch with real commits still routes to verify/deliver

**Given** a local default branch that is behind `refs/remotes/origin/<defaultBranch>`
**And** a clean, published issue branch with one or more commits ahead of `origin/<defaultBranch>`
**When** `/sdlc-execute` routes that issue
**Then** routing selects `verify`, and version preparation runs before the verify worker, as it does today

### AC3: Unreadable remote default ref fails closed

**Given** an issue branch on which the fetch of `refs/heads/<defaultBranch>` into `refs/remotes/origin/<defaultBranch>` fails, or the commit count against it can't be read
**When** `/sdlc-execute` routes the issue
**Then** the controller exits non-zero with `default_branch_unreadable` on stderr
**And** it starts no worker and does not invoke `prepare-version`

### AC4: Regression tests cover a stale local default branch

**Given** `scripts/__tests__/sdlc-execute.test.mjs`
**When** the test suite runs
**Then** tests with a stale local default branch prove AC1, AC2 and AC3

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Before counting branch commits for routing, the controller fetches `refs/heads/<defaultBranch>` into `refs/remotes/origin/<defaultBranch>` and counts `refs/remotes/origin/<defaultBranch>..HEAD`, never the local default-branch ref | Must |
| FR2 | A branch with zero commits relative to the fetched remote default ref, and no implement pass at that head in this invocation, routes to `implement`, and no version is prepared for it | Must |
| FR3 | If the default branch name is missing, the fetch fails, or the count can't be read, routing fails closed with `default_branch_unreadable` instead of treating the branch as having commits | Must |
| FR4 | Regression tests in `scripts/__tests__/sdlc-execute.test.mjs` cover a stale local default branch for the empty-branch, real-commits and unreadable-remote cases | Must |

## Out of Scope

- Fast-forwarding or otherwise updating the local default branch in `leaveDeliveredBranch`
- Changes to how `scripts/start-issue.mjs` creates or integrates issue branches
- Changes to `prepare-version` version-selection logic in `scripts/sdlc-deliver.mjs`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #502 | 2026-10-25 | Initial defect report |
