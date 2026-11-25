# Tasks: Install issue worktree dependencies through worktree setup and rerun setup when it never ran or changed

**Issue**: #620
**Date**: 2026-11-25
**Status**: Approved
**Author**: Claude Code

## Implementation Tasks

### T001: Declare the setup command in this repository's manifest

**File(s)**: `steering/manifest.json`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1: the manifest has the top-level key `"worktree": { "setup": { "program": "npm", "args": ["ci"], "cwd": "scripts" } }` and no `teardown`.
- `readManifestOptions(<repository root>)` from `src/sdlc-steering-runtime.mjs` returns without throwing, with `worktree.setup` equal to that command.
- No other manifest key changes.

### T002: Rerun setup on a never-run or changed command

**File(s)**: `scripts/sdlc-worktree.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR2: when setup runs a command, the returned and recorded `setup` is `{ ran: true, ok, summary, command: { program, args, cwd, env } }`, with `cwd` the declared `cwd` or `'.'` and `env` the declared `env` or `[]`. A `ran: false` result has no `command` key.
- FR3: for an issue worktree whose record has `setup.ok` true, `ensureWorktree` runs the declared setup command when one is declared and `record.setup.ran` is not true, or when the identity of `record.setup.command` (absent included) differs from the declared command's identity. It runs nothing when the identities match, or when no command is declared, and then leaves the record unchanged.
- An unreadable manifest on reuse fails with `worktree_setup_failed`.
- A missing record, a record without `setup`, or a record whose `setup.ok` is not true runs setup as before. A failed run is recorded and throws `worktree_setup_failed`.
- A `spec/` branch records `SPEC_SETUP_SKIPPED` and runs neither setup nor teardown, as before.
- The record keeps `schemaVersion: 1`, `branch`, and its original `createdAt`.

### T003: Describe when setup reruns

**File(s)**: `references/steering-schema.md`, `README.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- FR4: the `worktree` bullet under Optional Settings in `references/steering-schema.md` contains the sentence "On a reused issue worktree, setup runs again when the recorded setup failed, ran no command while one is now declared, or ran a different command than the one now declared."
- FR4: the "Worktrees" paragraph under Parallel delivery in `README.md` contains the same sentence, and the `worktree` row of the steering key table no longer says setup runs only once in each new issue worktree.

### T004: Implement the Regression Scenarios

**File(s)**: `scripts/__tests__/worktree-setup-rerun.test.mjs`, `scripts/__tests__/sdlc-worktree.test.mjs`
**Type**: Create, Modify
**Depends**: T001, T002, T003
**Acceptance**:
- Each `@SCN` tag is cited in a describe or test title. The scenarios are implemented in the new file `scripts/__tests__/worktree-setup-rerun.test.mjs`. Fixtures follow the `repository`, `manifest`, `node`, and `record` helpers of `scripts/__tests__/sdlc-worktree.test.mjs`, and change the declared command by rewriting `steering/manifest.json` inside the worktree.
- `@SCN001` (AC1): `readManifestOptions(<repository root>).worktree.setup` equals `{ program: 'npm', args: ['ci'], cwd: 'scripts' }` and the call does not throw.
- `@SCN002` (AC2): a worktree created with no declared command records `{ ran: false, ok: true }`. After a setup command that appends to `setup.log` is declared in the worktree's manifest, `ensureWorktree` returns `created: false` with `setup` matching `{ ran: true, ok: true }` and a `command` whose `program` and `args` are the declared ones, `setup.log` has one line, and the record's `setup` equals the returned `setup`.
- `@SCN003` (AC3): after a successful run of command A, the worktree's manifest declares command B. The next `ensureWorktree` runs B once, and the record's `setup.command.args` are B's.
- `@SCN004` (AC4): after a successful run of a declared command, a second `ensureWorktree` with the same declaration returns the same `setup`, and `setup.log` still has one line.
- `@SCN005` (AC5): a `spec/7-new-thing` worktree with declared setup and teardown runs neither on create, reuse, or removal and records `{ ran: false, ok: true, summary: 'spec worktree: setup not run' }`. A failing setup throws `worktree_setup_failed`, records `{ ran: true, ok: false }`, and runs again on the next reuse.
- `@SCN006` (AC6): `references/steering-schema.md` and `README.md` each contain the sentence in AC6.
- Existing tests in `scripts/__tests__/sdlc-worktree.test.mjs` that these scenarios replace are removed, so no acceptance criterion is tested twice.
- `@SCN002` and `@SCN003` fail without T002, `@SCN001` fails without T001, and `@SCN006` fails without T003.
- `cd scripts && npm test -- __tests__/worktree-setup-rerun.test.mjs __tests__/sdlc-worktree.test.mjs` passes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #620 | 2026-11-25 | Initial defect tasks |
