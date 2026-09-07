# Tasks: Detect execute remediation loops and close workers on cancel

**Issue**: #369
**Date**: 2026-09-06
**Status**: Approved
**Author**: NMG

## Implementation

### T001: Bound remediation by step progress
**File(s)**: scripts/sdlc-execute.mjs, scripts/__tests__/sdlc-execute.test.mjs
**Type**: Modify
**Acceptance**:
- [ ] AC1/AC2/AC4/AC5: one worker at a time; two completed unsuccessful remediations stop before a third; successful advancement resets the streak for the next stage.
- [ ] AC3: unchanged blocked/intervention and loop stops survive reinvocation, while validated repaired passed evidence advances.
- [ ] Foreign remediation workers are never adopted or closed; failed starts retain ownership until cleanup resolves.

### T002: Supervise real controller cancellation
**File(s)**: scripts/sdlc-execute.mjs, scripts/sdlc-execute-supervisor.mjs, scripts/__tests__/sdlc-execute-supervisor.test.mjs
**Type**: Create and Modify
**Acceptance**:
- [ ] AC6: SIGINT, SIGTERM, and invoking-job loss stop the owned blocking controller group and close all owned panes, including pending prompt panes.
- [ ] AC7: --retain-worker preserves panes without suppressing cancelled failure persistence.
- [ ] Preserve latest checkpoint updates and exact lease ownership; retain diagnostic state on cleanup failure.

### T003: Verify and document delivery
**File(s)**: README.md, CHANGELOG.md, VERSION, package.json, specs/369-detect-execute-remediation-loops-and-close-workers-on-cancel/verification-report.md
**Type**: Modify and Create
**Acceptance**:
- [ ] Document public progress-stop and cancellation semantics without adding a reason-code policy table or changing review prompts.
- [ ] Record exact focused/full validation commands and outcomes plus live cancellation and consumer delivery proof.
- [ ] Complete exact-head contribution delivery, synchronize release artifacts, and validate the installed candidate in a fresh session.

## Behavior evidence mapping

Behavior for scripts/sdlc-execute.mjs: failed remediation without ordered-step advancement stops and remains stopped; cancellation preserves ownership through cleanup.
Behavior for scripts/sdlc-execute-supervisor.mjs: cancellation remains observable while the controller is blocked and when its invoking job disappears.
Behavior for scripts/__tests__/: regressions defend progress, cancellation, retained panes, and isolation boundaries.
