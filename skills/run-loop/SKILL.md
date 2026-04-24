---
name: run-loop
description: "Run the full SDLC pipeline loop from within an active Codex session. Use when user says 'run the SDLC loop', 'run loop', 'run SDLC for #N', 'process issue end-to-end', 'run pipeline', 'how do I run the SDLC loop', or 'kick off automation'. Invokes sdlc-runner.mjs as a subprocess; the runner starts nested `codex exec` sessions for each SDLC step. Orchestrates the full pipeline: $nmg-sdlc:draft-issue → $nmg-sdlc:start-issue → $nmg-sdlc:write-spec → $nmg-sdlc:write-code → $simplify → $nmg-sdlc:verify-code → $nmg-sdlc:commit-push → $nmg-sdlc:open-pr → $nmg-sdlc:address-pr-comments."
---

# Run Loop

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

Read `../../references/interactive-gates.md` when the workflow reaches any manual-mode user decision, menu, review gate, or clarification prompt — Codex renders these as conversational numbered prompts and waits for the next user reply.

Run the full SDLC pipeline from within an active Codex session. This skill invokes the deterministic `sdlc-runner.mjs` as a subprocess, enabling the entire development cycle (issue selection, spec writing, implementation, verification, PR creation, CI monitoring, and merge) without leaving the current session.

## When to Use

- Processing a specific issue end-to-end: `$nmg-sdlc:run-loop #42`
- Running the continuous SDLC loop on all open issues: `$nmg-sdlc:run-loop`

## How It Works

The skill shells out to the existing `sdlc-runner.mjs`. The runner then spawns its own `codex exec` subprocesses for each SDLC step.

## Step 1: Parse Arguments

Parse `$ARGUMENTS` to determine the mode:

- **No argument** → continuous loop mode (process all open issues)
- **`#N` or `N`** (where N is a number) → single-issue mode (process only issue #N, then exit)

Extract the issue number if provided. Strip any leading `#`.

## Step 2: Locate or Generate Config

Check for `sdlc-config.json` at the project root:

```bash
test -f "$(git rev-parse --show-toplevel)/sdlc-config.json"
```

- **If found** → proceed to Step 3.
- **If not found** → invoke the config generator:
  ask Codex to use `$nmg-sdlc:init-config` (or let the SDLC runner inject the `init-config` skill instructions), then verify the config was created before proceeding.

## Step 3: Read Config and Locate Runner

Read the config file and extract `pluginRoot` and `pluginsPath` using file inspection on `sdlc-config.json`.

Derive the runner script path:
```
<pluginRoot>/scripts/sdlc-runner.mjs
```

If `pluginRoot` is not set, fall back to:
```
<pluginsPath>/plugins/nmg-sdlc/scripts/sdlc-runner.mjs
```

Verify the runner exists:
```bash
test -f "<runner-path>"
```

If the runner is not found, report the error and stop.

## Step 4: Execute the Runner

Build the command.

**Single-issue mode** (argument provided):
```bash
node <runner-path> --config <config-path> --issue <N>
```

**Continuous loop mode** (no argument):
```bash
node <runner-path> --config <config-path>
```

Run the command and stream its output. The runner handles all orchestration:
- Unattended-mode flag management (`.codex/unattended-mode`)
- Step sequencing and precondition validation
- Retry logic and escalation
- Clean exit after completion

## Step 5: Report Results

After the runner exits, report:

- **Exit code 0** → success. State what was accomplished (issue processed, PR merged, etc.)
- **Exit code 1** → failure. Report the exit code and suggest checking the runner log for details. The log path follows the pattern: `<os.tmpdir()>/sdlc-logs/<project-name>/sdlc-runner.log`

## Unattended-Mode

The runner creates and manages `.codex/unattended-mode` automatically. When this file exists, all SDLC skills skip conversational prompts and run headlessly. The runner removes the file on exit (success or failure).

Do **not** create or remove `.codex/unattended-mode` manually — the runner handles the full lifecycle.

## Integration with SDLC Workflow

This skill runs the SDLC pipeline from within Codex:

```
$nmg-sdlc:run-loop #42     →  Processes issue #42 through the full pipeline
$nmg-sdlc:run-loop          →  Processes all open issues in a continuous loop
```

The underlying runner (`sdlc-runner.mjs`) can also be invoked directly:

```bash
node scripts/sdlc-runner.mjs --config sdlc-config.json
```
