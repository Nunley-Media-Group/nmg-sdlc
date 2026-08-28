# Root Cause Analysis: Remove completed execute runtime checkpoints

**Issue**: #299
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/290-bind-sdlc-run-checkpoints-to-project-identity-with-cas-writes/

---

## Root Cause

`runExecute()` persists one final state after every issue has completed all eight `VALID_STEPS`. That state keeps the original identity tuple and frozen `issues` array while setting `currentIssue` and `currentStep` to `null`. On the next invocation, startup sees an existing `run.json`; a different requested issue list correctly fails the identity comparison with `Run checkpoint identity mismatch`.

The terminal persist is unnecessary. The successful queue no longer needs resume state, but the controller does not release its exact handoffs or `worker:<step>` prompt-provenance sidecars either.

### Affected Code

| File | Symbol / area | Role |
|------|---------------|------|
| `scripts/sdlc-execute.mjs` | `writeRun`, `persistRunState`, `runExecute` finalization | Identity-bound checkpoint lifecycle and terminal persist |
| `scripts/__tests__/sdlc-execute.test.mjs` | completed queue and checkpoint fixtures | Behavioral regression coverage |
| `.gitignore` | `.omp/sdlc/` | Runtime files remain ignored and untracked |

## Fix Strategy

Add a narrow `cleanupCompletedRun(runState, root)` operation and invoke it only after every requested issue has completed every `VALID_STEPS` entry and delivery synchronization has succeeded.

### Ownership and terminal validation

Before deleting anything, cleanup must:

1. Require a valid bound schema-version-1 run identity.
2. Require non-empty `issues`, `currentIssue === null`, `currentStep === null`, `failed === null`, no active remediation, and every issue's completed list to include every `VALID_STEPS` member.
3. Acquire the existing exclusive `run.json.lock` with `wx`; a lock collision is a cleanup failure, never a stolen lock.
4. Read `run.json` while holding the lock and require the on-disk identity and revision to exactly match `runState`.
5. Reject symlinked runtime directory components before any deletion so cleanup cannot escape the project-owned `.omp/sdlc/` boundary.

### Exact run-owned artifacts

With the identity verified and lock held, remove only:

- `.omp/sdlc/handoffs/<issue>-<step>.json` for each issue in `runState.issues` and each `VALID_STEPS` value;
- `.omp/sdlc/prompt-provenance/worker-<step>.json` for each `VALID_STEPS` value;
- `.omp/sdlc/run.json.tmp` when present;
- `.omp/sdlc/run.json`, last.

Use force only for an absent exact file. Do not recursively remove `.omp/sdlc/`, `handoffs/`, or `prompt-provenance/`; unrelated runtime and historical evidence remain untouched. Release only the lock created by this cleanup attempt.

Deleting `run.json` last preserves fail-closed startup behavior if an earlier artifact cannot be removed. A retry may safely finish missing exact files. Any validation, lock, path-safety, read, identity, or deletion failure is normalized to `Error('completed_cleanup_failed')`.

### Controller behavior

Replace the terminal checkpoint persist with:

1. Set `currentIssue` and `currentStep` to `null`, clear `failed` and remediation in memory.
2. Call `cleanupCompletedRun(runState, cwd)`.
3. Return status 0 only after cleanup succeeds.
4. Return status 1 with stderr `completed_cleanup_failed\n` on any cleanup failure.

All existing early returns and `stopResult()` paths continue to persist state. No cleanup runs for interrupted, blocked, failed, incomplete, or delivery-unsynchronized queues.

## Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-execute.mjs` | Add safe terminal cleanup and replace final persist | Release only completed run ownership while retaining CAS safety |
| `scripts/__tests__/sdlc-execute.test.mjs` | Cover success, next-run start, incomplete retention, failure, and ignore/index behavior | Prove AC1–AC5 |
| `CHANGELOG.md` | Record the pending defect fix | User-visible execute behavior changed |

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Incomplete queues lose resume evidence | Low | Strict terminal predicate and regression fixtures for failed and interrupted runs |
| Cleanup deletes unrelated files | Low | Enumerate exact issue/step and consumer paths; never recursively delete directories |
| Concurrent writer races cleanup | Low | Reuse the exclusive checkpoint lock and compare full identity plus revision under lock |
| Symlink redirects deletion outside the project | Low | Reject symlinked runtime path components before deletion |
| Partial cleanup is reported as success | Low | Delete checkpoint last and normalize every failure to `completed_cleanup_failed` |

## Alternatives Considered

| Option | Why Not Selected |
|--------|------------------|
| Ignore terminal checkpoint identity mismatches | Weakens fail-closed identity protection for genuinely resumable runs |
| Delete only `run.json` | Leaves run-owned handoffs and provenance contrary to AC1 |
| Recursively remove `.omp/sdlc/` | Can purge unrelated or historical runtime artifacts and exceeds scope |
| Persist a `completed` marker and clean on next startup | Keeps the defect until another invocation and complicates identity startup |

## Validation Checklist

- [x] Root cause identifies the terminal persist and identity gate
- [x] Cleanup is limited to fully completed queues
- [x] Exact owned paths and symlink boundaries are defined
- [x] Cleanup failure has one stable reason
- [x] No worker orchestration or selection behavior changes
