# Tasks: Fix sdlc-execute closing worker panes while their background work runs

**Issue**: #470
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/464-run-each-sdlc-step-on-its-assigned-claude-code-model/

## Implementation Tasks

### T001: Supervise settled workers until their handoff

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `awaitWorkerHandoff` replaces the two-call wait in worker dispatch. A waiting marker keeps the pane open until the worker resumes, a settled worker with no marker gets one reminder per resumption, and `blocked` and process loss return at once (AC1, AC2, AC3)
- A stale marker is removed before dispatch and on resumption (FR2)
- The resume wait polls `agentWait({ until: 'working', timeout: RESUME_POLL_MS })` with no deadline (FR3)
- `defaultHerdr().agentWait` passes `--timeout <ms>` (FR4)

### T002: Correct step selection after start and after a lost verify handoff

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- A clean, published branch with no commits relative to the default branch dispatches `implement` unless this invocation already passed implement at that head (AC4)
- A missing handoff sets `needsImplement` only for `implement` (AC5)

### T003: Tell workers about the waiting marker

**File(s)**: `src/sdlc-prompt-snippets.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `WORKER_HEADER` instructs the worker to write `{{handoffPath}}.waiting` before ending any turn while a background command for the step is still running (FR1)

### T004: Regression coverage

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-prompt-snippets.test.mjs`
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- New tests cover AC1–AC5 and the `--timeout` argument, and every one fails against the pre-fix controller
- The start-path tests expect `start, implement, verify, deliver`
- The exact worker header test includes the new line

### T005: Document the behavior

**File(s)**: `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- The README describes the waiting marker, the reminder, and the corrected routing, and lists the marker in the runtime-artifact table
- `CHANGELOG.md` records the fix under `### Fixed`
