# Root Cause Analysis: Install issue worktree dependencies through worktree setup and rerun setup when it never ran or changed

**Issue**: #620
**Date**: 2026-11-25
**Status**: Approved
**Author**: Claude Code

## Root Cause

The steering manifest supports an optional `worktree.setup` command (`{ program, args, cwd?, env? }`, validated by `validCommand` in `src/sdlc-steering-runtime.mjs`). The start stage runs it through `ensureWorktree` and `runWorktreeCommand` in `scripts/sdlc-worktree.mjs`. This repository's `steering/manifest.json` has no `worktree` key, so nothing installs `scripts/node_modules` in a new issue worktree, and `repository.tests` cannot start Jest.

`ensureWorktree` reads the worktree record (`.nmg-sdlc/worktree.json`) and runs setup only when `record.setup.ok` is not true. With no command declared, `runWorktreeCommand` returns `{ ran: false, ok: true, summary: 'no worktree setup command declared' }`, and that result is recorded. On a later reuse the record is `ok`, so a command declared since then never runs. The record also holds no trace of which command ran, so a changed command cannot be detected.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `steering/manifest.json` | top-level `worktree` key | Declares this repository's setup command |
| `scripts/sdlc-worktree.mjs` | `ensureWorktree` | Decides whether setup runs and writes the record |
| `scripts/sdlc-worktree.mjs` | `runWorktreeCommand` (unchanged) | Runs the declared command |
| `references/steering-schema.md` | Optional Settings, `worktree` bullet | Documents setup |
| `README.md` | steering key table `worktree` row; Parallel delivery "Worktrees" paragraph | Documents setup |

## Fix Strategy

1. Add to `steering/manifest.json` the top-level key `"worktree": { "setup": { "program": "npm", "args": ["ci"], "cwd": "scripts" } }`. `scripts/package-lock.json` is tracked, so `npm ci` installs exactly the locked dependencies into `scripts/node_modules`, which is git-ignored.
2. In `scripts/sdlc-worktree.mjs`, define the identity of a declared command as the JSON text of `{ program, args, cwd: command.cwd || '.', env: command.env ?? [] }`.
3. Change the setup decision in `ensureWorktree` for an issue worktree (a branch that does not start with `spec/`):
   - The record has no `setup`, or `setup.ok` is not true: run setup, as today.
   - Otherwise read the declared setup command from the worktree's manifest with `readManifestOptions(worktree.path)`.
     - The manifest cannot be read: run setup through `runWorktreeCommand`, which reports the failure, so the start fails with `worktree_setup_failed` as an invalid manifest does on creation.
     - No command is declared: run nothing and leave the record unchanged.
     - A command is declared and `record.setup.ran` is not true: run setup.
     - A command is declared and the identity of `record.setup.command` differs from the declared command's identity, including a record with no `command` field: run setup.
     - Otherwise run nothing.
4. Whenever setup runs a command (`ran: true`), the recorded and returned `setup` is the `runWorktreeCommand` result plus `command: { program, args, cwd, env }` in the normalized form of step 2. A result with `ran: false` has no `command` key, so its shape is unchanged. The record keeps `schemaVersion: 1`, `branch`, and the original `createdAt`.
5. A failed run is recorded and then throws `worktree_setup_failed`, as today. Spec worktrees keep `SPEC_SETUP_SKIPPED` and never read the declared command. `removeWorktree` and teardown are unchanged.
6. Update the `ensureWorktree` doc comment to state the rerun rule.
7. Add this sentence to the `worktree` bullet of `references/steering-schema.md` and to the "Worktrees" paragraph under Parallel delivery in `README.md`: "On a reused issue worktree, setup runs again when the recorded setup failed, ran no command while one is now declared, or ran a different command than the one now declared." In the `README.md` steering key table, change the `worktree` row's "run once in each new issue worktree" to say setup also runs again on reuse under those conditions.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `steering/manifest.json` | Declare `worktree.setup` as `npm ci` in `scripts` | AC1 |
| `scripts/sdlc-worktree.mjs` | Record the command identity; rerun on a never-run or changed command | AC2, AC3, AC4, AC5 |
| `references/steering-schema.md` | State the rerun rule | AC6 |
| `README.md` | State the rerun rule | AC6 |

## Blast Radius

`ensureWorktree` is called by `scripts/start-issue.mjs` for issue worktrees and by `scripts/publish-approved-spec.mjs` for spec worktrees. Spec worktrees are unaffected. For a project with no declared setup, a reused issue worktree now reads the manifest once more and runs nothing. An issue worktree recorded before this change with a successful run and no `command` field runs its setup once more on the next reuse.

`scripts/sdlc-verify-full.mjs` calls `runWorktreeCommand('setup', ...)` in its temporary checkout. Once this repository declares a setup command, a full verification run of this repository also runs `npm ci` there. `runWorktreeCommand` itself is unchanged.

`npm ci` runs with `shell: false` and the `SAFE_ENV` keys, which include `PATH` and `HOME`.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Record the command identity and compare on reuse | Selected | Detects both a newly declared and a changed command from the record alone |
| Run setup on every reuse | Rejected | Repeats a slow install on every stage restart (violates AC4) |
| Install dependencies inside the `repository.tests` command | Rejected | Per-validation install is out of scope, and other validations in the worktree need the same dependencies |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #620 | 2026-11-25 | Initial defect design |
