# Tasks: Remove completed execute runtime checkpoints

**Issue**: #299
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/290-bind-sdlc-run-checkpoints-to-project-identity-with-cas-writes/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Implement safe completed-run cleanup | [x] |
| T002 | Add cleanup regression coverage | [x] |
| T003 | Record and verify the changed contract | [x] |

### T001: Implement Completed-Run Cleanup

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [x] Export `cleanupCompletedRun(runState, root)` for direct behavioral tests
- [x] Require a bound, fully terminal run and exact on-disk identity plus revision under the existing exclusive checkpoint lock
- [x] Reject symlinked runtime directory components before deleting files
- [x] Remove only run-owned issue/step handoffs, worker-step provenance, the temporary checkpoint, and `run.json` last
- [x] Normalize all cleanup failures to `completed_cleanup_failed` and release only the acquired lock
- [x] Replace only the successful queue's terminal persist; retain every incomplete/failed/blocked persist path

### T002: Add Regression Coverage

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [x] AC1 proves a fully completed queue removes its checkpoint, exact handoffs, and worker provenance while preserving unrelated runtime files
- [x] AC2 proves a different issue list can create a fresh checkpoint after successful cleanup
- [x] AC3 proves interrupted and failed runs retain checkpoint and supporting runtime files
- [x] AC4 proves lock, identity, symlink-safety, or deletion failure returns `completed_cleanup_failed` and does not report success
- [x] AC5 proves `.omp/sdlc/` remains ignored and no runtime path is tracked
- [x] Each `@regression` scenario in `feature.gherkin` maps to a named Jest case

### T003: Record and Verify the Contract

**File(s)**: `CHANGELOG.md`, `specs/299-remove-completed-execute-runtime-checkpoints/tasks.md`, `specs/299-remove-completed-execute-runtime-checkpoints/verification-report.md`
**Type**: Modify / Create
**Depends**: T001, T002
**Acceptance**:
- [x] `[Unreleased]` records the completed-runtime cleanup fix
- [x] Completed task checkboxes truthfully match implementation and evidence
- [x] Focused execute tests pass
- [x] Full script tests, live smoke, and git hygiene gates pass
- [x] Verification report records commands and outcomes with exact changed paths

## Validation Checklist

- [x] Tasks map directly to AC1–AC5
- [x] Cleanup remains scoped to completed runtime ownership
- [x] Regression coverage includes preservation and failure boundaries
- [x] File paths exist or are issue-owned spec artifacts
