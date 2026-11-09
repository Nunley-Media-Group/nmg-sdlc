# Root Cause Analysis: Pasted nmg-sdlc command text is sent to the model instead of running the command

**Issue**: #541
**Date**: 2026-11-09
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/538-replace-herdr-panes-with-hooks-module-subagents-for-sdlc-execute/

## Root Cause

`hooks/register.ts` registers each `INTERACTIVE_COMMANDS` entry at `session.start` and handles it only in `on('command.run', { command: name }, …)`. The engine raises `command.run` only for a slash command it parsed from the composer line. A paste is expanded into `prompt.submit`'s `text` with no `command` field, so no nmg-sdlc handler runs. The module's `prompt.submit` hook only clears `modelOverride` for person-originated prompts and then calls `next(e)`, which sends the text to the model unchanged.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `hooks/register.ts` | `on('command.run', { command: name }, …)` loop body | Holds the only path into the headless refusal, execute model gate, render, plan mode and model override |
| `hooks/register.ts` | `on('prompt.submit', …)` hook | Passes pasted command text to the model |
| `src/host-events.mjs` | `parseInteractiveSlash` | Existing parser for a leading registered interactive command and its arguments (reused, unchanged) |

## Fix Strategy

1. Move the body of the `command.run` handler into a module-level `async function runInteractive($: Engine, name: string, args: string)`. It returns the same `CommandRunResult` values the handler returns today: the `--result` read, the headless refusal with `exitCode: 2`, the execute model refusal with `exitCode: 1`, the render-failure text, or `{}` after scheduling plan mode or the direct submit. The `command.run` hook becomes `($, e) => runInteractive($, name, e.args)`.
2. Make the `prompt.submit` hook async:
   - `person` = origin `composer` or `bridge`, and `isMeta !== true`.
   - When `person`, clear `modelOverride`, as today.
   - When `person` and `e.command === undefined`, run `parseInteractiveSlash(e.text)`.
   - On `null`, `return next(e)`, as today.
   - On a match, `await runInteractive($, match.command, match.args)` and return ``{ drop: result.text ?? `NMG SDLC: running /${match.command}.` }``.

   The person sees the command's own answer text (for example `Run /sdlc-draft-issue in the TUI.`), or the running notice when the command answered with nothing. The plain text never reaches the model.
3. `runInteractive` already starts `/plan` and the workflow prompt from `$.clock.after` timers, so a call from inside `prompt.submit` defers those the same way a call from `command.run` does. The workflow prompt it submits has origin `plugin`, so the hook passes it through.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `hooks/register.ts` | Extract `runInteractive`; the `command.run` hook delegates to it | FR2: one shared gate path for typed and pasted commands |
| `hooks/register.ts` | Import `parseInteractiveSlash` from `../src/host-events.mjs`; detect and drop a pasted command in the `prompt.submit` hook | FR1, FR2, FR3; AC1, AC3 |
| `hooks/register.test.ts` | Add tests for AC1-AC3 | FR4 |

## Blast Radius

- The `command.run` hook keeps the same results and side effects; only its code location changes.
- The `prompt.submit` hook now awaits for matching prompts only. Non-matching, typed, plugin-origin, `isMeta`, `sdk`, and `task-notification` prompts follow the unchanged `next(e)` path.
- `parseInteractiveSlash` is reused as-is. Its existing callers (`scripts/exercise-claude.mjs`, `scripts/__tests__/sdlc-commands.test.mjs`) are unaffected.
- The write-spec Continue/Finished and execute state are reset by `startInteractiveCommand` exactly as for a typed command.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Call `runInteractive` directly from the `prompt.submit` hook | Selected | Same code path as the typed command; the refusal text is returned synchronously as the drop reason |
| Schedule `$.command.run({ command, args })` from a timer | Rejected | `$.command.run` runs every hook but the caller's, and the module's own `command.run` hook would have to be reached through the engine queue. That adds a second deferral and makes the refusal text unobservable to the hook |
| Rewrite `e.text` with `next({ ...e, text })` | Rejected | The text would still reach the model and no gate would run |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #541 | 2026-11-09 | Initial defect design |
