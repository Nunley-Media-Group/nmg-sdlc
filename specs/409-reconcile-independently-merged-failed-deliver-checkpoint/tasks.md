# Tasks: Reconcile independently merged failed-deliver checkpoint

**Issue**: #409
**Date**: 2026-09-22
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/374-recover-bounded-automatic-delivery-stops-without-loops/

---

### T001: Gate admission on exact external delivery proof

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Acceptance**:
- [ ] Admit a different explicit issue only for one valid, failed-deliver run with consistent PR/head/issue identity, closed issue, merged exact PR/head and merge ancestry on clean default checkout
- [ ] Reject missing or changed proof, old queue ambiguity, live or foreign owner, locked checkpoint, dirty checkout and non-default checkout without dispatch

### T002: Preserve prior failure and use locked byte-CAS release

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Acceptance**:
- [ ] Archive original checkpoint bytes and failed handoff and available evidence before removal with exclusive, run-identified durable storage
- [ ] Refuse archive collisions, changed bytes/revision, unsafe paths and failed writes without erasing original failure
- [ ] Retain ordinary completed cleanup and same-run recovery behavior

### T003: Verify and document changed admission

**File(s)**: `README.md`, `CHANGELOG.md`, `VERSION`, `package.json`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Acceptance**:
- [ ] Positive disposable reproduction fails pre-fix and passes post-fix; fail-closed variants defend the externally observable boundary
- [ ] Focused/full scripts, plugin surface and skill exercise, candidate install/doctor, read-only MileDar inspection, and bounded fresh-fixture smoke evidence are recorded
- [ ] Manual bug delivery keeps patch version mirrors and versioned changelog aligned
