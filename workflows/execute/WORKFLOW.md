---
name: execute
description: "Orchestrate automated delivery for approved specs through Herdr OMP worker sessions. Use when the user says execute, run the backlog, ship the next issue, /sdlc-execute, or passes issue numbers to deliver. Defaults to the first ready backlog issue. Accepts a space-separated list of issue numbers. Do NOT use to draft issues or write specs."
---

# Execute

Automated orchestrator. Runs only in the main Herdr pane. Never edits product code, never implements tasks, never opens PRs. Delegates all work to sibling Herdr `--kind omp` workers.

## Preflight

`HERDR_ENV` must be exactly `1`. `HERDR_SOCKET_PATH` and `HERDR_PANE_ID` must be set. If any is missing, print that execute requires a Herdr OMP session and stop with no mutations.

## Execution

Trim `$ARGUMENTS`. Invoke:

node scripts/sdlc-execute.mjs run <trimmed arguments>

When arguments are empty, invoke `node scripts/sdlc-execute.mjs run` with no extra tokens.

Pass stdout and stderr through unchanged. Exit with the controller exit code.

Do not edit product code, implement tasks, or open PRs in this pane. Never run `herdr server stop`. Never pass `--kind pi`.
