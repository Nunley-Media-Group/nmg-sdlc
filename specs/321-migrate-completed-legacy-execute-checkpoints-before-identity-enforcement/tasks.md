# Tasks: Migrate completed legacy execute checkpoints before identity enforcement

**Issue**: #321
**Date**: 2026-08-29
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/303-release-leftover-completed-execute-checkpoints-on-startup/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Classify fully unbound terminal checkpoints | [ ] |
| T002 | Release legacy runtime and create fresh identity | [ ] |
| T003 | Add deterministic portability and safety regressions | [ ] |
| T004 | Add native checkpoint-portability CI matrix | [ ] |
| T005 | Verify focused and repository contracts | [ ] |

---

### T001: Classify fully unbound terminal checkpoints

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Define the identity field set once and distinguish any identity own property from a valid complete identity.
- [ ] A legacy terminal predicate requires schema version 1, non-empty positive-safe-integer issues, null current issue/current step/failure, missing-or-null remediation, and every `VALID_STEPS` value for every issue.
- [ ] The predicate requires all six identity fields to be absent as own properties.
- [ ] Any of the 62 non-empty proper identity subsets is ineligible and cannot enter legacy binding or cleanup.
- [ ] Existing valid identity-bound terminal classification remains unchanged.

### T002: Release legacy runtime and create fresh identity

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Different-issue startup accepts either the existing bound terminal predicate or the strict legacy terminal predicate; all other shapes return exact mismatch stderr.
- [ ] Legacy cleanup receives exact checkpoint bytes captured with the parsed state, acquires the existing exclusive lock, re-reads and buffer-compares bytes under lock, reparses/revalidates, and rejects any change.
- [ ] Canonical root and safe-directory checks reject symlink and junction boundaries before owned deletion.
- [ ] Cleanup removes only exact `<issue>-<step>.json` handoffs, `worker-<step>.json` provenance, `run.json.tmp`, and `run.json`; unrelated runtime remains.
- [ ] Held locks, byte changes, deletion failures, and ownership/lease failures stop startup without a new worker.
- [ ] Successful cleanup sets no legacy identity; normal fresh-run initialization creates canonical projectRoot, new runId, requested issue/branch/head, frozen issues, and revision 1.
- [ ] Identity-bound CAS, revision, branch/head, project-root, and controller-lease behavior remains fail-closed.

### T003: Add deterministic portability and safety regressions

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] Seed the exact released issue-6 legacy payload, request approved issue 19, and assert no mismatch, exact old artifact cleanup, unrelated runtime retention, new worker start, and fresh complete native identity.
- [ ] Generate LF/CRLF × `path.posix`/`path.win32` path-form combinations and all 62 non-empty proper identity subsets; decisions are invariant across combinations.
- [ ] Incomplete, active, failed, remediating, malformed, and missing-completion shapes retain exact bytes/runtime and start no issue-19 worker.
- [ ] Use Node `fs`, `path`, `os`, `process.execPath`, and argument arrays only; no shell fixture commands, chmod, executable-bit, separator, or newline assumptions.
- [ ] Cover held lock, changed checkpoint bytes, owned deletion failure, stale revision, branch/head drift, and foreign/changed controller lease.
- [ ] POSIX hosts cover symbolic links. Windows covers a directory junction and covers symbolic links unless `fs.symlinkSync` returns an explicit privilege-denied error.
- [ ] Existing completed bound cleanup, different-list mismatch, same-list legacy binding, and exact artifact ownership tests remain passing.
- [ ] Scenarios `@SCN001` through `@SCN005` are represented by Jest evidence.

### T004: Add native checkpoint-portability CI matrix

**File(s)**: `.github/workflows/nmg-sdlc-verify.yml`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- [ ] Preserve the existing Ubuntu `verify` job unchanged in purpose and add a dedicated matrix job for `ubuntu-latest`, `macos-latest`, and `windows-latest`.
- [ ] Each runner checks out, sets up Node 20 with the `scripts/package-lock.json` cache, and runs `npm ci --no-audit --no-fund` in `scripts/`.
- [ ] Each runner invokes `node_modules/jest/bin/jest.js` through explicit Node with `--experimental-vm-modules`, `--runInBand`, the execute test file, and a stable checkpoint-portability test-name filter.
- [ ] The matrix proves native canonical root/separators and platform-specific link/junction safety; simulated path data is not reported as native evidence.
- [ ] No shell-created fixture, POSIX-only command, shebang, or executable-bit dependency is introduced.

### T005: Verify focused and repository contracts

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`, `.github/workflows/nmg-sdlc-verify.yml`
**Type**: Verify (no file changes)
**Depends**: T003, T004
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs` exits 0 locally.
- [ ] The full repository Jest suite and `node scripts/verify-plugin-surface.mjs --root . --label repository` exit 0.
- [ ] Hosted checkpoint-portability jobs pass on Ubuntu, macOS, and Windows, or any unavailable runner is replaced by attached focused smoke evidence from an actual host of that OS.
- [ ] Evidence records identical classification, exact owned cleanup, unrelated-runtime retention, native fresh identity, and fail-closed unsafe boundaries per runner.

---

## Validation Checklist

- [x] Tasks cover classification, cleanup, regression evidence, native CI, and verification
- [x] Dependencies are explicit and topologically ordered
- [x] Every acceptance criterion maps to observable tests or hosted evidence
- [x] No resumable checkpoint migration or safety relaxation is in scope
- [x] File paths match project structure and existing verification ownership
