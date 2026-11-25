# Tasks: Create the spec directory in publish-approved-spec prepare

**Issue**: #619
**Date**: 2026-11-24
**Status**: Approved
**Author**: Claude Code

## Implementation Tasks

### T001: Create specDir in prepare

**File(s)**: `scripts/publish-approved-spec.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1: `prepare` calls `mkdirSync(specDir, { recursive: true })` on `join(tree.path, 'specs', name)` before printing its result.
- FR1: running `prepare` again on a worktree whose `specDir` holds files succeeds and leaves those files byte-for-byte unchanged.
- FR2: the printed JSON is still `{ ok, branch, worktree, specDir, created }` with the same values as before.

### T002: State that specDir exists in the write-spec workflow

**File(s)**: `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- FR3: Approval Behavior step 1 of `workflows/write-spec/WORKFLOW.md` says `prepare` creates `specDir`, so it exists when `prepare` succeeds.
- FR3: the Prepare section of `workflows/write-spec/references/publish.md` says `specDir` exists after `prepare` succeeds.
- No other instruction in either file changes.

### T003: Implement the Regression Scenarios

**File(s)**: `scripts/__tests__/publish-approved-spec.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- Each `@SCN` tag is cited in a describe or test title.
- `@SCN001` (AC1): after `run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env)` on a new repository from `makeRepo()`, exit status is 0, the output equals `{ ok: true, branch: 'spec/42-add-x', worktree: <string>, specDir: path.join(worktree, 'specs', '42-add-x'), created: true }`, and `fs.statSync(output.specDir).isDirectory()` is true.
- `@SCN002` (AC2): after `prepareSpec`, `writeApproved(specDir, 42)`, and recording each spec file's content, a second `prepare` exits 0 with `branch: 'spec/42-add-x'`, the same `worktree`, the same `specDir`, and `created: false`, and every recorded file's content is unchanged.
- `@SCN003` (AC3): the Approval Behavior step 1 line of `workflows/write-spec/WORKFLOW.md` (the line containing `prepare --issue N --name {N}-{slug}`) and the Prepare section of `workflows/write-spec/references/publish.md` each state that `specDir` exists after `prepare`.
- `@SCN001` fails without T001, and `@SCN003` fails without T002.
- `cd scripts && npm test -- __tests__/publish-approved-spec.test.mjs` passes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #619 | 2026-11-24 | Initial defect tasks |
