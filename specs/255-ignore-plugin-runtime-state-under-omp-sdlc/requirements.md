# Defect Report: Ignore plugin runtime state under .omp/sdlc

**Issue**: #255
**Date**: 2026-08-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/249-make-execute-resume-active-issue-state-safely/

---

## Reproduction

1. Use a host repository whose `.gitignore` does not mention `.omp/sdlc/`, on the default branch, with an otherwise clean tree.
2. Run `/sdlc-execute #N` for a spec-created issue.
3. Observe the start worker write `.omp/sdlc/handoffs/<N>-start.json` and fail.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Onboard and upgrade add `.omp/sdlc/` to the host `.gitignore`. After that rule exists, untracked plugin runtime under `.omp/sdlc/` does not appear as working-tree dirt. If those runtime files are already tracked, start and execute remove them from the index with `git rm --cached` without deleting the working-tree files. Other dirty host files still fail `dirty_tree`. |
| **Actual** | Start-issue writes a failed handoff with `reasonCode: dirty_tree` and `intervention: true` while still on the default branch. The issue branch is not created. |

## Acceptance Criteria

### AC1: Bug Is Fixed

**Given** a host whose only porcelain would be untracked `.omp/sdlc/` runtime
**When** onboard or upgrade applies the managed ignore rule and `/sdlc-execute` starts an issue from the default branch
**Then** `.omp/sdlc/` is listed in the host `.gitignore`, that runtime does not fail `dirty_tree`, and start can create or check out the issue branch

### AC2: Tracked Runtime Is Untracked

**Given** a host that already committed files under `.omp/sdlc/`
**When** start or execute runs after the ignore rule exists
**Then** those paths are removed from the index with `git rm --cached`, the working-tree files remain, and the dirty gate permits only the exact staged `.omp/sdlc/**` deletions authorized by that successful controlled operation
**And** any other dirty or staged path still fails `dirty_tree`

### AC3: No Regression

**Given** a host with dirty files outside `.omp/sdlc/`
**When** start or execute evaluates the working tree off the issue branch
**Then** the run still fails `dirty_tree` and does not create or switch branches

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Onboard adds `.omp/sdlc/` to the host `.gitignore` when that rule is missing | Must |
| FR2 | Upgrade proposes and, on approved apply, adds the same `.omp/sdlc/` ignore on already-initialized hosts | Must |
| FR3 | Start and execute untrack already-indexed `.omp/sdlc/` paths with `git rm --cached`; the following dirty gate may authorize only staged deletions for the exact paths returned by the successful controlled untrack operation | Must |
| FR4 | Dirty-tree failures remain for any porcelain outside that exact authorized staged-transition set, including other `.omp/sdlc/` states | Must |

## Out of Scope

- Treating unignored `.omp/sdlc/` as clean without a host gitignore rule
- Ignoring the entire `.omp/` directory
- Changing a specific host `.gitignore` in a non-nmg-sdlc repository as the fix
- Broadly filtering `.omp/sdlc` from `git status --porcelain` in `references/dirty-tree.md`, `publish-approved-spec.mjs`, or `dirtyTreeBlocks` / start-issue dirty evaluation; only the exact staged deletions produced by the controlled untrack operation may be authorized
- Changing apply-review staging filters in `scripts/sdlc-apply-review.mjs`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #255 | 2026-08-24 | Initial defect report |
