# Design: Close the gaps left open after #556: lock pid reuse, reclaim-guard put-back, spec revision publishing, and untested paths

**Issue**: #560
**Date**: 2026-11-15
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/556-close-the-known-gaps-left-by-parallel-delivery-551-and-the-controller-wait-fix-550/

## Overview

Five small changes in existing modules. No new commands, steering keys or files outside `src/` and `scripts/`.

## Architecture

### Process start tokens (`src/heavy-pool.mjs`)

- New export `processStartToken(pid)`: Linux reads field 22 of `/proc/<pid>/stat` (after the closing `)` of the command name); other POSIX hosts run `ps -o lstart= -p <pid>`; Windows runs `powershell -NoProfile -NonInteractive -Command (Get-Process -Id <pid>).StartTime.ToUniversalTime().Ticks`. Any failure or empty output returns `null`. Results are cached per pid for 5 s.
- New export `holderAlive(pid, recordedStart, { alive, startToken })`: false when `alive(pid)` is false; false when `recordedStart` is a string, the live token is a string, and they differ; true otherwise.
- Heavy-job slot records add `processStart` (the holder's own token). `reclaimable` uses `holderAlive`. `acquireHeavySlot` and `heavyPoolHolders` take an injectable `startToken`.

### Shared-state lock (`scripts/sdlc-shared-state.mjs`)

- `holder.json` adds `start`. `lockBreakable` uses `holderAlive` for a same-host holder. `withLock` takes an injectable `startToken`.

### Reclaim guard (`src/heavy-pool.mjs`, `underReclaimGuard`)

- The guard `<path>.reclaim` is a file created with `wx` holding `{ pid, host, start, at }`.
- Breakable when its owner is on this host and `holderAlive` is false, or when the record is unreadable or from another host and the guard is older than 10 s.
- Breaking renames the guard to a unique aside name and reads it. If the aside's content is the record seen, it is removed and the guard may be taken. Otherwise the process moved a fresh guard: it restores it with `linkSync(aside, guard)`, which fails rather than replace a guard taken meanwhile, removes the aside name, and does not take the guard.
- Release removes the guard only while it still holds this process's record. A guard directory left by an earlier version is unreadable, so it is broken after the stale age and removed recursively.

### Spec revision publishing (`scripts/publish-approved-spec.mjs`)

- `priorMergedPr` no longer fails when merged rows exist but none is at the local head. It compares `git rev-parse HEAD:<dir>` with `git rev-parse refs/remotes/origin/<base>:<dir>` in the spec worktree, after fetching the base. Equal: the package is already published; return the highest merged PR number. Different: return null, so `mergeSpec` creates a new spec PR.
- The 100-row cap, more than one merged PR at the head, an unproven merged PR at the head, and malformed rows still fail as before.

### Absent remote specs directory (`scripts/issue-spec-scope.mjs`)

- When `git ls-tree <ref>:specs` fails, `specStatusOnRef` checks `git rev-parse --verify --quiet <ref>^{commit}`. A readable ref returns `{ dir: null, approved: false }` with no reason code.

### Changelog bullet comparison (`scripts/sdlc-deliver.mjs`)

- `insertChangelogFragment` normalizes `[Unreleased]` lines with the existing `bulletLine` before checking whether a bullet is present.

## Error and State Paths

| Condition | Result |
|-----------|--------|
| Start token unreadable (no `ps`, no `/proc`, PowerShell missing) | Live pid counts as held, as before |
| Guard restore link fails with `EEXIST` | The aside name is removed; the guard taken meanwhile stays |
| Base fetch fails in `priorMergedPr` | `pr_readiness_failed` |
| Unreadable remote ref | `spec_status_unreadable`, as before |

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Break a live holder's lock after a long ceiling | Rejected | Heavy jobs run for many minutes; a ceiling would break live slots |
| Keep the guard as a directory | Rejected | Directories cannot be hard-linked, so a no-replace restore is impossible |
| Always open a new spec PR when no PR is at the head | Rejected | Would publish an empty PR for an already published package |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #560 | 2026-11-15 | Initial feature design |
