# Requirements: Close the known gaps left by parallel delivery (#551) and the controller wait fix (#550)

**Issue**: #556
**Date**: 2026-11-15
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/551-add-parallel-delivery-with-worktree-isolation-a-merge-queue-change-scoped-validation-tiers-and-one-pass-verification/

## User Story

**As a** developer running `/sdlc-write-spec` and `/sdlc-execute` sessions, several at once
**I want** spec status, worktree setup, the shared-state lock, queue-head changelog merges and stopped-worker detection to behave correctly
**So that** parallel delivery does not reject published specs, waste setup runs, break live locks, lose changelog entries, or sit up to a minute on a dead worker

## Background

#551 and #550 were delivered with six known gaps recorded in their verification reports:

- `scripts/sdlc-execute.mjs` reads spec status from the invoking checkout. Its fast-forward fallback does nothing when the primary checkout has uncommitted work or is on another branch, so a spec merged to `origin/<default>` is reported `approved_spec_missing`.
- `scripts/sdlc-worktree.mjs` runs `worktree.setup` and `worktree.teardown` for `spec/` worktrees, which only hold four Markdown files.
- `scripts/sdlc-shared-state.mjs` `withLock` breaks a lock older than 30 s without checking its holder. The #551 design called for a holder-aware lock.
- `integrateDefault` resolves a `VERSION`/`CHANGELOG.md`-only conflict with `git checkout --theirs`, which drops the branch's own `[Unreleased]` bullets.
- `awaitTurnEnd` notices a worker that goes from `idle` to `failed` or `killed` behind its waiting marker only after the 60 s resume bound.
- No committed test covers check-ins while a settled worker waits behind its marker.
- `src/heavy-pool.mjs` reclaims a dead holder's slot lock by deleting it and creating its own. Two processes that both read the dead holder can interleave so that the second deletes the first's new, live lock, and both hold the slot.

## Acceptance Criteria

### AC1: A spec published on the remote default branch is found from a stale checkout

**Given** an open `spec-created` issue whose approved four-file spec is merged on `origin/<default>`
**And** a primary checkout that does not hold that spec and cannot be fast-forwarded
**When** `/sdlc-execute #N` starts the issue
**Then** the spec check reads the freshly fetched remote default branch, finds the approved spec, and the start proceeds
**And** a spec that is absent or not Approved on the remote default branch still fails `approved_spec_missing`

### AC2: Spec worktrees run no setup or teardown

**Given** a steering manifest that declares `worktree.setup` and `worktree.teardown`
**When** a `spec/{N}-{slug}` worktree is created, reused or removed
**Then** neither command runs, and the worktree record reports setup as not run for a spec worktree
**And** an issue code worktree still runs both commands as before

### AC3: A live lock holder's lock is never broken on age

**Given** a shared-state lock whose holder record names a live process on this host
**When** another process waits on that lock past the 30 s stale age
**Then** the lock is not broken, and the waiter keeps waiting until the lock is released or its wait deadline fails with `shared_state_locked`
**And** a lock whose recorded holder is dead is broken at once
**And** a lock with no readable holder record, or one recorded on another host, is broken only after the stale age

### AC4: A changelog-only queue conflict keeps the branch's own entries

**Given** a queue-head branch that adds `[Unreleased]` bullets to `CHANGELOG.md`
**And** a default branch whose `CHANGELOG.md` change makes the merge conflict only in `VERSION` and `CHANGELOG.md`
**When** the controller integrates the default branch
**Then** the resolved `CHANGELOG.md` is the default branch's content plus each branch `[Unreleased]` bullet missing from it, under the same `###` category
**And** version preparation rolls the hand-written bullet instead of adding the generated title line
**And** the integration line names the kept entries

### AC5: A stopped worker behind its waiting marker is noticed at once

**Given** a settled stage worker that left its waiting marker
**When** its status becomes `failed` or `killed` with no new activity
**Then** the controller ends the wait at its next host poll, not after the 60 s resume bound, and ends the stage as `process_lost`

### AC6: Check-ins continue while a settled worker waits behind its marker

**Given** a settled stage worker waiting behind its marker for longer than the check-in interval
**When** the controller supervises it
**Then** it sends check-in reports that name the waiting command
**And** a committed regression test asserts this

### AC7: Only one process takes a reclaimed heavy-job slot

**Given** a heavy-job slot lock whose holder is dead, read by two processes
**When** one reclaims the slot and takes it before the other acts on its earlier read
**Then** the other does not delete the new holder's lock, and it waits for the slot instead of running beside the holder

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | When the local spec check fails, execute's start check fetches the remote default branch and reads the spec from that ref before failing `approved_spec_missing`. | Must |
| FR2 | `ensureWorktree` and `removeWorktree` skip `worktree.setup` and `worktree.teardown` for `spec/` branches. | Must |
| FR3 | `withLock` writes a holder record (`pid`, `host`, `at`) into the lock and breaks it only when that holder is dead on this host, or when the record is missing, unreadable or from another host and the lock is older than the stale age. | Must |
| FR4 | A queue-head conflict confined to `VERSION` and `CHANGELOG.md` keeps the default branch's content and re-adds the branch's `[Unreleased]` bullets that the default branch's file lacks. | Must |
| FR5 | The settled-worker marker wait also ends when the worker's status becomes `failed` or `killed`. | Must |
| FR6 | Tests cover AC1 to AC7, including a check-in regression test on a settled worker behind its marker. | Must |
| FR7 | A heavy-job slot is reclaimed under a per-slot guard that re-reads the holder before deleting the lock; a guard left by a crashed process is broken once it is stale. | Must |

## Out of Scope

- Changing the 30 s stale age, the 60 s lock wait or the 60 s resume bound.
- Merging changelog conflicts outside the queue-head integration.
- Spec status in `/sdlc-status` and `/sdlc-write-spec` discovery.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #556 | 2026-11-15 | Initial feature spec |
| #556 | 2026-11-15 | Spec revised before delivery: AC7 heavy-job slot reclaim race |
