# Interactive Surface

**Consumed by**: `draft-issue`, `write-spec`, `onboard-project`, `upgrade-project`, `run-retro`.

## Primary invocations

- `/sdlc-draft-issue [need]`
- `/sdlc-write-spec #N`
- `/sdlc-onboard-project`
- `/sdlc-upgrade-project`
- `/sdlc-execute [#N …]`
- `/sdlc-status`

## Plan-mode entry

Interactive `/sdlc-*` commands enter native `/plan` from the TUI `input` event: `src/extension.ts` rewrites `/sdlc-write-spec #N` (and the other interactive commands) to `/plan` plus the workflow body so Oh My Pi's builtin `handlePlanModeCommand` runs. Already-in-plan sessions receive the workflow only, so `/plan` does not toggle off. `registerCommand` on a session with `hasUI !== true` (print/RPC) fails closed and writes `Run /sdlc-<command> in the TUI.` Automated `/sdlc-status`, `/sdlc-execute`, `/sdlc-verify-code`, and `/sdlc-open-pr` are package `commands/*.md` file commands, not extension handlers. Do not add `commands/sdlc-write-spec.md`. Workflow files never tell the user to type `/plan` or `/skill:`. For write-spec, the `tool_result` handler records each authoritative merged publication; on the next terminal `agent_end` the extension submits `/plan` plus the complete Continue prompt through the focused TUI editor (the prompt alone when already in plan mode), so builtin `/plan` runs and the prompt is the first plan-mode turn. A missing UI, unfocused editor, or non-empty draft keeps the continuation pending and notifies instead of queuing an execution-mode message. That plan-mode turn owns Continue/Finished; every selected continuation issue writes a distinct complete local plan and calls `xd://propose` before mutation. Either write-spec Finished choice ends the turn after its output without another `ask` or `xd://propose`; the `tool_result` handler records that exact `ask` selection. Native plan mode never ends a text-only turn: it appends a decision reminder and continues (`agent_end` with `willContinue: true`). At that decision continuation, or at a terminal `agent_end`, the extension exits native plan mode fully by awaiting builtin `/plan` through the focused TUI editor until the session mode is `none`; the dispatch aborts the forced continuation, so the Finished output stays the last reply. Other non-terminal `agent_end` events (tool calls, retries) wait. The exit is never dispatched from the `ask` result itself, because a `/plan` toggle aborts the in-flight turn before the Finished output is written. A pending continuation takes precedence in the same turn. A missing UI, non-empty draft, unfocused editor, submit failure, or declined `Exit plan mode?` confirmation preserves the draft and warns once with `NMG SDLC: write-spec finished, but plan mode is still active; /plan exits it.` Automated commands never call `ask`.

## Interview

Use built-in `ask` only:

- 2–4 options
- recommended first
- max 3 questions per call

Interview and preference `question` text includes a short paragraph stating the situation and the facts needed to choose among the shown options. The user must be able to select an option from that prompt without relying on earlier chat text. Do not paste the full need statement or issue body. Per-option `description` may still be used but is not the required vehicle for the paragraph.

Required canned gates keep their existing question and option labels and are not required to add a situation paragraph: draft-issue classification, draft-issue milestone, draft-issue split confirmation, draft-issue need-gather when `$ARGUMENTS` is absent, and write-spec continue/finish.

Discoverable facts via `read` / `grep` / `glob`. Never request approval in prose or `ask`. Finish by writing `<slug>` plus title as plain text to `xd://propose`. Plan file is `local://<slug>-plan.md`.

Automated workers never call `ask`. Missing preconditions write a failed handoff and stop.

Do not use Codex prompt-config, nmg-pi input tools, or proposed-plan tags.
