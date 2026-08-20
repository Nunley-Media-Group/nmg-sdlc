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

If write/edit tools are available (working tree writable / native plan mode off), do not interview and do not mutate. Print exactly `Run /plan /skill:<name>` plus original args and stop. OMP runs `/skill:` tokens inside `/plan` inline prompts.

## Interview

Use built-in `ask` only:

- 2–4 options
- recommended first
- max 3 questions per call

Discoverable facts via `read` / `grep` / `glob`. Never request approval in prose or `ask`. Finish by writing `<slug>` plus title as plain text to `xd://propose`. Plan file is `local://<slug>-plan.md`.

Automated workers never call `ask`. Missing preconditions write a failed handoff and stop.

Do not use Codex prompt-config, nmg-pi input tools, or proposed-plan tags.
