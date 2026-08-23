---
name: execute
description: "Orchestrate automated delivery for approved, spec-created issues through Herdr OMP worker sessions. Use when the user says execute, ship specified issues, /sdlc-execute, or passes comma- or whitespace-separated issue numbers to deliver. With no numbers, present open spec-created issues for selection. Do NOT use to draft issues or write specs."
---

# Execute

Automated orchestrator. Runs only in the main Herdr pane. Never edits product code, never implements tasks, never opens PRs. Delegates all work to sibling Herdr `--kind omp` workers.

## Preflight

`HERDR_ENV` must be exactly `1`. `HERDR_SOCKET_PATH` and `HERDR_PANE_ID` must be set. If any is missing, print that execute requires a Herdr OMP session and stop with no mutations.

## Execution

Trim `$ARGUMENTS`. Non-empty: invoke `node scripts/sdlc-execute.mjs run` with the trimmed tokens. Empty: follow the packaged `# Select specified issues` section, then invoke `run` only with the selected tokens.

Pass stdout and stderr through unchanged. Exit with the controller exit code.

Do not edit product code, implement tasks, or open PRs in this pane. Never run `herdr server stop`. Never pass `--kind pi`.
