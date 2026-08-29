# Design: Migrate completed legacy execute checkpoints before identity enforcement

**Issue**: #321
**Date**: 2026-08-29
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/303-release-leftover-completed-execute-checkpoints-on-startup/

---

## Overview

`runExecute` reads `.omp/sdlc/run.json`, resolves the requested issue list, and handles a different persisted list before fresh-run initialization. The different-list branch currently calls `completedRunState`, which begins with `validRunIdentity`. A terminal checkpoint released before issue #290 therefore cannot reach issue #303's startup cleanup even when every issue records all eight valid steps and all active state is cleared.

Add one narrow legacy-terminal predicate: schema version 1, valid non-empty issue list, complete step evidence for every issue, null current step/current issue/failure, absent remediation, and zero identity-field own properties. Do not weaken the identity-bound completed predicate. Startup may release a different-list checkpoint when either the existing bound predicate or the new fully unbound legacy predicate succeeds. Any partial identity uses the mismatch path.

Generalize the existing completed cleanup boundary to accept the legacy shape only with an exact byte snapshot captured before cleanup, an exclusive lock, canonical-root confinement, safe runtime directories, and a second byte comparison under the lock. The legacy branch has no project root, run id, or revision to trust; caller-supplied canonical root plus unchanged bytes replaces identity/CAS only for deletion of this terminal state. After successful deletion, the existing fresh-run path creates all identity fields and revision normally.

---

## Architecture

### Startup Classification

```text
read checkpoint object + exact bytes
        |
requested issues differ?
        | no
        v
existing resume/bind rules (partial identity rejected)

        yes
        |
        +--> bound terminal predicate --> bounded bound cleanup
        |
        +--> fully unbound legacy terminal predicate --> byte-guarded bounded cleanup
        |
        +--> neither --> exact identity-mismatch failure
                              |
cleanup succeeds ----------------------> normal fresh-run initialization
```

### State Classification

| Shape | Different requested list | Matching requested list |
|-------|--------------------------|-------------------------|
| Valid identity-bound terminal | Existing completed cleanup | Existing behavior |
| Fully unbound legacy terminal | Legacy cleanup, then fresh run | Existing legacy binding remains only for fully unbound state |
| Any identity-field subset that is not a valid complete identity | `Run checkpoint identity mismatch` | `Run checkpoint identity mismatch`; never bind partial identity |
| Incomplete, active, failed, remediating, malformed | `Run checkpoint identity mismatch` | Existing fail-closed validation/resume behavior |

The identity-field set is exactly `projectRoot`, `runId`, `issue`, `branch`, `head`, and `revision`. Keep separate predicates for any identity field, complete valid identity, bound terminal state, and fully unbound legacy terminal state; do not overload an `every` check so a partial tuple looks absent.

---

## Interfaces and Data Contracts

No public CLI or checkpoint schema version changes. `/sdlc-execute` changes only the classification of a fully unbound terminal checkpoint during safe startup release.

### Legacy Terminal Predicate

A checkpoint is eligible only when all conditions hold:

| Field | Required value |
|-------|----------------|
| `schemaVersion` | `1` |
| `issues` | Non-empty array of positive safe integers |
| `currentIssue` | `null` |
| `currentStep` | `null` |
| `failed` | `null` |
| `remediation` | Missing or `null` |
| `completed[String(issue)]` | Contains every value in `VALID_STEPS` for every listed issue |
| Six identity fields | No own property for any field |

Unknown unrelated fields do not grant eligibility and do not replace any required evidence. Malformed JSON remains unreadable and fails closed through the existing mismatch surface.

### Cleanup Inputs

The legacy cleanup call receives the parsed checkpoint and the exact bytes captured for that same read. It must:

1. Resolve and realpath the caller project root using Node path/filesystem APIs.
2. Validate the legacy terminal predicate before mutation.
3. Validate `.omp`, `.omp/sdlc`, handoffs, and prompt-provenance as real directories rather than links/reparse boundaries.
4. Acquire the existing exclusive `run.json.lock` with `openSync(..., 'wx')`.
5. Re-read `run.json` under the lock and require exact byte equality with the captured snapshot, then parse and revalidate the same legacy terminal shape.
6. Delete only `<issue>-<step>.json` handoffs, `worker-<step>.json` provenance, `run.json.tmp`, and `run.json` using Node `rmSync` beneath the canonical runtime root.
7. Release only the acquired lock. Any failure returns the existing `completed_cleanup_failed` boundary and blocks fresh-run creation.

Identity-bound cleanup keeps its current project-root, run identity, and revision comparisons. Controller-lease acquisition/release remains outside cleanup and must not release a foreign or changed lease.

---

## Cross-Platform Design

- Construct native filesystem paths with `node:path` `join`, `resolve`, `relative`, and `isAbsolute`; use `path.posix` and `path.win32` only to generate deterministic path-form data.
- Compare checkpoint bytes as buffers so LF vs CRLF is explicit and host-independent.
- Create fixtures with `node:fs`; never call `rm`, `mkdir`, `ln`, `chmod`, shell scripts, or depend on shebangs/executable bits.
- Treat a Windows directory junction as an unsafe link boundary through `lstatSync`/reparse-point behavior. Junction coverage is mandatory; symbolic-link coverage may skip only on an explicit privilege-denied error.
- Invoke the focused Jest entry with an explicit Node executable and JavaScript entrypoint in the CI matrix so Windows does not depend on POSIX `.bin` shims.
- Assert fresh `projectRoot` against `fs.realpathSync(tempRoot)` on the running host rather than a simulated separator string.

---

## Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-execute.mjs` | Distinguish any/complete identity presence; add fully unbound terminal classification; capture checkpoint bytes for legacy cleanup; reuse bounded artifact deletion under lock with byte equality; route successful cleanup into existing fresh-run initialization. | Makes released terminal state migratable without weakening bound identity or cleanup safety. |
| `scripts/__tests__/sdlc-execute.test.mjs` | Add exact issue-6 → issue-19 startup regression, 62-subset rejection matrix, LF/CRLF × POSIX/Windows data matrix, byte-race/lock/link/junction/lease/CAS safety cases, and native fresh-identity assertions using Node APIs. | Covers every acceptance criterion deterministically and on native runners. |
| `.github/workflows/nmg-sdlc-verify.yml` | Add a dedicated checkpoint-portability matrix for Ubuntu, macOS, and Windows that installs `scripts/` dependencies and invokes only the focused Jest scenario through Node. | Supplies native platform evidence without tripling the existing full repository verification job. |

No workflow prose, handoff schema, public command, controller lease schema, or versioned checkpoint schema changes.

---

## State Transitions

```text
LegacyTerminalUnbound + DifferentIssues
  -> AcquireLease
  -> AcquireCheckpointLock
  -> BytesUnchanged + RuntimeSafe
  -> DeleteExactOwnedRuntime
  -> FreshIdentity(revision 1)
  -> Normal execute queue

Any invalid predicate / partial identity / unsafe boundary / stale bytes / held lock
  -> Run checkpoint identity mismatch
  -> Old checkpoint retained when not already partially deleted
  -> No new worker
```

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Legacy predicate | Deterministic Jest matrix | Eligible exact shape; missing terminal evidence; all 62 non-empty proper identity subsets; LF/CRLF and POSIX/Windows path-form values |
| Startup controller | Jest integration fixture | Exact released issue-6 payload starts issue 19 with fresh native identity; unsupported states keep bytes and start no worker |
| Cleanup | Jest filesystem fixture | Exact artifact set, unrelated runtime retained, held lock, changed bytes, deletion failure, symlink and Windows junction boundaries |
| Identity/lease | Jest regression | Partial identity never binds; stale revision and branch/head drift reject; foreign/changed lease is not removed |
| Native portability | GitHub Actions matrix | Focused checkpoint scenario on `ubuntu-latest`, `macos-latest`, and `windows-latest` |

Focused local command:

```text
cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs
```

The dedicated CI step uses an explicit cross-platform Node invocation of `node_modules/jest/bin/jest.js` with a stable test-name filter. Simulated `path.win32` fixtures supplement but never replace the Windows runner.

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Bind legacy state before cleanup | Add fresh identity to the old completed issue list, then use bound cleanup | Reuses current cleanup unchanged | Mutates obsolete state, requires branch/head guesses, and can rebind partial identity | Rejected |
| Delete legacy `run.json` directly | Remove the one blocking file | Small change | Bypasses lock, byte-race, symlink, artifact ownership, and provenance cleanup | Rejected |
| Treat every terminal-looking unbound object as completed | Ignore identity-field subsets and strict evidence | More migrations | Can discard resumable or tampered state | Rejected |
| Add a strict fully unbound terminal branch | Byte-guarded cleanup using existing bounded artifact set, then normal fresh initialization | Preserves safety and solves the released shape | Requires explicit legacy cleanup proof | **Selected** |

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Partial identity is mistaken for legacy absence | Low | High | Use an `any` own-property predicate and exhaust all 62 non-empty proper subsets. |
| Legacy checkpoint changes between classification and cleanup | Low | High | Capture exact bytes and compare buffers again under the exclusive lock before deletion. |
| Link/reparse boundary escapes runtime root | Low | High | Preserve lstat-based directory checks and require POSIX symlink plus Windows junction native tests. |
| CI matrix depends on POSIX npm shims | Med | Med | Invoke Jest's JavaScript entrypoint with explicit Node on every runner. |
| Cleanup partially removes owned artifacts before a later error | Low | Med | Keep checkpoint deletion last; fail closed and retain unrelated runtime for diagnosis. |
| Fresh run inherits legacy identity | Low | High | Set `existingRun = null` only after cleanup and use the existing fresh-run constructor; assert all identity fields and revision. |

---

## Open Questions

None. The issue supplies the released checkpoint shape, eligibility boundary, artifact set, supported hosts, and verification obligations.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #321 | 2026-08-29 | Initial feature spec |

---

## Validation Checklist

- [x] Architecture follows existing project patterns (per `structure.md`)
- [x] CLI and checkpoint interface behavior is documented
- [x] No database or UI changes apply
- [x] State transitions and identity boundaries are explicit
- [x] Cross-platform filesystem and process behavior is defined
- [x] Testing strategy covers deterministic and native-host evidence
- [x] Alternatives and risks are documented
