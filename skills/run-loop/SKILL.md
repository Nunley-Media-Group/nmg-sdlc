---
name: run-loop
description: "Run the full SDLC pipeline loop from within an active Codex session. Use when user says 'run the SDLC loop', 'run loop', 'run SDLC for #N', 'process issue end-to-end', 'run pipeline', 'how do I run the SDLC loop', or 'kick off automation'. Invokes sdlc-runner.mjs as a subprocess; the runner starts nested `codex exec` sessions for each SDLC step. Orchestrates the unattended pipeline: start issue → write spec → write code → simplify → verify code → open PR → monitor CI → merge."
---

# Run Loop

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

Read `../../references/interactive-gates.md` when the workflow reaches any manual-mode user decision, menu, review gate, or clarification prompt — Codex asks through `request_user_input` in Plan Mode, then finalizes a `<proposed_plan>` before execution.

Run the full SDLC pipeline from within an active Codex session. This skill invokes the deterministic `sdlc-runner.mjs` as a subprocess, enabling the entire development cycle (issue selection, spec writing, implementation, verification, PR creation, CI monitoring, and merge) without leaving the current session.

## When to Use

- Processing a specific issue end-to-end: `$nmg-sdlc:run-loop #42`
- Running the continuous SDLC loop on all open issues: `$nmg-sdlc:run-loop`

## How It Works

The skill shells out to the existing `sdlc-runner.mjs`. The runner then spawns its own `codex exec` subprocesses for each SDLC step.

When launching the runner from inside Codex, clear inherited Codex sandbox markers for the runner process so its own GitHub CLI calls and nested `codex exec` sessions are not constrained by the parent session's execution sandbox. Preserve normal auth and user environment variables.

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

Verify the configured plugin root shape before launching. A valid nmg-sdlc plugin root contains:

```
.codex-plugin/plugin.json
skills/
scripts/sdlc-runner.mjs
```

Verify the runner exists:
```bash
test -f "<runner-path>"
```

If the runner or any required root artifact is missing, treat the selected path as stale. Resolve a current installed nmg-sdlc plugin root using the same priority as `$nmg-sdlc:init-config`:

1. Discover `~/.codex/plugins/**/nmg-sdlc/**/scripts/sdlc-config.example.json`.
2. Prefer candidates whose parent plugin root also contains `skills/run-loop/SKILL.md`.
3. If multiple versioned cache entries match, use the newest version directory.
4. If no installed copy is found, fall back to this source checkout when it contains the same required plugin-root shape.

If a verified replacement root is found, use its `scripts/sdlc-runner.mjs` for this invocation and tell the user:

```
Configured plugin root is stale: <stale-path>
Using verified plugin root for this run: <replacement-root>
Run $nmg-sdlc:upgrade-project to repair sdlc-config.json.
```

Do not rewrite `sdlc-config.json` from `$nmg-sdlc:run-loop`; durable repair belongs to `$nmg-sdlc:upgrade-project`.

If no verified replacement is found, stop with an actionable diagnostic naming the stale path and the required shape:

```
Configured plugin root is stale: <stale-path>
Expected a valid nmg-sdlc plugin root containing .codex-plugin/plugin.json, skills/, and scripts/sdlc-runner.mjs.
Run $nmg-sdlc:upgrade-project after installing the current nmg-sdlc plugin, or update sdlc-config.json to a valid pluginRoot.
```

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

Before running either command from a POSIX shell, unset inherited sandbox markers in that shell scope:

```bash
unset CODEX_SANDBOX CODEX_SANDBOX_NETWORK_DISABLED CODEX_SANDBOX_SEATBELT_PROFILE
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

The runner creates and manages `.codex/unattended-mode` automatically. When this file exists, all SDLC skills skip Plan Mode `request_user_input` gates and run headlessly. The runner removes the file on exit (success or failure).

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
