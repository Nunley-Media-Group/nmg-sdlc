# Requirements: Close the gaps left open after #556: lock pid reuse, reclaim-guard put-back, spec revision publishing, and untested paths

**Issue**: #560
**Date**: 2026-11-15
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/556-close-the-known-gaps-left-by-parallel-delivery-551-and-the-controller-wait-fix-550/

## User Story

**As a** developer running several `/sdlc-write-spec` and `/sdlc-execute` sessions at once
**I want** the lock, reclaim-guard, spec-publication and spec-lookup gaps left open after #556 closed
**So that** a crashed holder never wedges a lock, a spec revision publishes through the helper, and the #556 paths are covered by tests

## Background

#556 (PR #559) was delivered with these open items:

- A shared-state lock or heavy-job slot whose crashed holder's pid is reused by another live process on the same host looks held forever.
- `breakStaleGuard` in `src/heavy-pool.mjs` renames a guard it moved by mistake back into place; on POSIX that rename can replace a third process's fresh empty guard directory.
- `publish-approved-spec.mjs merge` fails `pr_head_changed` once the spec branch already has a merged PR, so a revised spec cannot be published by the helper.
- A remote default branch without `specs/` gives `approved_spec_missing: #N (spec_status_unreadable)`.
- Several #556 paths have no test: a failed `git show :2:`/`:3:`, a failed remote fetch during the spec check, a spec merged after the clone, and a kept bullet rolled by version preparation in a fixture with `VERSION`.
- `insertChangelogFragment` compares raw lines, so a bullet present as `* text` is added again as `- text`.

## Acceptance Criteria

### AC1: A lock whose holder pid was reused is broken

**Given** a shared-state lock or heavy-job slot whose holder record names a pid on this host and the holder's process start identity
**When** a live process now has that pid but a different start identity
**Then** the lock is treated as held by a dead holder and broken at once
**And** a holder whose start identity matches is never broken
**And** when either start identity cannot be read, a live pid still counts as held, as before

### AC2: A reclaim guard is never put back over another process's guard

**Given** a reclaim guard that records its owner
**When** a process breaks a guard it saw as stale and finds it moved a different, fresh guard
**Then** it puts that guard back only if the path is still free, never replacing a guard another process took
**And** a guard is broken only when its owner is dead on this host, or its owner cannot be checked and it is older than the stale age

### AC3: A revised spec publishes after an earlier spec PR merged

**Given** a spec branch whose earlier spec PR is merged at a different head
**And** a local spec package that differs from the one on the default branch
**When** `publish-approved-spec.mjs merge` runs
**Then** it opens a new spec-only PR and merges it at its exact head
**And** when the package already equals the default branch's, it reports the latest merged PR without opening one
**And** any other ambiguous PR history still fails `pr_head_changed`

### AC4: A remote default branch with no specs directory reads as absent

**Given** a readable remote default branch without a `specs/` directory
**When** the execute start check reads the spec from it
**Then** the failure is `approved_spec_missing` without `spec_status_unreadable`
**And** an unreadable ref still reports `spec_status_unreadable`

### AC5: The #556 paths have regression tests

**Given** the #556 changelog-merge and remote spec-check paths
**When** the test suite runs
**Then** tests cover a failed `git show :2:`/`:3:` (the integration aborts to `conflict`), a failed remote fetch (the start fails `approved_spec_missing`), a spec merged after the clone (found by the fetch), and a kept hand-written bullet rolled by version preparation in a fixture with `VERSION`
**And** a bullet already present as `* text` is not added again as `- text`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Lock and slot holders record a process start token; a same-host holder whose live pid has a different readable start token is dead. An unreadable token on either side keeps the pid-only rule. | Must |
| FR2 | Start tokens come from `/proc/<pid>/stat` on Linux, `ps -o lstart=` on other POSIX hosts, and PowerShell `Get-Process` on Windows, cached per pid for a few seconds so polling waiters do not spawn a process per poll. | Must |
| FR3 | The reclaim guard is a file created with `wx` that records its owner. A moved guard that is not the one seen is restored with a no-replace hard link; it is never renamed over the path. | Must |
| FR4 | `publish-approved-spec.mjs merge` treats merged spec PRs at other heads as earlier publications: it opens a new PR when the spec directory tree at the local head differs from the default branch's, and reports the latest merged PR when it is equal. | Must |
| FR5 | `specStatusOnRef` reports an absent spec when the ref is readable but has no `specs/` tree. | Must |
| FR6 | `insertChangelogFragment` compares bullets with their `-`/`*` marker normalized. | Should |
| FR7 | Tests cover AC1 to AC5. | Must |

## Out of Scope

- The `run_inside_worktree` cleanup skip, which is by design.
- Changing the 30 s lock stale age, the 10 s guard stale age, or the lock wait.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #560 | 2026-11-15 | Initial feature spec |
