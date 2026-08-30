---
name: sdlc-execute
description: "Run automated SDLC delivery"
---


# Execute

Automated orchestrator. Runs only in the main Herdr pane. Never edits product code, never implements tasks, never opens PRs. Delegates all work to sibling Herdr `--kind omp` workers.

## Preflight

`HERDR_ENV` must be exactly `1`. `HERDR_SOCKET_PATH` and `HERDR_PANE_ID` must be set. If any is missing, print that execute requires a Herdr OMP session and stop with no mutations.

## Execution

Trim `$ARGUMENTS`. Accept `--retain-worker` and `--recover-stale` at most once each among issue tokens; absent `--retain-worker` means the controller closes its owned worker panes on every terminal stop or cancellation. `--recover-stale` is an explicit, post-preflight recovery: it can reclaim only the current checkpoint run's lease when the recorded PID is demonstrably absent and a successful Herdr agent listing proves the exact recorded controller pane is absent. A live or unknown PID, live or unknown pane, failed/unknown Herdr listing, or foreign run keeps the lease and fails with `controller_lease_held`. Decide whether issue tokens remain after removing those flags. With issue tokens, invoke `node <plugin-root>/scripts/sdlc-execute.mjs run` with every trimmed token. With no issue tokens, follow the packaged `# Select specified issues` section, then invoke `run` with the selected tokens plus the retained and recovery flags when present.

Pass stdout and stderr through unchanged. Exit with the controller exit code.

Do not edit product code, implement tasks, or open PRs in this pane. Never run `herdr server stop`. Never pass `--kind pi`.

# Select specified issues

Read only when `/sdlc-execute` receives no issue tokens after removing optional `--retain-worker` and `--recover-stale`.

1. Run `node <plugin-root>/scripts/sdlc-execute.mjs list-specified`.
2. If `ok` is false, print the helper output and stop without invoking `run`.
3. If `issues` is empty, print exactly `No open spec-created issues.` and stop without invoking `run`.
4. Otherwise use one built-in `ask` with `multi: true`. Do not set `recommended`. The question lists every returned issue, one per line as `#N — {title}`, followed by `Which spec-created issues should /sdlc-execute run?`
5. Offer the four lowest-numbered issues as `#N — {title}` issue chips, or every issue when fewer than four exist. There is no Cancel chip. Continue is the built-in confirm action. Automatic Other accepts `#N`, `N`, or comma- or whitespace-separated lists under the controller's token rules.
6. Union selected chips with Other tokens: chips in ascending displayed order, then Other tokens in typed order; dedupe first occurrence first. Invalid Other or an empty union reopens the same question. A non-empty union starts immediately with no second confirmation.
7. Invoke `node <plugin-root>/scripts/sdlc-execute.mjs run` once with the selected numbers as separate `#N` tokens in the resolved order, followed by `--retain-worker` and `--recover-stale` when those flags were present in `$ARGUMENTS`.
8. If the built-in question UI is unavailable, print `Run /sdlc-execute in the TUI to choose spec-created issues.` followed by every `list-specified` title, then stop without invoking `run`.
