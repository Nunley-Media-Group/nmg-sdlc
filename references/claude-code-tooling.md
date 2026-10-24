# Claude Code and Herdr Tooling

**Consumed by**: every interactive and automated workflow.

nmg-sdlc runs as a Claude Code plugin. Its hooks module (`hooks/register.ts`) registers the interactive `/sdlc-*` commands, enters native plan mode for them, and materializes `<plugin-root>` in Bash commands and Read paths. Automated commands are plugin command files under `commands/`. Workers are Claude Code sessions in sibling Herdr panes.

| Need | Tool |
|------|------|
| Read a file | `Read` |
| Search contents or find paths | `Grep` / `Glob` when the session lists them; otherwise `rg` or `find` through `Bash` |
| Run a command or a plugin script | `Bash`, naming scripts as `node "<plugin-root>/scripts/<name>.mjs"` |
| Edit or create a file | `Edit` / `Write` (outside plan mode only) |
| Interview | `AskUserQuestion` |
| Persist a plan | the plan-mode plan file (its path is in plan mode's system reminder) |
| Finish a plan | `ExitPlanMode` |
| Load a skill | `Skill` (for example `skill-creator`) |
| Deliver | Herdr CLI (`herdr pane`, `herdr agent`, `herdr notification`, `herdr integration`) |

## Interview rules

`AskUserQuestion` takes 1–4 questions per call, each with 2–4 options and a `header` of at most 12 characters. Put the recommended option first and end its label with ` (Recommended)`. Set `multiSelect: true` for a multi-choice question. Every question automatically offers a typed Other answer; never add an Other, Cancel, or Skip option yourself. Answers return keyed by question text; multi-select answers are comma-separated.

## Plan rules

Interactive commands start in native plan mode. Plan mode is read-only apart from the plan file. Write the complete plan to the plan file, headed `# <slug>: <title>`, then call `ExitPlanMode`; the person approves, edits, or rejects it in the approval dialog. Never ask for approval in prose or with `AskUserQuestion`. A payload that must exist as its own file after approval (for example a steering apply plan) is embedded in the plan file as a fenced block and written under `.nmg-sdlc/plans/` only after approval.

Do not register `/plan` or a plan-mode tool. Workers never call `AskUserQuestion` or `ExitPlanMode`.
