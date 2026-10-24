# Defect Report: Fix smoke provisioning prompting through a workspace-trust dialog Herdr reports as ready

**Issue**: #473
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/470-fix-sdlc-execute-closing-worker-panes-while-their-background-work-runs/

## Reproduction

1. Inside Herdr, clone `Nunley-Media-Group/nmg-sdlc-smoke` into a fresh untrusted temp directory.
2. With the provider's own `createHerdrAdapter`, run `paneSplit(clone)` (`--current --direction right`) and `agentStart(...)`.
3. `agent start` returns `agent_status: idle` and `interactive_ready: true` within about 4 s. The narrow pane still shows the workspace-trust dialog, with `❯ No, exit` selected, the header scrolled away, and `Yes, I trust this` / `folder` wrapped.
4. Run the registered gate. Provisioning reports `incomplete — nmg-sdlc-smoke provisioning agent lost` right after the `/sdlc-draft-issue` prompt, and later runs under the same identity fail closed with `provisioning interrupted`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The provider recognizes the trust dialog whether or not Herdr reports the agent ready, and whatever the pane width. It accepts trust once for its own clone and then prompts. |
| **Actual** | The prompt's Enter confirms `No, exit`, Claude Code exits, and provisioning loses its agent. |

## Acceptance Criteria

### AC1: A trust dialog behind a ready agent is accepted before prompting

**Given** `herdr agent start` succeeds and `agent get` reports `interactive_ready: true` while the pane shows the workspace-trust dialog
**When** the provider waits for provisioning readiness
**Then** it accepts the owned clone's trust dialog once (`down`, `enter`) and sends `/sdlc-draft-issue` only after the dialog is gone

### AC2: Wrapped dialog text is recognized

**Given** pane text in which a dialog label wraps across lines, such as `Yes, I trust this` followed by `folder`
**When** `claudeDialog` classifies it
**Then** it returns the same dialog kind as for the unwrapped text

### AC3: Ordinary readiness is unchanged

**Given** a ready agent with no dialog on screen
**When** the provider waits for readiness
**Then** it prompts without sending any keys

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | The provisioning readiness loop checks the visible pane for the workspace-trust dialog before it trusts `interactive_ready` | Must |
| FR2 | `claudeDialog` treats every run of whitespace in pane text as one space before matching | Must |

## Out of Scope

- Herdr's agent-state detection
- Changing the provisioning pane's split direction
