# Tasks: Resume execute from branch evidence and deliver only full-green verification

**Issue**: #436
**Date**: 2026-09-25
**Status**: Approved
**Author**: NMG

## Implementation Tasks

### T001: Branch-first execute and owned cancellation

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/sdlc-execute-supervisor.mjs`, `scripts/sdlc-status.mjs`, `scripts/issue-spec-scope.mjs`, `scripts/sdlc-controller-lease.mjs`, `src/extension.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- Execute resumes from branch and live evidence with four stages and unbounded cause-based repair; cancellation closes only owned panes (AC1, AC2, AC5, FR1–FR3, FR5).

### T002: Full-green verification and live delivery

**File(s)**: `scripts/sdlc-finalize-verification.mjs`, `scripts/sdlc-recover-verification.mjs`, `scripts/verification-readiness.mjs`, `scripts/sdlc-deliver.mjs`, `scripts/sdlc-safe-recoveries.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- Only complete exact-source-head registered results publish Pass or permit merge; delivery reconciles live PR/issue state (AC3, FR2, FR4).

### T003: Smoke gate and contracts

**File(s)**: `src/sdlc-verification-runtime.mjs`, `steering/extensions/nmg-sdlc-smoke.mjs`, `workflows/`, `commands/`, `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- Smoke proof is invocation-bound; workflows and docs describe branch-first delivery; outcome tests pass with `npm test -- --runInBand` (AC4, FR5).

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #436 | 2026-09-25 | Initial feature tasks |
