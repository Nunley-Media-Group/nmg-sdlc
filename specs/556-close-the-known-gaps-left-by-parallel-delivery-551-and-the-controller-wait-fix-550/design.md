# Design: Close the known gaps left by parallel delivery (#551) and the controller wait fix (#550)

**Issue**: #556
**Date**: 2026-11-15
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/551-add-parallel-delivery-with-worktree-isolation-a-merge-queue-change-scoped-validation-tiers-and-one-pass-verification/

## Overview

Six independent, small changes, one per gap. No new files, commands or steering keys.

## Architecture

### Spec status from the remote default branch (`scripts/issue-spec-scope.mjs`, `scripts/sdlc-execute.mjs`)

- New export `specStatusOnRef(issueN, root, ref)` lists `git ls-tree --name-only <ref> specs/`, takes the single `{N}-*` directory (more than one gives `spec_status_ambiguous`), and checks its four files with the existing `specApprovedOnRef`. It returns `{ dir, approved, ref }`.
- In the execute start check, after `specStatus` and the best-effort fast-forward both fail, the controller fetches `refs/heads/<base>:refs/remotes/origin/<base>` and calls `specStatusOnRef(issue, cwd, 'refs/remotes/origin/<base>')`. Only when that also fails does it throw `approved_spec_missing`.
- start-issue creates the issue worktree from the same remote ref, so the worktree holds the spec the check found.

### Spec worktrees skip setup and teardown (`scripts/sdlc-worktree.mjs`)

- `ensureWorktree`: for a branch starting `spec/`, the setup result is `{ ran: false, ok: true, summary: 'spec worktree: setup not run' }` and no command runs. It is recorded in `.nmg-sdlc/worktree.json` as before.
- `removeWorktree`: teardown is skipped for a `spec/` branch.
- `references/steering-schema.md` states that `setup` and `teardown` apply to issue worktrees only.

### Holder-aware shared-state lock (`scripts/sdlc-shared-state.mjs`)

- After `mkdirSync(lock)` succeeds, the holder writes `<lock>/holder.json` `{ pid, host, at }` (`host` is `os.hostname()`). Release removes the file, then the directory.
- On `EEXIST` the waiter reads the holder:
  - Same host and pid dead (`processAlive` false): break at once.
  - Same host and pid alive: never break; keep polling until the 60 s wait deadline, then `shared_state_locked`.
  - No readable record, or another host: break once the lock is older than 30 s (the record may not be written yet, or the pid cannot be checked).
- Breaking removes the holder file and the directory; a lost race just retries.
- `withLock` takes injectable `alive` and `hostname` options for tests.

### Changelog-only queue conflict (`scripts/sdlc-execute.mjs`, `scripts/sdlc-deliver.mjs`)

- `sdlc-deliver.mjs` exports `mergeUnreleasedEntries(theirs, ours)`: for each `### <category>` bullet (with its indented continuation lines) in the `[Unreleased]` section of `ours` whose first line appears nowhere in `theirs`, add it to `theirs`'s `[Unreleased]` under the same category with the existing `addGeneratedEntry`. A bullet outside any category goes under `### Changed`. Returns `{ content, kept }`.
- In `integrateDefault`, when the conflict is version-only and includes `CHANGELOG.md`, read `git show :2:CHANGELOG.md` (ours) and `:3:CHANGELOG.md` (theirs), then write `mergeUnreleasedEntries(theirs, ours).content` and add it. `VERSION` still takes theirs.
- The result carries `kept` (the bullet count). The integration line becomes `#N: integration took origin/<base> for <files> and kept <k> branch changelog entr(y|ies)` when `kept > 0`.
- `updateChangelog` already keeps a hand-written `(#N)` bullet instead of adding the generated title line.
- `workflows/execute/WORKFLOW.md` documents the kept entries.

### Stopped worker behind its marker (`scripts/sdlc-execute.mjs`, `awaitTurnEnd`)

- The `changed` predicate also returns true when `workerState(host, agentId)` is `failed` or `killed`. The loop then re-observes, leaves the marker loop because the state is not settled, and returns the stopped state, which the caller already ends as `process_lost`.

## Error and State Paths

| Condition | Result |
|-----------|--------|
| Fetch of the remote default branch fails during the spec check | `approved_spec_missing` with the local reason, as before |
| Two `{N}-*` directories on the remote ref | `approved_spec_missing` (`spec_status_ambiguous`) |
| Holder record unreadable | Age-based break after 30 s |
| `git show :2:`/`:3:` fails | The merge is aborted and `queue_integration_conflict` is returned, as for any failed resolution |

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Force a fast-forward of a dirty primary checkout | Rejected | Execute never touches the primary checkout's work |
| Lock file with exclusive `wx` instead of a directory | Rejected | The directory lock works; only the break rule was wrong |
| `git merge-file --union` for CHANGELOG.md | Rejected | Union keeps both sides' conflicting version headings |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #556 | 2026-11-15 | Initial feature design |
