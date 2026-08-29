# Tasks: Migrate completed legacy execute checkpoints before identity enforcement

**Issue**: #321
**Date**: 2026-08-28
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/303-release-leftover-completed-execute-checkpoints-on-startup/
---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Classification | 1 | [ ] |
| Cleanup and startup | 1 | [ ] |
| Regression coverage | 1 | [ ] |
| Native CI | 1 | [ ] |
| **Total** | 4 | |

---

### T001: Separate terminal workflow state from identity presence

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Add the six-field `RUN_IDENTITY_FIELDS` inventory and replace `hasRunIdentity` with `hasAnyRunIdentity`
- [ ] Update `writeRunAt` bind-in-place and `runExecute` unbound-resume checks so every partial identity tuple is rejected instead of rebound
- [ ] Extract `completedWorkflowState` with schema-v1, issue-list, cleared-state, and all-`VALID_STEPS` requirements
- [ ] Keep `completedRunState` for complete valid identity and add `legacyCompletedRunState` only for zero identity fields; both reuse `completedWorkflowState`
- [ ] Preserve `validRunIdentity`, `sameRunIdentity`, schema version 1, the public command, and handoff formats

### T002: Release exact-byte legacy terminal state through guarded cleanup

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/sdlc-controller-lease.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Add private `readRunSnapshotAt(runFile, root)` returning parsed state plus exact UTF-8 bytes from one read while preserving `readRunAt` and `readRun` signatures
- [ ] Add `ownsControllerLease(lease)` in `scripts/sdlc-controller-lease.mjs`, reuse it from `releaseControllerLease`, and preserve a missing, foreign, or changed serialized lease
- [ ] Extend `cleanupCompletedRun(runData, root, { expectedLegacyBytes, controllerLease } = {})`; existing two-argument direct test callers remain bound mode
- [ ] Legacy mode requires a fully unbound terminal checkpoint, the acquired controller lease, exact unchanged snapshot bytes under `run.json.lock`, canonical-root directory checks, and safe link boundaries before deletion
- [ ] Bound mode retains exact identity, issue list, branch/head, revision, and same-run checks
- [ ] Cleanup removes only exact issue-step handoffs, worker-step provenance, `run.json.tmp`, and `run.json` last; unrelated runtime and `controller.lock` remain
- [ ] Different-list startup accepts only bound-terminal or legacy-terminal state, maps cleanup failure to exact `Run checkpoint identity mismatch
`, and falls through to the unchanged fresh-run initializer only after successful cleanup
- [ ] Fresh issue 19 identity comes from canonical current root, one new controller run id, the requested issue list, current branch/head snapshots, and normal monotonic persistence

### T003: Cover migration, rejection, and ownership boundaries

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] Use an exact issue-6 legacy payload to start issue 19; assert exact owned cleanup, unrelated-runtime preservation, no identity-mismatch stderr, worker start, and complete fresh native identity
- [ ] Generate the Cartesian LF/CRLF and POSIX/Windows path-form matrix with Node APIs and reject all 62 non-empty proper identity-field subsets with exact unchanged bytes and no worker
- [ ] Cover incomplete, active, failed, remediating, malformed, missing-completion, invalid-full-identity, and changed-byte candidates
- [ ] Prove held checkpoint lock, exact-artifact deletion failure, POSIX symlink, Windows mandatory junction, and privilege-conditional Windows symbolic-link cases fail closed
- [ ] Prove foreign and changed controller leases block cleanup/fresh persistence and are not removed, and prove stale revision plus branch/head drift preserve identity-bound checkpoint bytes
- [ ] Use only `node:fs`, `node:path`, `node:child_process`, `node:os`, `process.execPath`, and argument arrays for fixture setup, invocation, and assertions
- [ ] Map `@SCN001` through `@SCN005` one-to-one to named Jest cases or outlines

### T004: Run checkpoint portability on every supported host

**File(s)**: `.github/workflows/nmg-sdlc-verify.yml`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- [ ] Preserve the existing Ubuntu `verify` job unchanged
- [ ] Add `checkpoint-portability` with `fail-fast: false` and matrix `ubuntu-latest`, `macos-latest`, `windows-latest`
- [ ] Each runner uses Node 20, `npm ci --no-audit --no-fund` in `scripts`, and `npm test -- --runInBand __tests__/sdlc-execute.test.mjs`
- [ ] Native results prove identical classification, exact owned cleanup, unrelated-runtime preservation, fresh `projectRoot === fs.realpathSync(tempRoot)`, lock/lease/CAS failures, and the applicable link boundary
- [ ] Simulated path-form tests are not reported as substitutes for a missing native OS result; unavailable runner evidence is recorded as an incomplete verification gap

---

## Dependency Graph

```text
T001 -> T002 -> T003 -> T004
```

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #321 | 2026-08-28 | Initial feature spec |

## Validation Checklist

- [x] Tasks form one acyclic implementation order.
- [x] Every production edit and exported cleanup call site is named.
- [x] Every acceptance criterion maps to deterministic and native-host evidence.
- [x] No task adds a schema version, manual repair command, shell fixture, or broader cleanup boundary.
