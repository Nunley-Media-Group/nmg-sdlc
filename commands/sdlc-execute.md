---
name: sdlc-execute
description: "Run automated SDLC delivery"
---

# Execute

Automated orchestrator. Runs only in the main Herdr pane. Never edits product code, never implements tasks, never opens PRs. Delegates all work to sibling Herdr `--kind omp` workers. Short branch-first ordinary resume from current branch and live evidence; full-green verification is the only merge route. Four stages: start (when necessary), implement, verify, deliver. Implement hands off next to verify.

## Preflight

`HERDR_ENV` must be exactly `1`. `HERDR_SOCKET_PATH` and `HERDR_PANE_ID` must be set. If any is missing, print that execute requires a Herdr OMP session and stop with no mutations.

## Execution

Trim `$ARGUMENTS`. Accept `--retain-worker` at most once. Absent `--retain-worker` means the controller closes its owned worker panes on every terminal stop or cancellation.

Resolve `<plugin-root>` from the active installed extension before invoking.

With issue tokens, invoke `node <plugin-root>/scripts/sdlc-execute.mjs run` with every trimmed token.

Bare invocation (no issue tokens):
- If current branch recognized by parseIssueBranch (N-*), select that issue immediately for resume.
- A clean issue branch starts verification of existing implementation (skip implement if passes).
- On non-issue branch, use picker.
- Explicit #N on other branch may start via start-issue worker.
- Live exact-head MERGED + CLOSED is complete.

Pass stdout and stderr through unchanged. Exit with the controller exit code.

Do not edit product code, implement tasks, or open PRs in this pane. Never run `herdr server stop`. Never pass `--kind pi`.

# Select specified issues

Read only when `/sdlc-execute` receives no issue tokens after removing optional `--retain-worker`.

1. Run `node <plugin-root>/scripts/sdlc-execute.mjs list-specified`.
2. If `ok` is false, print the helper output and stop without invoking `run`.
3. If `issues` is empty, print exactly `No open spec-created issues.` and stop without invoking `run`.
4. Otherwise use one built-in `ask` with `multi: true`. Do not set `recommended`. The question lists every returned issue, one per line as `#N — {title}`, followed by `Which spec-created issues should /sdlc-execute run?`
5. Offer the four lowest-numbered issues as `#N — {title}` issue chips, or every issue when fewer than four exist. There is no Cancel chip. Continue is the built-in confirm action. Automatic Other accepts `#N`, `N`, or comma- or whitespace-separated lists under the controller's token rules.
6. Union selected chips with Other tokens: chips in ascending displayed order, then Other tokens in typed order; dedupe first occurrence first. Invalid Other or an empty union reopens the same question. A non-empty union starts immediately with no second confirmation.
7. Invoke `node <plugin-root>/scripts/sdlc-execute.mjs run` once with the selected numbers as separate `#N` tokens in the resolved order, followed by `--retain-worker` when present in `$ARGUMENTS`.
8. If the built-in question UI is unavailable, print `Run /sdlc-execute in the TUI to choose spec-created issues.` followed by every `list-specified` title, then stop without invoking `run`.
