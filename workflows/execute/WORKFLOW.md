---
name: execute
description: "Orchestrate automated delivery for approved, spec-created issues through Herdr OMP worker sessions. Use when the user says execute, ship specified issues, /sdlc-execute, or passes comma- or whitespace-separated issue numbers to deliver. With no numbers, present open spec-created issues for selection. Do NOT use to draft issues or write specs."
---

# Execute

Automated orchestrator. Runs only in the main Herdr pane. Never edits product code, never implements tasks, never opens PRs. Delegates all work to sibling Herdr `--kind omp` workers.

## Preflight

`HERDR_ENV` must be exactly `1`. `HERDR_SOCKET_PATH` and `HERDR_PANE_ID` must be set. If any is missing, print that execute requires a Herdr OMP session and stop with no mutations.

## Execution

Trim `$ARGUMENTS`. Accept `--retain-worker` and `--recover-stale` at most once each among issue tokens; absent `--retain-worker` means the controller closes its owned worker panes on every terminal stop or cancellation. `--recover-stale` is an explicit, post-preflight recovery: it can reclaim only the current checkpoint run's lease when the recorded PID is demonstrably absent and a successful Herdr agent listing proves the exact recorded controller pane is absent. A live or unknown PID, live or unknown pane, failed/unknown Herdr listing, or foreign run keeps the lease and fails with `controller_lease_held`. Decide whether issue tokens remain after removing those flags. With issue tokens, invoke `node <plugin-root>/scripts/sdlc-execute.mjs run` with every trimmed token. With no issue tokens, follow the packaged `# Select specified issues` section, then invoke `run` with the selected tokens plus the retained and recovery flags when present.

Pass stdout and stderr through unchanged. Exit with the controller exit code.

Do not edit product code, implement tasks, or open PRs in this pane. Never run `herdr server stop`. Never pass `--kind pi`.
