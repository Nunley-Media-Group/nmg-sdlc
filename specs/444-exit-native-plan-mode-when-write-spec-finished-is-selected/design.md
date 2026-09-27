# Root Cause Analysis: Exit native plan mode when write-spec Finished is selected

**Issue**: #444
**Date**: 2026-09-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/438-return-write-spec-to-native-plan-mode-after-merged-publication/

---

## Root Cause

`src/extension.ts` enters native plan mode for `/sdlc-write-spec` through `rewriteInteractiveInput` and, after a merged publication, resubmits the materialized workflow into plan mode on the next terminal `agent_end`. Both Finished pickers therefore run in an active plan-mode session. `workflows/write-spec/WORKFLOW.md` handles each Finished choice by printing and stopping, and nothing in the workflow or extension ends plan mode. Native plan mode only lets a turn end through `ask` or `xd://propose`, so the agent keeps re-prompting.

The extension already observes every `tool_result` (including `ask` results with `details.selectedOptions` / `details.results[].selectedOptions`) and already submits text through the focused TUI editor on a terminal `agent_end`, but it has no Finished-driven path. The host's bare `/plan` only moves an enabled plan to `plan_paused`; a second bare `/plan` from `plan_paused` appends `none`. The editor's `submit()` fires its async `onSubmit` handler without awaiting it, so two back-to-back `submit()` calls race and can leave the session paused.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `src/sdlc-commands.mjs` | new `WRITE_SPEC_FINISHED_LABELS`, `writeSpecFinishedSelection` | Classifies `ask` tool results as Finished / not Finished |
| `src/extension.ts` | `WriteSpecContinuation` state, `input` / `tool_result` / `agent_end` handlers, registered command handler | Tracks the write-spec session and dispatches the plan-mode exit |
| `workflows/write-spec/WORKFLOW.md` | Initial issue selection step 7; Continue loop Finished | Finished must end the turn without `ask` / `xd://propose` |
| `workflows/write-spec/references/publish.md` | Native-plan continuation, Finished | Describes the exit |
| `references/interactive-gates.md` | Plan-mode entry | Describes the exit and its fallback |

## Fix Strategy

Record a Finished selection per write-spec session and, on the next terminal `agent_end`, run builtin `/plan` through the focused editor's `onSubmit` handler, awaiting each call and re-reading the session mode, until the mode is `none`. Every undispatchable or non-progressing case warns once and dispatches nothing more.

1. `src/sdlc-commands.mjs`
   - `export const WRITE_SPEC_FINISHED_LABELS = Object.freeze(["Finished — stop writing specs", "Finished — stop without writing a spec"]);` (U+2014 em dash, identical to the workflow labels).
   - `export function writeSpecFinishedSelection(event)`: return `null` unless `event?.type === "tool_result"` and `event.toolName === "ask"`; return `false` when `event.isError === true`; otherwise collect `event.details.selectedOptions` (when an array) and each `event.details.results[i].selectedOptions` (when `results` is an array) and return `true` iff any collected entry is a string strictly equal to a `WRITE_SPEC_FINISHED_LABELS` member, else `false`. Automatic Other (`customInput`) is never Finished.
2. `src/extension.ts`
   - `HostEditor` gains `onSubmit?: (text: string) => void | Promise<void>`.
   - State becomes `{ published, pending, active: boolean, exitPending: boolean }`, initialized `active: false, exitPending: false`.
   - `input` handler and the registered-command handler: when a rewrite happens for `sdlc-write-spec`, assign `{ published: [], pending: false, active: true, exitPending: false }`; for any other interactive command, assign `{ active: false, exitPending: false }` (published/pending untouched).
   - `tool_result`: first evaluate `writeSpecFinishedSelection(event)`; when non-null, set `writeSpec.exitPending = finished` only if `writeSpec.active`, then return (an `ask` result is never a merge result). The last `ask` result in a turn wins. Otherwise run the existing merge-recording logic unchanged.
   - Extract `focusedEditor(session): HostEditor | undefined` from the current continuation gate: returns `undefined` unless `session.hasUI === true`, `ui.getEditorText`, `ui.setEditorComponent`, and `pi.pi?.CustomEditor` exist, the draft is `""`, `setEditorComponent` resolves a focused `CustomEditor` instance without throwing, and `disableSubmit !== true`. The continuation path uses it (plus its existing `ui.setEditorText` check) with identical behavior, and sets `writeSpec.active = true` after a successful submission.
   - `agent_end`: return on `willContinue === true` (pending state untouched). If `writeSpec.pending`, set `exitPending = false` and run the continuation path. Else if `writeSpec.exitPending`, set `exitPending = false` (one-shot) and run the exit:
     - `mode = sessionModeFromEntries(entries)`; if `mode` is neither `plan` nor `plan_paused`, set `active = false` and return silently.
     - `editor = focusedEditor(session)`; if absent or `typeof editor.onSubmit !== "function"`, notify the warning and return.
     - Start a detached async sequence (the handler returns synchronously): up to two iterations — read `before` mode; stop if not `plan`/`plan_paused`; `await editor.onSubmit("/plan")`; stop if the mode is unchanged. Catch any throw/rejection. Afterwards, if the mode is `none` set `active = false`; otherwise notify the warning.
   - Warning literal: `const FINISHED_EXIT_NOTICE = "NMG SDLC: write-spec finished, but plan mode is still active; /plan exits it.";` shown with `ui.notify(FINISHED_EXIT_NOTICE, "warning")`.
   - The exit never calls `setEditorText`, `sendUserMessage`, git, or GitHub.
3. Contracts: WORKFLOW.md step 7 and the Continue-loop Finished paragraph end with “End the turn there without another `ask` or `xd://propose`; after the turn ends, the extension exits native plan mode fully.” `publish.md` and `references/interactive-gates.md` describe the terminal-`agent_end` `/plan` exit and the warning fallback; README's write-spec paragraph states that Finished leaves plan mode.

## Blast Radius

- `agent_end` now has two paths; the continuation path keeps its gates, pending-retry semantics, and notice, and wins over a Finished exit in the same turn.
- Other interactive commands clear `active`, so their `ask` results never arm an exit.
- The host's builtin `Exit plan mode?` confirmation (shown when a session-local plan draft exists) is awaited inside the first `/plan`; confirming continues to `none`, declining leaves mode `plan` and triggers the warning.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Await the focused editor's `onSubmit("/plan")` per toggle and re-read the session mode | Selected | Serializes toggles through the same handler `submit()` uses; deterministic end state |
| `setEditorText("/plan")` + `submit()` twice | Rejected | `submit()` does not await `onSubmit`; the second toggle races the first |
| A single `/plan` | Rejected | Leaves the session `plan_paused` |
| Poll session entries with timers between submissions | Rejected | The host confirmation has unbounded duration |
| Workflow-only change | Rejected | The agent cannot leave plan mode itself |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #444 | 2026-09-26 | Initial defect design |
