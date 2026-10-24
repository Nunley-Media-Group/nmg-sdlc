---
description: "Run automated SDLC delivery"
argument-hint: "[--retain-worker] [#N ...]"
---

Plugin paths: `${CLAUDE_PLUGIN_ROOT}` is the installed nmg-sdlc plugin root. Read packaged files by their `${CLAUDE_PLUGIN_ROOT}/...` path.
- In the inlined `execute` workflow, relative paths such as `references/...`, `templates/...`, `checklists/...`, and `agents/...` resolve under `${CLAUDE_PLUGIN_ROOT}/workflows/execute/`.
- `../../references/...` resolves under `${CLAUDE_PLUGIN_ROOT}/references/`, and a path beginning `workflows/` resolves under `${CLAUDE_PLUGIN_ROOT}/`.
- Paths such as `specs/`, `steering/`, and `.nmg-sdlc/` name files in the current project, not in the plugin.


# Execute

Automated orchestrator. Runs only in the main Herdr pane. Never edits product code, never implements tasks, never opens PRs. Delegates all work to Herdr Claude workers: Claude Code sessions in sibling Herdr panes started with `--kind claude` and `--plugin-dir ${CLAUDE_PLUGIN_ROOT}`, not the `Agent` tool. Short branch-first ordinary resume from current branch and live evidence; full-green verification is the only merge route.

## Preflight

`HERDR_ENV` must be exactly `1`. `HERDR_SOCKET_PATH` and `HERDR_PANE_ID` must be set. If any is missing, print that execute requires a Claude Code session inside Herdr and stop with no mutations.

## Execution

Trim `$ARGUMENTS`. Accept `--retain-worker` at most once. Absent `--retain-worker` means the controller closes its owned worker panes on every terminal stop or cancellation.

Controller paths (`${CLAUDE_PLUGIN_ROOT}/scripts/...`) name the installed nmg-sdlc plugin: the command file materializes them, and the nmg-sdlc hooks module materializes them in `Bash` commands, so invoke controllers exactly as written.

With issue tokens (after trimming), invoke `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-execute.mjs" run` with every trimmed token.

Bare invocation (no issue tokens after trim):
- If current branch is recognized by parseIssueBranch (N-* form), select that issue immediately; resume/verify existing implementation on clean branch (skip implement if already passing).
- On non-issue branch, fall through to selection (picker).
- Explicit different issue on dirty/active feature branch reports conflict without discarding work.
- A live exact-head MERGED PR with issue CLOSED is complete.

On permitted dirty/partial issue branch, implement/publish first as needed.

Always: implement success hands off with next=verify. Verify uses full registered gate (incl. required smoke) at exact source HEAD; review every approved AC and scenario; truthful report; full-green or PR-evidence-pending only advance.

Pass stdout and stderr through unchanged. Exit with the controller exit code.

Do not edit product code, implement tasks, or open PRs in this pane. Never run `herdr server stop`. Workers are only ever started with `--kind claude`.

## Select specified issues

Read only when `/sdlc-execute` receives no issue tokens after removing optional `--retain-worker`.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-execute.mjs" list-specified`.
2. If `ok` is false, print the helper output and stop without invoking `run`.
3. If `issues` is empty, print exactly `No open spec-created issues.` and stop without invoking `run`.
4. Otherwise use one `AskUserQuestion` call with one question that sets `multiSelect: true` (header `Issues`). Do not mark any option ` (Recommended)`. The question text lists every returned issue, one per line as `#N — {title}`, followed by `Which spec-created issues should /sdlc-execute run?`
5. Offer the four lowest-numbered issues as `#N — {title}` issue options (the tool allows at most four), or every issue when fewer than four exist. There is no Cancel chip. Because `AskUserQuestion` needs at least two options, a single returned issue is paired with exactly `Stop — run nothing`; selecting only that option prints nothing further and stops without invoking `run`. Submitting the selection is the confirm action; dismissing the question stops without invoking `run`. Automatic Other accepts `#N`, `N`, or comma- or whitespace-separated lists under the controller's token rules.
6. Union selected issue options with Other tokens (multi-select answers are comma-separated labels): issues in ascending displayed order, then Other tokens in typed order; dedupe first occurrence first. Invalid Other or an empty union reopens the same question. A non-empty union starts immediately with no second confirmation.
7. Invoke `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-execute.mjs" run` once with the selected numbers as separate `#N` tokens in the resolved order, followed by `--retain-worker` when present in `$ARGUMENTS`.
8. If `AskUserQuestion` is unavailable (no UI: `claude -p`, the SDK), print `Run /sdlc-execute in the TUI to choose spec-created issues.` followed by every `list-specified` title, then stop without invoking `run`.

# Select specified issues

Read only when `/sdlc-execute` receives no issue tokens after removing optional `--retain-worker` flag.

On a current branch recognized as an issue branch, selection is not used; the branch issue is selected immediately for ordinary resume.

Otherwise:

1. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-execute.mjs list-specified`.
2. If `ok` is false, print the helper output and stop without invoking `run`.
3. If `issues` is empty, print exactly `No open spec-created issues.` and stop without invoking `run`.
4. Otherwise use one `AskUserQuestion` call with one question that sets `multiSelect: true` (header `Issues`). Do not mark any option ` (Recommended)`. The question text lists every returned issue, one per line as `#N — {title}`, followed by `Which spec-created issues should /sdlc-execute run?`
5. Offer the four lowest-numbered issues as `#N — {title}` issue options (the tool allows at most four), or every issue when fewer than four exist. There is no Cancel chip. Because `AskUserQuestion` needs at least two options, a single returned issue is paired with exactly `Stop — run nothing`; selecting only that option prints nothing further and stops without invoking `run`. Submitting the selection is the confirm action; dismissing the question stops without invoking `run`. Automatic Other accepts `#N`, `N`, or comma- or whitespace-separated lists under the controller's token rules.
6. Union selected issue options with Other tokens (multi-select answers are comma-separated labels): issues in ascending displayed order, then Other tokens in typed order; dedupe first occurrence first. Invalid Other or an empty union reopens the same question. A non-empty union starts immediately with no second confirmation.
7. Invoke `node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-execute.mjs run` once with the selected numbers as separate `#N` tokens in the resolved order, followed by `--retain-worker` when present in `$ARGUMENTS`.
8. If `AskUserQuestion` is unavailable (no UI: `claude -p`, the SDK), print `Run /sdlc-execute in the TUI to choose spec-created issues.` followed by every `list-specified` title, then stop without invoking `run`.
