# Tasks: Exit native plan mode when write-spec Finished is selected

**Issue**: #444
**Date**: 2026-09-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/438-return-write-spec-to-native-plan-mode-after-merged-publication/

---

## Implementation Tasks

### T001: Detect write-spec Finished picker selections

**File(s)**: `src/sdlc-commands.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `WRITE_SPEC_FINISHED_LABELS` is exactly `Finished — stop writing specs` and `Finished — stop without writing a spec`
- `writeSpecFinishedSelection(event)` returns `null` for events that are not `ask` `tool_result`s, `true` when a single- or multi-question `ask` result selected one of those exact labels, and `false` for errored results, other labels, and automatic Other custom input (FR1, FR3)

### T002: Fully exit native plan mode after a terminal Finished turn

**File(s)**: `src/extension.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- After a Finished selection in a write-spec session, the next terminal `agent_end` awaits the focused editor's `onSubmit("/plan")` once per toggle until the session mode is `none` (two toggles from `plan`, one from `plan_paused`) and dispatches nothing else (AC1, AC2, FR1)
- Issue rows, `Continue — enter another issue number`, automatic Other input, a later non-Finished `ask` in the same turn, and `ask` results outside a write-spec session dispatch no exit (AC3)
- Missing UI, non-empty draft, unfocused editor, submit failure, or a mode that stops progressing leaves the draft intact and shows `NMG SDLC: write-spec finished, but plan mode is still active; /plan exits it.` once; the pending exit is dropped; `willContinue: true` dispatches nothing and keeps it pending (AC4, FR4)
- A pending continuation is submitted exactly as before and wins over a Finished exit in the same turn; a new `/sdlc-write-spec` invocation clears published[], pending continuation, and pending exit (AC5, FR3)

### T003: Align write-spec contracts with the Finished exit

**File(s)**: `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md`, `references/interactive-gates.md`, `README.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- `skill://skill-creator` is read before editing workflow-bundled files
- Initial-picker step 7 and the Continue-loop Finished branch keep their labels and output and then end the turn without another `ask` or `xd://propose`, stating that the extension exits native plan mode fully after the turn ends (AC1, AC2, FR2)
- `publish.md`, `references/interactive-gates.md`, and README describe the terminal-turn `/plan` exit and the warning fallback (FR2)

### T004: Add regression coverage for the Finished exit

**File(s)**: `scripts/__tests__/extension-commands.test.mjs`, `scripts/__tests__/sdlc-commands.test.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- The extension fixture's host editor gains an async `onSubmit` that applies bare `/plan` as the host does (`plan` → `plan_paused`, or unchanged when the exit confirmation is declined; `plan_paused` → `none`) and records every dispatched command
- SCN001–SCN005 are exercised: Continue-loop and initial-picker Finished end at mode `none` with exactly two `/plan` commands and no notice; each non-Finished selection dispatches nothing; each undispatchable case and a declined confirmation preserves the draft and notifies once with no retry; the existing continuation assertions still hold
- `writeSpecFinishedSelection` cases cover single and multi-question results, both labels, other labels, custom input, errored results, and non-`ask` events
- The Finished-exit assertions fail without T002 and pass with it; `npm test -- --runInBand` in `scripts/` exits 0

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #444 | 2026-09-26 | Initial defect tasks |
