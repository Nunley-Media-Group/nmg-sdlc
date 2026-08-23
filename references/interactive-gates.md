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

Interactive `/sdlc-*` commands enter native `/plan` from the TUI `input` event: `src/extension.ts` rewrites `/sdlc-write-spec #N` (and the other interactive commands) to `/plan` plus the workflow body so Oh My Pi's builtin `handlePlanModeCommand` runs. Already-in-plan sessions receive the workflow only, so `/plan` does not toggle off. `registerCommand` on a session with `hasUI !== true` (print/RPC) fails closed and writes `Run /sdlc-<command> in the TUI.` Automated `/sdlc-status`, `/sdlc-execute`, `/sdlc-verify-code`, and `/sdlc-open-pr` are package `commands/*.md` file commands, not extension handlers. Do not add `commands/sdlc-write-spec.md`. Workflow files never tell the user to type `/plan` or `/skill:`. Interview + `xd://propose` unchanged. After write-spec approval, execution publishes then `ask` Continue/Finished (not plan approval). Automated commands never call `ask`.

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
