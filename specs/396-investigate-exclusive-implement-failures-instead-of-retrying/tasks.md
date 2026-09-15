# Tasks: Investigate exclusive implement failures instead of retrying

**Issue**: #396
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/372-restore-bounded-operator-authorized-recovery-of-stopped-delivery/

## Summary

Three tasks add a bounded exclusive implement resume, integrate it with outcome publication, and prove/document the one-shot contract.

### T001: Implement exclusive implement resume
**File(s)**: `scripts/sdlc-execute.mjs` (Modify)
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] AC1 classifies a closed exclusive implement worker only when owner, branch, handoff, worker absence, strict descendant, one single-parent commit, owner-planned subject, and non-denied paths are proven.
- [ ] AC2 archives and consumes one recovery, advances checkpoint HEAD, clears failure/remediation, and starts exactly `sN-implement`.
- [ ] AC3 uses `exclusiveResumePrompt` to investigate all task acceptance bullets before edits and forbids replay or branch-history destruction.
- [ ] AC4 keeps repaired-publication recovery on its exact-HEAD classifier and ordinary implement prompt.
- [ ] AC5 and AC7 fail closed for equal/unsafe/consumed states, dirty or unsafe ignored work, and unowned publication without worker dispatch.

### T002: Integrate outcome publication safety
**File(s)**: `scripts/sdlc-execute.mjs` (Modify)
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] AC6 requires `mutationPolicy: outcome` and all four Approved inputs in `readOnlyPaths`.
- [ ] The current verification report is permitted even when omitted from File(s); other spec paths remain denied.
- [ ] Exclusive recovery records the observed commit paths and rejects any denied path.

### T003: Prove and document bounded recovery
**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs` (Modify); `commands/sdlc-execute.md` (Modify); `workflows/execute/WORKFLOW.md` (Modify); `workflows/write-code/WORKFLOW.md` (Modify)
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] Focused fixtures cover AC1-AC7, prompt identity, archive/consumption state, strict commit ownership, dirty/ignored boundaries, and no second dispatch.
- [ ] Execute documentation describes the one-shot strict-descendant exclusive resume without weakening exact-HEAD repaired publication.
- [ ] Write-code performs investigation mapping first when the exclusive-resume header is present and keeps `step: "implement"`.
- [ ] Focused and full repository test suites pass with the new regression cases.

## Delivery-owned Artifacts

`CHANGELOG.md`, `VERSION`, and `package.json` receive the issue's patch release update after implementation verification.
