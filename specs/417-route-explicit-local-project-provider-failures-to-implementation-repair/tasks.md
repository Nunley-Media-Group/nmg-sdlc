# Tasks: Route explicit local project-provider failures to implementation repair

**Issue**: #417
**Date**: 2026-09-23
**Status**: Approved
**Author**: NMG

### T001: Validate explicit provider repair evidence
**File(s)**: src/sdlc-verification-runtime.mjs, scripts/verification-readiness.mjs, scripts/__tests__/
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Accept only a failed required applicable registered project provider with explicit valid repairability and executed deterministic local test evidence.
- [ ] Reject malformed envelopes, absent or false marks, incomplete prerequisites and stale issue/head/coverage.

### T002: Route safe failed verification to normal implementation
**File(s)**: scripts/sdlc-finalize-verification.mjs, scripts/sdlc-execute.mjs, scripts/__tests__/, workflows/verify-code/WORKFLOW.md
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Keep failed artifact/report, consume exactly one owning failed-verify recovery, restore implement then review1/fix1/review2/fix2/verify.
- [ ] Read skill://skill-creator before changing the workflow and exercise its changed behavior.

### T003: Enable explicit retained-artifact recovery
**File(s)**: scripts/sdlc-execute.mjs, scripts/__tests__/sdlc-execute.test.mjs
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] Digest-bind operator authorization to the original five-key MileDar #169 artifact without editing its contents or steering.
- [ ] Reject mismatched digest, issue, HEAD, owner, incomplete evidence or repeated use; do not trust summary text.

### T004: Verify and deliver scoped plugin repair
**File(s)**: `README.md`, `CHANGELOG.md`, `VERSION`, `package.json`, `commands/sdlc-verify-code.md`, `specs/417-route-explicit-local-project-provider-failures-to-implementation-repair/verification-report.md`
**Type**: Modify/Create
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] Record pre-fix regression, focused/full tests, surface and exercise, read-only retained-evidence probe, candidate installation/doctor, and registered fresh approved issue smoke (no progress stops).
- [ ] Complete exact-head review/CI merge, issue closure and clean pinned install only after coordinating global boundary with #415 session.
