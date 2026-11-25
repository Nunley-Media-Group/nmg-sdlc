# Defect Report: Create the spec directory in publish-approved-spec prepare

**Issue**: #619
**Date**: 2026-11-24
**Status**: Approved
**Author**: Claude Code

## Reproduction

1. In a repository whose default branch has no `specs/<N>-<slug>/`, run `node scripts/publish-approved-spec.mjs prepare --issue N --name <N>-<slug>`.
2. Read `specDir` from its JSON output.
3. Check whether that directory exists. It does not.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | After `prepare` succeeds, `specDir` exists as a directory, ready for the four spec files |
| **Actual** | `specDir` does not exist on a new spec worktree, so the caller must create it before writing |

## Acceptance Criteria

### AC1: prepare creates the spec directory

**Given** a new spec worktree whose checkout has no `specs/<N>-<slug>/`
**When** `prepare --issue N --name <N>-<slug>` succeeds
**Then** the returned `specDir` exists as a directory

### AC2: Reuse leaves existing spec files untouched

**Given** a reused spec worktree whose `specDir` already holds spec files
**When** `prepare` runs again
**Then** it succeeds with the same `branch`, `worktree` and `specDir`
**And** the existing files are unchanged

### AC3: The workflow states that specDir exists

**Given** `workflows/write-spec/WORKFLOW.md` and `workflows/write-spec/references/publish.md`
**When** they describe the `prepare` output
**Then** they state that `specDir` exists after `prepare` succeeds

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `prepare` creates `specDir` recursively before returning, and doing so again on reuse is harmless | Must |
| FR2 | `prepare`'s JSON output keeps its current fields and values | Must |
| FR3 | The write-spec workflow and publish reference say `specDir` exists after `prepare` | Must |

## Out of Scope

- Changing what `commit-push` stages or how the spec PR is published

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #619 | 2026-11-24 | Initial defect report |
