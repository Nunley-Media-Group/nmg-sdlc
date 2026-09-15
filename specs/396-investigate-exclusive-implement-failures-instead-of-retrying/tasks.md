# Tasks: Investigate exclusive implement failures instead of retrying

**Issue**: #396
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/372-restore-bounded-operator-authorized-recovery-of-stopped-delivery/

## Summary

Three tasks add a bounded exclusive implement resume, authorize explicitly listed verification-report publication, and prove/document the one-shot contract.

### T001: Implement exclusive implement resume
**File(s)**: `scripts/sdlc-execute.mjs` (Modify)
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] AC1 classifies a closed exclusive implement worker only when owner, branch, handoff, worker absence, and ancestor-or-equal HEAD are proven.
- [ ] AC2 archives and consumes one recovery, advances checkpoint HEAD, clears failure/remediation, and starts exactly `sN-implement`.
- [ ] AC3 uses `exclusiveResumePrompt` to investigate all task acceptance bullets before edits and forbids replay or branch-history destruction.
- [ ] AC4 keeps repaired-publication recovery on its exact-HEAD classifier and ordinary implement prompt.
- [ ] AC5 and AC7 fail closed for unsafe or consumed states without worker dispatch.

### T002: Permit an explicitly authorized verification report
**File(s)**: `scripts/sdlc-safe-recoveries.mjs` (Modify)
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] AC6 places an exact implement `verification-report.md (Create)` declaration in tracked writable and allowed paths.
- [ ] The four approved spec inputs and all other `specs/` paths remain read-only.
- [ ] The exception is absent unless approved `tasks.md` lists the exact report path with a non-read-only operation.

### T003: Prove and document bounded recovery
**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs` (Modify); `commands/sdlc-execute.md` (Modify); `workflows/execute/WORKFLOW.md` (Modify); `workflows/write-code/WORKFLOW.md` (Modify)
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] Focused fixtures cover AC1-AC7, prompt identity, archive/consumption state, adversarial blockers, and no second dispatch.
- [ ] Execute documentation describes the one-shot ancestor-or-equal exclusive resume without weakening exact-HEAD repaired publication.
- [ ] Write-code performs investigation mapping first when the exclusive-resume header is present and keeps `step: "implement"`.
- [ ] `cd scripts && npm test -- sdlc-execute.test.mjs` passes with the new regression cases.

## Delivery-owned Artifacts

`CHANGELOG.md`, `VERSION`, and `package.json` receive the issue's patch release update after implementation verification.
