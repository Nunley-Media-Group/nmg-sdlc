# Defect Report: Exit native plan mode when write-spec Finished is selected

**Issue**: #444
**Date**: 2026-09-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/438-return-write-spec-to-native-plan-mode-after-merged-publication/

---

## Reproduction

1. In an Oh My Pi TUI session with nmg-sdlc loaded, run `/sdlc-write-spec #N` for an open issue without an approved spec, approve the proposal, and let the spec publish and merge.
2. The extension submits the post-publication continuation into native plan mode and the Continue picker appears.
3. Select `Finished — stop writing specs`.
4. Alternatively, run bare `/sdlc-write-spec` with at least one open issue missing `spec-created` and select `Finished — stop without writing a spec`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The Finished output (none for the initial picker) is printed and the turn ends; the session then leaves native plan mode completely — session mode `none`, normal tools restored, no plan or plan-paused status — without the user typing a command. |
| **Actual** | The Finished output is printed but the session stays in native plan mode; the agent cannot end its turn and keeps re-asking until the user exits plan mode manually. |

## Acceptance Criteria

### AC1: Continue-loop Finished exits plan mode fully

**Given** a TUI write-spec session in native plan mode at the post-publication Continue loop with at least one published spec
**When** the user selects `Finished — stop writing specs`
**Then** the existing `Published specs: …` and `Next step: /sdlc-execute #<first-published>` lines are printed unchanged
**And** the turn ends without another `ask` or `xd://propose`
**And** after that turn ends terminally, the session's plan mode is fully disabled (last session mode entry `none`, no plan or plan-paused status) without the user typing any command
**And** the extension dispatches only builtin `/plan` commands, so the working tree remains on the repository default branch

### AC2: Initial-picker Finished exits plan mode fully

**Given** bare `/sdlc-write-spec` showing the initial picker in native plan mode
**When** the user selects `Finished — stop without writing a spec`
**Then** write-spec stops without Discovery and without printing `Published specs:` or `Next step:`
**And** the turn ends without another `ask` or `xd://propose`
**And** after that turn ends terminally, the session's plan mode is fully disabled without the user typing any command

### AC3: Non-Finished selections keep plan mode

**Given** either write-spec picker in native plan mode
**When** the user selects an issue row, `Continue — enter another issue number`, or a valid or invalid automatic Other entry
**Then** plan mode stays active, and the existing Discovery, Interview, re-ask, and `xd://propose` behavior is unchanged
**And** no plan-mode exit is dispatched

### AC4: Undispatchable exit fails safe

**Given** a Finished selection whose plan-mode exit cannot be dispatched because there is no UI, a non-empty editor draft, an unfocused editor, or a submit failure, or whose dispatched `/plan` leaves plan mode active (for example, the host's `Exit plan mode?` confirmation is declined)
**When** the terminal `agent_end` evaluates the exit
**Then** the extension preserves any editor draft and submits no partial command
**And** it shows the warning notification `NMG SDLC: write-spec finished, but plan mode is still active; /plan exits it.`
**And** a later terminal `agent_end` dispatches nothing for that Finished selection
**But Given** a non-terminal `agent_end` (`willContinue: true`) after a Finished selection
**Then** the extension dispatches nothing and waits for the terminal end

### AC5: Post-publication continuation is preserved

**Given** a merged write-spec publication in a TUI session
**When** the execution turn ends terminally
**Then** the extension still submits the Continue-loop continuation into native plan mode exactly once with every published `N-slug`
**And** a new `/sdlc-write-spec` invocation still resets the published list and any pending Finished exit

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | In a write-spec session (started by `/sdlc-write-spec` or its post-publication continuation), detect an `ask` result that selected the exact label `Finished — stop writing specs` or `Finished — stop without writing a spec`, and after the next terminal `agent_end` dispatch builtin `/plan` through the focused TUI editor, one awaited toggle at a time, until the session mode is `none` (not `plan_paused`). | Must |
| FR2 | Both write-spec Finished branches end the turn after their existing output without calling `ask` or `xd://propose`; the write-spec workflow, publish reference, and interactive-surface reference describe the extension's plan-mode exit. | Must |
| FR3 | Keep Finished labels, the Finished summary text, non-Finished picker outcomes, and the post-publication continuation unchanged; a pending continuation takes precedence over a Finished exit in the same turn. | Must |
| FR4 | When the exit cannot be dispatched or leaves plan mode active, preserve the editor draft, submit nothing partial, show the warning notification once, and drop the pending exit. | Must |

## Out of Scope

- Stop/exit behavior of other interactive commands (`/sdlc-draft-issue`, `/sdlc-onboard-project`, `/sdlc-upgrade-project`, `/sdlc-run-retro`)
- Changing Finished option labels, the Continue-loop candidate list, or the `Published specs:` / `Next step:` wording
- Headless print/RPC write-spec behavior
- Suppressing or answering the host's builtin `Exit plan mode?` confirmation

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #444 | 2026-09-26 | Initial defect report |
