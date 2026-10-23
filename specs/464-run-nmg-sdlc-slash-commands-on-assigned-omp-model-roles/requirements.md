# Requirements: Run nmg-sdlc slash commands on assigned OMP model roles

**Issue**: #464
**Date**: 2026-10-22
**Status**: Approved
**Author**: NMG

---

## User Story

**As a** developer invoking nmg-sdlc slash commands in the OMP TUI
**I want** each automated command to run on the OMP model role suited to its workload, with my session model restored afterward
**So that** lightweight commands use my fast model, verification uses my most capable model, and my chosen session model is unaffected

## Background

The automated commands `/sdlc-execute`, `/sdlc-status`, `/sdlc-verify-code`, and `/sdlc-open-pr` are `commands/*.md` file commands expanded into the user's current TUI session, so they run on whatever model is active. The interactive commands `/sdlc-draft-issue`, `/sdlc-write-spec`, `/sdlc-onboard-project`, `/sdlc-upgrade-project`, `/sdlc-steering`, and `/sdlc-run-retro` are rewritten by the `src/extension.ts` `input` handler into native OMP plan mode, which applies the `plan` role itself.

An OMP `modelRoles` value can list comma-separated selectors, of which the first available one is used, and a selector can end in a thinking suffix (for example `slow: provider/model:xhigh`). Execute stage workers take their roles from the stage role map delivered by #463; the command roles belong to that same map.

## Acceptance Criteria

### AC1: Automated commands run on their role

**Given** an idle TUI session on model X with thinking level L, where `@smol` resolves to model S whose matched effective `modelRoles.smol` selector carries thinking suffix Ls, and `@slow` resolves to model V whose matched effective `modelRoles.slow` selector carries thinking suffix Lv
**When** the user submits `/sdlc-status`, `/sdlc-open-pr`, or `/sdlc-execute`
**Then** that command's agent run uses model S with thinking level Ls
**And** when the user submits `/sdlc-verify-code`, its agent run uses model V with thinking level Lv
**And** when the matched role selector has no explicit thinking suffix, nmg-sdlc sets no thinking level and the run uses the thinking level OMP applies for the new model

### AC2: Session model and thinking level are restored

**Given** an automated command switched the session from model X with thinking level L to its role
**When** the command's agent run ends by completion, error, or abort
**Then** the session's active model is X and its thinking level is L again
**And** an intermediate continuation (`agent_end` with `willContinue: true`) restores nothing
**And** global and project `modelRoles` are unchanged

### AC3: A model choice made during the command wins

**Given** an automated command switched the session to its role
**When** the user selects a different model or thinking level before the command's agent run ends
**Then** the user's selection stays active after the run ends and X/L are not restored

### AC4: Interactive commands keep native plan-mode roles

**Given** an idle TUI session on model X with thinking level L
**When** the user submits `/sdlc-draft-issue`, `/sdlc-write-spec`, `/sdlc-onboard-project`, `/sdlc-upgrade-project`, `/sdlc-steering`, or `/sdlc-run-retro`
**Then** the extension rewrites it into native plan mode exactly as before
**And** nmg-sdlc performs no model or thinking-level switch at submission or when that command's agent runs end, leaving model selection to native plan mode and its plan review

### AC5: Unavailable role warns and continues

**Given** the command's role resolves to no available authenticated model, or the resolved model cannot be selected
**When** the user submits the automated command in an idle TUI session
**Then** the command runs on the current model and thinking level
**And** the TUI shows the warning `NMG SDLC: @<role> is unavailable; /<command> continues on the current model.`, for example `NMG SDLC: @slow is unavailable; /sdlc-verify-code continues on the current model.`
**And** nothing is restored when that run ends

### AC6: Headless and busy sessions do not switch

**Given** a print or RPC session, a session without a TUI, or a TUI session that is already streaming when the command is submitted
**When** an automated command runs
**Then** nmg-sdlc performs no model or thinking-level switch and the command uses the session's active model

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Map `/sdlc-execute`, `/sdlc-status`, and `/sdlc-open-pr` to `smol` and `/sdlc-verify-code` to `slow`, in the same role map used for execute stage workers | Must |
| FR2 | At idle TUI submission of an automated command, switch the session to the role's resolved model and, when the role's matched selector in the effective `modelRoles` value carries an explicit thinking suffix, to that thinking level, for that session only, never persisting `modelRoles` or any other OMP setting | Must |
| FR3 | Restore the prior model and thinking level when the command's agent run ends, unless the user changed either during the run | Must |
| FR4 | Perform no switch for the six interactive plan-mode commands | Must |
| FR5 | When the role cannot be resolved or authenticated, warn with the exact AC5 message and continue on the current model | Must |
| FR6 | Perform no switch in print or RPC sessions, or when the TUI session is streaming at submission | Must |

## Out of Scope

- Overriding the execution model the user selects in OMP's plan review for interactive commands
- Writing `modelRoles`, model presets, `retry.fallbackChains`, or any other user OMP setting
- Per-command custom override roles
- Changing the `--model` role arguments of execute stage workers (#463)

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #464 | 2026-10-22 | Initial feature spec |
