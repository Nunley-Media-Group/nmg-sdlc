# Tasks: Pasted nmg-sdlc command text is sent to the model instead of running the command

**Issue**: #541
**Date**: 2026-11-09
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/538-replace-herdr-panes-with-hooks-module-subagents-for-sdlc-execute/

## Implementation Tasks

### T001: Run a pasted interactive command through the shared command path

**File(s)**: `hooks/register.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- The `command.run` handler body for each `INTERACTIVE_COMMANDS` entry lives in a module-level `runInteractive($, name, args)` that returns the same results as before, and the `command.run` hook delegates to it
- The `prompt.submit` hook clears `modelOverride` for `composer`/`bridge` prompts that are not `isMeta`, as before
- For such a prompt with no `e.command`, `parseInteractiveSlash(e.text)` (imported from `../src/host-events.mjs`) selects a registered command, `runInteractive` runs it with the parsed `args`, and the hook returns `{ drop }` with the command's answer text or `NMG SDLC: running /<name>.`, never calling `next(e)`
- Every other prompt calls `next(e)` unchanged
- `hooks/register.ts` imports no Node built-ins

### T002: Add regression tests for pasted commands

**File(s)**: `hooks/register.test.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC1: in an interactive session, a `composer` prompt `'/sdlc-draft-issue Fix X\nline two\nline three'` renders with `--consumer sdlc-draft-issue --args 'Fix X\nline two\nline three'`. `world.plans` equals `['/plan']`, `world.prompts` holds only `{ text: '# sdlc-draft-issue workflow', asUser: true }`, and the pasted text never appears in `world.prompts`. The same holds for a `bridge` prompt with leading blank lines
- AC2:
  - A prompt carrying `command: { name: 'sdlc-draft-issue', args: 'x' }` reaches the engine unchanged.
  - Plugin-origin, `isMeta`, `/sdlc-unknown x`, `please run /sdlc-draft-issue later`, and `/sdlc-draft-issuex y` prompts each reach the engine unchanged with no render.
  - A non-matching `composer` prompt still ends an active model override.
- AC3: in a headless session, a `composer` prompt `'/sdlc-draft-issue a parser bug'` resolves to `{ drop: 'Run /sdlc-draft-issue in the TUI.' }` with no render, no `/plan`, and no prompt reaching the engine
- `claude plugin test .` exits 0 with these tests passing, and `cd scripts && npm test` exits 0

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #541 | 2026-11-09 | Initial defect tasks |
