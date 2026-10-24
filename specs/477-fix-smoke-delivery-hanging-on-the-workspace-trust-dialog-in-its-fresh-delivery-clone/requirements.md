# Defect Report: Fix smoke delivery hanging on the workspace-trust dialog in its fresh delivery clone

**Issue**: #477
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/473-fix-smoke-provisioning-prompting-through-a-workspace-trust-dialog-herdr-reports-as-ready/

## Reproduction

1. Run the registered gate with provisioning (no `NMG_SDLC_SMOKE_ISSUES`).
2. After the spec is published, the provider clones the delivery repository into a fresh temp directory and runs `sdlc-execute.mjs run #N` there.
3. The controller's `sN-start-*` worker pane shows Claude Code's workspace-trust dialog (`❯ No, exit`) indefinitely, Herdr reports the agent `unknown` with `launch_pending: true`, and the gate never finishes.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The provider trusts its own delivery clone before the nested controller runs. |
| **Actual** | The nested controller's first worker never starts, and the gate hangs. |

## Acceptance Criteria

### AC1: The delivery clone is trusted before the nested controller runs

**Given** a fresh delivery clone that shows the workspace-trust dialog
**When** the provider prepares delivery
**Then** it opens a pane in the clone, keys `down enter` once, waits until the agent is interactive-ready with no dialog, closes the pane, and only then runs `sdlc-execute.mjs run`

### AC2: An already-trusted clone is not keyed

**Given** a delivery clone whose session starts ready with no dialog
**When** the provider prepares delivery
**Then** it sends no keys and closes the trust pane

### AC3: Only the owned clone is ever keyed

**Given** a trust pane whose working directory is not the delivery clone, or a dialog other than workspace trust
**When** the provider prepares delivery
**Then** it sends no keys, closes the pane, and fails without running the nested controller

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `trustSmokeClone` runs between the delivery clone's clean check and the nested `sdlc-execute.mjs run` | Must |
| FR2 | The trust pane is closed on every outcome | Must |

## Out of Scope

- The execute controller answering trust dialogs: in ordinary use it runs in a project the person already trusted
