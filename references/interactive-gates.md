# Interactive Surface

**Consumed by**: `draft-issue`, `write-spec`, `onboard-project`, `upgrade-project`, `steering`, `run-retro`.

## Primary invocations

- `/sdlc-draft-issue [need]`
- `/sdlc-write-spec #N`
- `/sdlc-onboard-project`
- `/sdlc-upgrade-project`
- `/sdlc-steering [request]`
- `/sdlc-run-retro`
- `/sdlc-execute [#N …]`
- `/sdlc-status`

## Plan-mode entry

The nmg-sdlc hooks module (`hooks/register.ts`, loaded through `hooks/hooks.json`) registers the interactive `/sdlc-*` commands. Running one renders its workflow with `node <plugin-root>/scripts/sdlc-render-prompt.mjs`, runs builtin `/plan` (which enables native plan mode, or does nothing when plan mode is already on), then submits the workflow as the person's prompt, so the workflow is the first plan-mode turn. With no UI (`claude -p`, the SDK) the command prints `Run /sdlc-<command> in the TUI.` and exits 2. `/sdlc-execute` is also a hooks-module command with the same TUI-only behavior, but it submits its workflow without running `/plan`. Automated `/sdlc-status`, `/sdlc-verify-code`, and `/sdlc-open-pr` are plugin `commands/*.md` command files, not hooks-module handlers. Do not add `commands/sdlc-write-spec.md`. Workflow files never tell the user to type `/plan` or `/skill:`.

For write-spec, the hooks module records each authoritative merged publication from the Bash result of the verbatim `node "<plugin-root>/scripts/publish-approved-spec.mjs" merge --issue N --dir specs/N-slug` call (any prefix, suffix, chaining, pipe, or redirection keeps it from recognizing the publication). Once that turn ends with an empty prompt box, it runs `/plan` and submits the complete Continue prompt, which carries every published number, as the first plan-mode turn. A missing UI or non-empty draft keeps the continuation pending and shows `NMG SDLC: write-spec Continue is pending; it is submitted in plan mode after the next turn ends with an empty prompt.` instead of queuing an execution-mode message. Plan approval may clear context; `published[]` survives because the hooks module holds it. That plan-mode turn owns Continue/Finished; every selected continuation issue writes a distinct complete plan to the plan file and calls `ExitPlanMode` before mutation.

Either write-spec Finished choice (`Finished — stop writing specs` or `Finished — stop without writing a spec`) ends the reply by calling `ExitPlanMode` as its last action, with no other output after it and without another `AskUserQuestion`. The hooks module records that exact `AskUserQuestion` selection and approves that one `ExitPlanMode` call, so plan mode ends with no approval dialog and the Finished output stays the last reply. If the reply ends without that call, the hooks module sends one prompt asking for it, then warns once with `NMG SDLC: write-spec finished, but plan mode is still active; Shift+Tab exits it.` A pending continuation takes precedence in the same turn. Automated commands never call `AskUserQuestion`.

With `NMG_SDLC_AUTOPILOT=1` in the session environment, the hooks module approves every `ExitPlanMode` and answers every `AskUserQuestion` with each question's `(Recommended)` option, else its first option. While a write-spec session is active, autopilot prefers a write-spec Finished option (`Finished — stop writing specs` / `Finished — stop without writing a spec`) over the recommended next issue, so a hands-off run ends after the selected issue. Hands-off drivers use this instead of reading the pane.

## Interview

Use `AskUserQuestion` only:

- 2–4 options per question
- recommended option first, its label ending ` (Recommended)`
- at most 3 questions per call (the tool allows 4; workflows use at most 3)
- a `header` of at most 12 characters
- `multiSelect: true` only where a workflow asks for a multi-choice question
- automatic Other: never add an Other, Cancel, or Skip option yourself

Interview and preference `question` text includes a short paragraph stating the situation and the facts needed to choose among the shown options. The user must be able to select an option from that prompt without relying on earlier chat text. Do not paste the full need statement or issue body. Per-option `description` may still be used but is not the required vehicle for the paragraph.

Required canned gates keep their existing question and option labels and are not required to add a situation paragraph: draft-issue classification, draft-issue milestone, draft-issue split confirmation, draft-issue need-gather when `$ARGUMENTS` is absent, and write-spec continue/finish. A canned option that is the recommended choice still carries the ` (Recommended)` suffix; the write-spec Finished labels never do, and stay byte-identical. Match an answer against its option label with any trailing ` (Recommended)` removed.

Discoverable facts via `Read` / `Grep` / `Glob` (or `rg` / `find` through `Bash`). Never request approval in prose or with `AskUserQuestion`. Finish by writing the complete plan to the plan-mode plan file (its path is in plan mode's system reminder), headed `# <slug>: <title>`, then calling `ExitPlanMode`; the person approves, edits, or rejects it in the approval dialog. A payload that must exist as its own file after approval is a fenced block inside the plan file, written under `.nmg-sdlc/plans/` only after approval.

Automated workers never call `AskUserQuestion`, `EnterPlanMode`, or `ExitPlanMode`. Missing preconditions write a failed handoff and stop.

Do not use Codex prompt-config or proposed-plan tags, and do not register `/plan` or a plan-mode tool.
