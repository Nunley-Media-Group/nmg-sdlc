# Tasks: Bind SDLC run checkpoints to project identity with CAS writes

**Issue**: #290
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/259-add-controller-owned-fresh-session-remediation-loops/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | CAS identity bind in writeRun and persist paths | [ ] |
| T002 | Add regression coverage for reject and same-identity advance | [ ] |
| T003 | Verify existing execute tests | [ ] |

---

### T001: Fix the Defect

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `writeRun(runData, root, expectedRevision)` implements lock, identity compare, CAS revision, and atomic rename per design.md
- [ ] Throws exactly `invalid run schema`, `stale_revision`, `identity_mismatch`, or `checkpoint_locked`; on those errors `run.json` bytes are unchanged
- [ ] `runExecute` creates with identity+revision 1 only when the file is absent; existing different `issues` or unbindable files return status 1 and stderr `Run checkpoint identity mismatch\n` without writing
- [ ] Empty git branch/head on create returns status 2 and stderr `Run checkpoint identity unreadable\n` without writing
- [ ] `stopResult` and in-run persists use `persistRunState` (rollback `revision` on throw)
- [ ] `write-run` requires `--expected-revision N`
- [ ] `schemaVersion` remains 1; no handoff schema change; no `extension.ts` change

**Notes**: Import `openSync`, `closeSync`, `unlinkSync`, `renameSync`, `realpathSync` from `node:fs` and `randomUUID` from `node:crypto`. Reuse existing `run()` for create-time git snapshots only.

### T002: Add Regression Test

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Local `seedRun(root, fields)` seeds a bound revision-1 file; all previous fixture `writeRun({ schemaVersion: 1, … })` calls use it or an explicit identity payload
- [ ] AC1: after `seedRun`, a write with a different `issue` or `runId` and matching expected revision throws `identity_mismatch` and leaves bytes unchanged; `expectedRevision` 0 against revision 1 throws `stale_revision` and leaves bytes unchanged; same identity with expected 1 stores revision 2
- [ ] AC1: holding `run.json.lock` with `wx` causes `checkpoint_locked` and unchanged `run.json`
- [ ] AC2: `runExecute` advancing one step on a seeded bound run updates `currentStep`/`completed`/`failed` and keeps `projectRoot`, `runId`, `issue`, `branch`, `head`, `issues` identical
- [ ] `write-run` without `--expected-revision` exits 2 with the usage line
- [ ] Scenarios tagged `@regression` in `feature.gherkin` are covered by these Jest cases (no separate Gherkin runner in this repo)

### T003: Verify No Regressions

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Verify (no file changes)
**Depends**: T001, T002
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs` exits 0
- [ ] Resume, remediation persist, and two-issue fixtures still pass with frozen create-time `issue` identity

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T002)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
