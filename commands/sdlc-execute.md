---
name: sdlc-execute
description: "Run automated SDLC delivery"
---


# Execute

Automated orchestrator. Runs only in the main Herdr pane. Never edits product code, never implements tasks, never opens PRs. Delegates all work to sibling Herdr `--kind omp` workers.

## Preflight

`HERDR_ENV` must be exactly `1`. `HERDR_SOCKET_PATH` and `HERDR_PANE_ID` must be set. If any is missing, print that execute requires a Herdr OMP session and stop with no mutations.

## Execution

Trim `$ARGUMENTS`. Accept `--retain-worker` at most once among issue tokens; absent means the controller closes its owned worker panes on every terminal stop or cancellation. Decide whether issue tokens remain after removing that flag. With issue tokens, invoke `node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/sdlc-execute.mjs" run` with every trimmed token. With no issue tokens, follow the packaged `# Select specified issues` section, then invoke `run` with the selected tokens plus the retained flag when present.

Pass stdout and stderr through unchanged. Exit with the controller exit code.

Do not edit product code, implement tasks, or open PRs in this pane. Never run `herdr server stop`. Never pass `--kind pi`.

# Select specified issues

Read only when `/sdlc-execute` receives no issue tokens after removing an optional `--retain-worker`.

1. Run `node <plugin-root>/scripts/sdlc-execute.mjs list-specified`.
2. If `ok` is false, print the helper output and stop without invoking `run`.
3. If `issues` is empty, print exactly `No open spec-created issues.` and stop without invoking `run`.
4. Otherwise use one built-in `ask` with `multi: true`. Do not set `recommended`. The question lists every returned issue, one per line as `#N — {title}`, followed by `Which spec-created issues should /sdlc-execute run?`
5. Offer the four lowest-numbered issues as `#N — {title}` issue chips, or every issue when fewer than four exist. There is no Cancel chip. Continue is the built-in confirm action. Automatic Other accepts `#N`, `N`, or comma- or whitespace-separated lists under the controller's token rules.
6. Union selected chips with Other tokens: chips in ascending displayed order, then Other tokens in typed order; dedupe first occurrence first. Invalid Other or an empty union reopens the same question. A non-empty union starts immediately with no second confirmation.
7. Invoke `node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/sdlc-execute.mjs" run` once with the selected numbers as separate `#N` tokens in the resolved order, followed by `--retain-worker` when it was present in `$ARGUMENTS`.
8. If the built-in question UI is unavailable, print `Run /sdlc-execute in the TUI to choose spec-created issues.` followed by every `list-specified` title, then stop without invoking `run`.
