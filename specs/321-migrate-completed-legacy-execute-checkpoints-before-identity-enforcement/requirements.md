# Requirements: Migrate completed legacy execute checkpoints before identity enforcement

**Issue**: #321
**Date**: 2026-08-29
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/303-release-leftover-completed-execute-checkpoints-on-startup/

---

## User Story

**As a** developer upgrading a consumer repository from a pre-identity nmg-sdlc release
**I want** `/sdlc-execute` to release only a fully completed, fully unbound legacy checkpoint before starting a different issue list
**So that** obsolete terminal runtime does not block a safe fresh run while resumable or identity-bearing state remains fail-closed

---

## Background

Issue #303 allows startup to release a completed checkpoint before a different queue begins, but its `completedRunState` predicate now requires the six identity fields introduced by issue #290. Released legacy schema-version-1 checkpoints contain none of `projectRoot`, `runId`, `issue`, `branch`, `head`, or `revision`; even when all eight steps are complete and current/failure/remediation state is cleared, startup emits `Run checkpoint identity mismatch` before `cleanupCompletedRun` can run.

The migration must preserve the bounded cleanup contract from issue #299 and the startup release contract from issue #303. Only a fully unbound terminal shape is eligible. Partial identity, incomplete work, cleanup races, locks, symlink or junction boundaries, and controller-lease conflicts remain diagnostic state rather than migration candidates. The behavior and evidence must be identical on macOS, Linux, and Windows.

**Version bump**: patch

---

## Acceptance Criteria

### AC1: Completed Released Legacy Checkpoint Is Migrated

**Given** `.omp/sdlc/run.json` is schema version 1, has a non-empty valid issue list, clears `currentIssue`, `currentStep`, `failed`, and remediation, records all eight valid steps for every listed issue, and contains none of `projectRoot`, `runId`, `issue`, `branch`, `head`, or `revision`
**When** `/sdlc-execute` starts a different approved eligible issue list
**Then** it releases only the legacy run's exact handoff, worker prompt-provenance, temporary, and checkpoint files within the canonical project runtime boundary
**And** it starts the requested list through the normal fresh-run path with a new complete project/run/issue/branch/head identity and revision
**And** stderr does not contain `Run checkpoint identity mismatch`

### AC2: Unsafe Legacy Candidates Stay Fail-Closed

**Given** an existing checkpoint is incomplete, active, failed, remediating, malformed, missing any terminal completion evidence, or contains any non-empty subset of the six identity fields
**When** `/sdlc-execute` requests a different issue list
**Then** it exits status 1 with stderr exactly `Run checkpoint identity mismatch`
**And** checkpoint bytes and supporting runtime remain unchanged
**And** no worker for the requested list starts

### AC3: Cleanup and Identity Safety Are Preserved

**Given** a fully completed released legacy checkpoint cannot be cleaned because its lock is held, an owned runtime directory crosses a symlink or junction boundary, an owned artifact cannot be removed, the checkpoint bytes change, or controller ownership changes before cleanup completes
**When** `/sdlc-execute` requests a different issue list
**Then** startup fails closed without creating or advancing the new run
**And** identity-bound checkpoints still require exact project/run/issue/branch/head identity and monotonic compare-and-swap revisions
**And** a partially identity-bearing checkpoint is never rebound as legacy state

### AC4: Cross-Platform Behavior Is Identical

**Given** deterministic fixtures cover the Cartesian product of LF and CRLF serialization with POSIX and Windows path-form identity values, including the fully unbound eligible shape and partially identity-bearing rejection shapes
**When** classification and different-issue startup run natively on macOS, Linux, and Windows
**Then** every OS makes the same migrate-or-reject decision for the same logical checkpoint
**And** eligible cleanup removes the same exact owned artifact set beneath the native canonical project root
**And** the new checkpoint stores `projectRoot === fs.realpathSync(tempRoot)` with native separators
**And** changed implementation and fixtures use Node filesystem, path, process, and executable primitives rather than POSIX shell commands, executable-bit assumptions, literal separators, or newline assumptions

### AC5: Cross-Platform Boundaries Remain Fail-Closed

**Given** legacy cleanup encounters a POSIX symbolic link, a Windows directory junction or permitted symbolic link, a held checkpoint lock, a foreign or changed controller lease, stale checkpoint bytes, or identity-bound branch/head/revision drift
**When** cleanup or fresh identity creation is attempted on the applicable host
**Then** execution stops without escaping the runtime boundary, deleting foreign runtime, releasing another controller's lease, or rebinding stale exact-head identity
**And** the prior checkpoint remains available for diagnosis whenever bounded cleanup has not already removed an exact owned artifact

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Recognize as migratable only schema-version-1 state with a non-empty valid issue list, all eight completed steps for every issue, cleared current/failure/remediation state, and none of the six identity fields. | Must | Full absence means no own property for any identity field. |
| FR2 | Release an eligible legacy checkpoint with the completed-run lock, canonical runtime boundary, symlink/junction rejection, exact owned-artifact deletion, and cleanup-failure behavior. | Must | Legacy state cannot bypass issue #299 safety checks. |
| FR3 | After successful release, initialize the requested issues through normal fresh-run creation with new complete identity and revision. | Must | No legacy identity is copied forward. |
| FR4 | Preserve bytes and start no new worker for incomplete, active, failed, remediating, malformed, partially identity-bearing, cleanup-failing, or genuinely mismatched state. | Must | Exact mismatch stderr remains stable. |
| FR5 | Preserve CAS revision and exact project/run/issue/branch/head checks for every bound checkpoint and fresh run. | Must | Partial identity is never bindable. |
| FR6 | Make classification, bounded cleanup, and fresh identity creation behave identically on macOS, Linux, and Windows using Node primitives only. | Must | No shell-created fixtures or hardcoded separators. |
| FR7 | Keep symlink/junction rejection, exclusive lock and byte-change checks, canonical-root confinement, and controller-lease ownership fail-closed on each OS. | Must | Windows junction coverage is mandatory. |
| FR8 | Add deterministic LF/CRLF × POSIX/Windows path-form fixtures and native Ubuntu/macOS/Windows checkpoint-portability CI evidence. | Must | Simulated path strings do not replace native host evidence. |

---

## Verification Obligations

1. From `scripts/`, run `npm test -- --runInBand __tests__/sdlc-execute.test.mjs`. The exact released issue-6 payload starting issue 19 must be covered without shell-created fixtures.
2. Generate all 62 non-empty proper subsets of `projectRoot`, `runId`, `issue`, `branch`, `head`, and `revision`; every subset remains ineligible. Combine LF/CRLF bytes with `path.posix` and `path.win32` values without assuming host separators.
3. Add a dedicated job matrix in `.github/workflows/nmg-sdlc-verify.yml` for `ubuntu-latest`, `macos-latest`, and `windows-latest`. Invoke Jest through `process.execPath`-compatible Node entrypoints or an explicit Node command, not a shebang/executable-bit shim.
4. On POSIX runners use `fs.symlinkSync`; on Windows require directory-junction coverage and run symbolic-link coverage when the runner grants privilege. Skip only the denied Windows symbolic-link variant with an explicit privilege reason.
5. On every runner prove held lock, stale bytes, foreign/changed lease, cleanup failure, stale revision, and branch/head drift keep the old checkpoint and start no issue-19 worker.

---

## Out of Scope

- Migrating or discarding resumable, incomplete, failed, blocked, active, or remediating checkpoints
- Repairing malformed checkpoints or checkpoints containing any identity-field subset
- Relaxing identity, revision, exact-head, lock, canonical-root, symlink/junction, or controller ownership checks
- Adding a manual runtime repair command
- Broadening the existing Linux repository-wide verification job beyond a dedicated checkpoint-portability matrix

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #321 | 2026-08-29 | Initial feature spec |
