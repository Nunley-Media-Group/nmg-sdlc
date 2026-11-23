# Tasks: Save full smoke session transcripts and fail surfaces whose transcript lacks the sent command

**Issue**: #605
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code

## Implementation Tasks

### T001: Capture the whole surface session

**File(s)**: `steering/snippets/project-smoke.md`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1: steps 4–6 empty the surface's `.log` before its command is sent, type the command without `Enter`, append a capture, then send `Enter`.
- FR1: steps 4–6 append `tmux capture-pane -p -J -S - -t <session> >> .nmg-sdlc/smoke/surfaces/<surface>.log` at every poll and once when the command finishes.
- The overwriting `tmux capture-pane -p -S - -t <session> > .nmg-sdlc/smoke/surfaces/<surface>.log` instruction is removed.
- Step 6 states that a transcript that does not contain the record's `command` fails the gate.
- The snippet still contains `tmux new-session`, `tmux capture-pane`, `/sdlc-draft-issue`, `/sdlc-write-spec` and its `## <n>. <heading>` sections.

### T002: Fail a transcript that lacks the sent command

**File(s)**: `steering/extensions/nmg-sdlc-smoke.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR2: `readSurfaceRecord` reads the transcript through its injected `readFile` after the existing transcript checks, and returns `{ reason: "transcript lacks the sent command" }` when the transcript, with all whitespace removed, does not contain `record.command` with all whitespace removed.
- FR2: a transcript read failure returns `{ reason: "transcript missing" }`.
- FR3: every earlier record and transcript check, and its reason text, is unchanged.

### T003: Implement the Regression Scenarios

**File(s)**: `scripts/__tests__/nmg-sdlc-smoke.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- In the `@SCN011` (#584 AC10) describe, `surfaceProject` writes each transcript as `pane transcript for <surface>` followed by a line holding the record's final `command` (after overrides), so the existing passing tests still exercise passing records.
- A describe titled with `#605 @SCN001` reads `steering/snippets/project-smoke.md` and asserts it contains `: > .nmg-sdlc/smoke/surfaces/<surface>.log`, `tmux capture-pane -p -J -S - -t <session> >> .nmg-sdlc/smoke/surfaces/<surface>.log`, an instruction to append a capture after typing the command and before sending `Enter`, and does not contain `tmux capture-pane -p -S - -t <session> > .nmg-sdlc/smoke/surfaces/<surface>.log`.
- A describe titled with `#605 @SCN002`, inside the `@SCN011` describe so it reuses `scoped` and `surfaceProject`: a `steering` record whose transcript is `pane transcript for steering` with no command fails with summary `nmg-sdlc-smoke surface not exercised: steering` and evidence `steering: transcript lacks the sent command`.
- A describe titled with `#605 @SCN003`, inside the same describe: a `draft-issue` record with command `/sdlc-draft-issue add a thing` whose transcript holds `> /sdlc-draft-issue add a\n  thing` (wrapped) passes, and its evidence names the transcript.
- `@SCN002` fails without T002.
- `cd scripts && npm test -- __tests__/nmg-sdlc-smoke.test.mjs __tests__/steering-contract.test.mjs` passes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #605 | 2026-11-23 | Initial defect tasks |
