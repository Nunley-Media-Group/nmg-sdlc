# Requirements: Migrate completed legacy execute checkpoints before identity enforcement

**Issue**: #321
**Date**: 2026-08-28
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/303-release-leftover-completed-execute-checkpoints-on-startup/

---

## User Story

**As a** maintainer executing an approved issue after upgrading nmg-sdlc
**I want** the controller to release a fully completed pre-identity checkpoint before enforcing current run identity
**So that** obsolete terminal runtime cannot block a fresh execute queue while unsafe or resumable checkpoints remain fail-closed

---

## Background

Issue #303 made different-issue startup release completed identity-bound checkpoints through `completedRunState` and `cleanupCompletedRun`. The terminal predicate now requires `validRunIdentity`, so a released schema-version-1 checkpoint written before `projectRoot`, `runId`, `issue`, `branch`, `head`, and `revision` were introduced cannot reach guarded cleanup. A fully completed issue-6 checkpoint therefore causes `/sdlc-execute 19` to return `Run checkpoint identity mismatch` instead of creating issue 19 with fresh identity.

The migration must recognize only a complete terminal checkpoint with none of the six identity fields. It must retain the existing controller lease, exclusive checkpoint lock, canonical runtime boundary, symlink and junction rejection, exact artifact ownership, exact-byte/CAS protection, and identity-bound exact-head rules on macOS, Linux, and Windows.

---

## Acceptance Criteria

### AC1: Completed released legacy checkpoint is migrated

**Given** `.omp/sdlc/run.json` is schema version 1, has a non-empty positive-integer issue list, has `currentIssue`, `currentStep`, and `failed` set to `null`, has no remediation, records all eight `VALID_STEPS` for every listed issue, and contains none of `projectRoot`, `runId`, `issue`, `branch`, `head`, or `revision`
**When** `/sdlc-execute 19` starts for an approved eligible issue while that completed issue-6 checkpoint remains
**Then** the issue-6 checkpoint and only its exact issue-step handoffs, worker-step prompt provenance, checkpoint temporary file, and checkpoint file are released beneath the canonical project runtime
**And** unrelated runtime remains
**And** issue 19 enters the normal fresh-run path with a new run id, canonical current project root, issue/list, current branch and head, and a monotonic positive revision
**And** stderr does not contain `Run checkpoint identity mismatch`

### AC2: Unsafe legacy candidates stay fail-closed

**Given** an existing checkpoint is incomplete, active, failed, remediating, malformed, missing any terminal completion evidence, or contains any non-empty subset of the six identity fields without a complete valid identity
**When** `/sdlc-execute` requests a different issue list
**Then** the controller exits status 1 with stderr exactly `Run checkpoint identity mismatch
`
**And** the checkpoint bytes and supporting runtime remain unchanged
**And** no worker for the new issue list starts
**And** all 62 non-empty proper subsets of the six identity fields are rejected

### AC3: Cleanup and identity safety are preserved

**Given** a fully completed released legacy checkpoint cannot be cleaned because its checkpoint lock is held, a runtime directory crosses a symlink or junction boundary, an exact owned artifact cannot be removed, or checkpoint bytes change between classification and locked cleanup
**When** `/sdlc-execute` requests a different issue list
**Then** startup fails closed without creating or advancing the new run
**And** identity-bound checkpoints still require canonical project root, exact run/issue/branch/head identity, frozen issues, and monotonic compare-and-swap revision
**And** a partially identity-bearing checkpoint is never rebound as a fresh or legacy run

### AC4: Cross-platform behavior is identical

**Given** deterministic fixtures cover LF and CRLF serialization crossed with POSIX (`/consumer/project/.omp/sdlc`) and Windows (`C:\consumer\project\.omp\sdlc`) path forms for the fully unbound eligible shape and partially identity-bearing rejection shapes
**When** classification and different-issue startup run on macOS, Linux, and Windows
**Then** every host makes the same migrate-or-reject decision for the same logical checkpoint
**And** eligible cleanup removes the same exact run-owned artifact set beneath the host-native canonical project root
**And** the fresh issue-19 checkpoint stores `projectRoot === fs.realpathSync(tempRoot)` with native separators and a complete new identity
**And** fixture setup, invocation, and assertions use Node filesystem, path, child-process, and executable primitives rather than shell commands, executable bits, newline assumptions, or hardcoded separators

### AC5: Cross-platform safety boundaries stay fail-closed

**Given** legacy cleanup encounters a POSIX symbolic link, a Windows directory junction or permitted symbolic link, a held checkpoint lock, a foreign or changed controller lease, a stale revision, branch/head drift, or changed checkpoint bytes
**When** the applicable migration or identity write is attempted
**Then** cleanup and fresh-run creation stop without escaping the project runtime boundary, deleting foreign runtime, releasing another controller's lease, or rebinding stale or exact-head identity
**And** the prior checkpoint remains available for diagnosis whenever bounded cleanup has not already removed an exact owned artifact

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Recognize as migratable only a schema-version-1 checkpoint with a non-empty valid issue list, all eight completed steps for every issue, cleared current/failure/remediation state, and none of the six identity fields. | Must | Share terminal workflow validation with identity-bound cleanup; do not create a permissive second definition. |
| FR2 | Release an eligible legacy checkpoint with the existing exclusive lock, canonical runtime boundary, symlink/junction rejection, exact owned-artifact deletion, checkpoint-last ordering, and cleanup-failure behavior. | Must | Require exact checkpoint bytes to remain unchanged between classification and locked cleanup. |
| FR3 | After successful release, initialize the requested issue list through the normal fresh-run path with new project, run, issue, branch, head, and revision identity. | Must | Do not synthesize or copy identity from the legacy checkpoint. |
| FR4 | Preserve the existing checkpoint bytes and start no new worker for incomplete, active, failed, remediating, malformed, partially identity-bearing, cleanup-failing, or genuine identity-mismatch states. | Must | Return the exact existing mismatch stderr for different-list startup. |
| FR5 | Preserve compare-and-swap revision checks and exact-head identity for every identity-bound checkpoint and fresh run. | Must | Partially present identity fields are mismatch evidence, not bindable legacy state. |
| FR6 | Support identical classification, bounded cleanup, and fresh identity creation on macOS, Linux, and Windows using Node filesystem/path/process primitives only. | Must | Do not depend on POSIX shell commands, executable bits, line endings, or literal separators. |
| FR7 | Keep symlink and directory-junction rejection, exclusive lock/CAS checks, canonical-root confinement, and controller lease ownership fail-closed on every supported OS. | Must | Never remove `controller.lock` from completed-run cleanup. |
| FR8 | Add host-independent LF/CRLF and POSIX/Windows path-form fixtures plus platform-native checkpoint-portability CI on Ubuntu, macOS, and Windows. | Must | A Windows junction test is mandatory; skip only the privileged Windows symbolic-link variant when the runner reports permission denial. |

---

## Out of Scope

- Migrating or discarding resumable, incomplete, failed, blocked, active, or remediating checkpoints.
- Repairing malformed checkpoints or checkpoints containing only part of the identity tuple.
- Relaxing identity, revision, exact-head, lock, canonical-root, symlink/junction, or controller-process ownership checks for identity-bound runs.
- Adding a manual runtime repair command or changing the public `/sdlc-execute` interface.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #321 | 2026-08-28 | Initial feature spec |
