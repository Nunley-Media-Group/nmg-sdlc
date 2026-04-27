---
name: init-config
description: "Generate an SDLC runner config for the current project. Use when user says 'generate config', 'set up SDLC runner', 'configure runner', 'init config', 'how do I set up the runner', or asks about sdlc-config.json. Creates a ready-to-use sdlc-config.json from the template with project-specific paths. Prerequisite for $nmg-sdlc:run-loop."
---

# Init Config

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

Read `../../references/interactive-gates.md` when the workflow reaches any manual-mode user decision, menu, review gate, or clarification prompt — Codex asks through `request_user_input` in Plan Mode, then finalizes a `<proposed_plan>` before execution.

Read `../../references/contribution-gate.md` when runner config setup reaches managed project artifact creation — the shared contract defines the GitHub Actions contribution-gate workflow, managed marker/version, safe update rules, and stable status output.

Generate a ready-to-use `sdlc-config.json` for the SDLC runner by substituting the current project directory into the config template.

## Steps

1. **Resolve the project root** — find the root of the Codex project by locating the nearest ancestor directory containing a `.codex/` folder:
   ```bash
   git rev-parse --show-toplevel
   ```
   Then verify it's a Codex project:
   ```bash
   test -d "$(git rev-parse --show-toplevel)/.codex"
   ```
   If `.codex/` does not exist at the repo root, **stop and tell the user**: this must be run from within a Codex project (a directory with `.codex/` at its root).

   Use this resolved project root for all subsequent steps — do NOT use `pwd` directly, as it may differ from the project root.

2. **Find and read the template** from the local Codex plugin checkout. Use file discovery to locate:
   ```
   ~/.codex/plugins/**/nmg-sdlc/**/scripts/sdlc-config.example.json
   ```
   Prefer a match where `skills/run-loop/SKILL.md` exists under the same plugin root. If multiple versioned cache entries match, use the newest version directory. If no installed copy is found, fall back to this source checkout when it contains `scripts/sdlc-config.example.json`.

3. **Derive the project name** from the project root's basename:
   ```bash
   basename "$(git rev-parse --show-toplevel)"
   ```

4. **Resolve the plugin root** — take the parent directory of the `scripts/` directory that contains the template selected in Step 2. Verify this root contains both `.codex-plugin/plugin.json` and `skills/`.

5. **Substitute values** — replace the placeholder fields in the template:
   - `"projectPath": "/path/to/your/project"` → the resolved project root from Step 1
   - `"pluginRoot": "/path/to/nmg-sdlc"` → the resolved plugin root, expanded to the full absolute path
   - Leave `"pluginsPath"` empty unless the local checkout uses the legacy `plugins/nmg-sdlc` monorepo layout

6. **Write the config file** — save the fully substituted config JSON to `sdlc-config.json` in the project root (resolved in Step 1). Use Codex editing.

7. **Add to .gitignore** — ensure `sdlc-config.json` and `.codex/sdlc-state.json` are listed in the project's `.gitignore`:
   - Read the `.gitignore` file in the project root. If it does not exist, create it.
   - For each of `sdlc-config.json` and `.codex/sdlc-state.json`: if NOT already present, add it under an `# SDLC runner config` comment.
   - If both are already listed, skip this step.

8. **Install the managed contribution gate** — apply `../../references/contribution-gate.md` in the resolved project root:
   - Create `.github/workflows/` when needed.
   - If `.github/workflows/nmg-sdlc-contribution-gate.yml` is absent, write the managed workflow template.
   - If the file is already nmg-sdlc-managed and current, leave it unchanged.
   - If the file is nmg-sdlc-managed and outdated, update only that workflow from the shared contract.
   - If the file exists without the managed marker, leave it untouched and record a path-collision gap.
   - Preserve every unrelated workflow under `.github/workflows/` byte-for-byte.

9. **Confirm and suggest next step** — tell the user the config has been written and is git-ignored, include the stable Contribution Gate status block from `../../references/contribution-gate.md`, then suggest:
   ```
   Run the SDLC runner:
     $nmg-sdlc:run-loop
   Or run directly:
     node scripts/sdlc-runner.mjs --config sdlc-config.json
   ```

## Examples

### Example 1: First-time setup
User says: "Set up the SDLC runner for this project"
Actions: Resolves project root, reads template, substitutes paths, writes `sdlc-config.json`, adds to `.gitignore`, installs the managed contribution gate
Result: Config file and contribution-gate workflow ready at project root; user told how to run the runner

### Example 2: Project without .codex/
User says: "Generate a runner config"
Actions: Resolves project root, checks for `.codex/` directory
Result: Stops with error — "This must be run from within a Codex project"

## Integration with SDLC Workflow

This skill is a utility for setting up the SDLC runner. It generates the configuration file that `sdlc-runner.mjs` reads to orchestrate the development cycle. It is not part of the SDLC cycle itself but supports the automation layer that drives it.
