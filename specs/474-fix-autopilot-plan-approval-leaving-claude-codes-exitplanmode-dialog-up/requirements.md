# Defect Report: Fix autopilot plan approval leaving Claude Code's ExitPlanMode dialog up

**Issue**: #474
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/473-fix-smoke-provisioning-prompting-through-a-workspace-trust-dialog-herdr-reports-as-ready/

## Reproduction

1. In a Herdr pane started with `NMG_SDLC_AUTOPILOT=1`, run `claude --plugin-dir <nmg-sdlc> --permission-mode auto --debug`.
2. Run `/sdlc-draft-issue Add a tiny helper`.
3. When the workflow calls `ExitPlanMode`, the debug log shows `nmg-sdlc (user) answered classic.PermissionRequest`, the plan-approval dialog paints anyway, and the agent goes `blocked`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Autopilot, and the write-spec Finished approval, end plan mode without a dialog. |
| **Actual** | The dialog paints and the session waits for a person; live smoke provisioning stalls at `plan approval dialog`. |

## Acceptance Criteria

### AC1: Autopilot approves a plan without a dialog

**Given** a session with `NMG_SDLC_AUTOPILOT=1`
**When** the model calls `ExitPlanMode` with input I
**Then** the hooks module answers `{ decision: { behavior: 'allow', updatedInput: I } }` and Claude Code dispatches `ExitPlanMode` without painting the approval dialog

### AC2: The write-spec Finished approval carries the input

**Given** a write-spec Finished selection
**When** the model calls `ExitPlanMode` with input I
**Then** the hooks module answers `{ decision: { behavior: 'allow', updatedInput: I } }` once

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Every `ExitPlanMode` allow the hooks module returns carries the tool input as `updatedInput` | Must |

## Out of Scope

- Changing which plans autopilot approves
