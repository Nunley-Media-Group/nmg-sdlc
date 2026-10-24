# ADR: Move nmg-sdlc from Oh My Pi to Claude Code (4.0.0)

**Status**: Accepted
**Date**: 2026-10-24
**Release**: 4.0.0
**Contract**: `references/rewrite-contract.{json,md}` (repository rewrite; no synthetic issue owner)

## Context

nmg-sdlc 3.x was an Oh My Pi (OMP) extension. `src/extension.ts` registered the `/sdlc-*` commands. It rewrote TUI input into builtin `/plan` plus the workflow and exited plan mode by toggling `/plan`. Interviews used OMP's `ask` and plans finished at `xd://propose`. Herdr ran workers as `--kind omp` panes, and runtime state lived in `.omp/sdlc/`.

The owner decided to run nmg-sdlc on Claude Code only, without losing any capability. Every OMP mechanism therefore needs a Claude Code equivalent. Because the host change touches every public surface at once and has no single issue owner, it ships as a repository rewrite, following the 3.1.0 precedent.

## Decisions

### 1. Host: Claude Code only

nmg-sdlc is a Claude Code plugin with the manifest `.claude-plugin/plugin.json`. There is no OMP build, no `omp` key in `package.json`, and no dual-host indirection. It is distributed through the `Nunley-Media-Group/nmg-plugins` marketplace (`nmg-sdlc@nmg-plugins`), and `claude --plugin-dir <checkout>` loads it for development. Versions stay synchronized across `VERSION`, `package.json`, and `.claude-plugin/plugin.json`.

*Rejected:* supporting both hosts behind an adapter. It doubles the surface the contract tests must prove and keeps OMP-only behavior alive with no consumer.

### 2. Plan entry: the hooks module

`hooks/hooks.json` declares one hooks module, `hooks/register.ts`. It registers the six interactive commands. Running one renders the workflow with `scripts/sdlc-render-prompt.mjs`, runs builtin `/plan` (this enables plan mode, or does nothing when it is already on), and submits the workflow as the person's prompt. Without a UI (`claude -p`, the SDK) it prints `Run /<command> in the TUI.` and exits 2. The module imports no Node built-ins: shared logic lives in the Node-free `src/host-events.mjs`, and Node work runs as a child process. The four automated commands stay plugin command files in `commands/` so they expand under `claude -p`.

The module also rewrites `<plugin-root>` (and `${NMG_SDLC_PLUGIN_ROOT}`) in Bash commands and Read paths to the installed plugin path. As a result, workflow text never hardcodes an install location.

*Rejected:* interactive commands as plain command files. A command file cannot switch the session into plan mode before the workflow's first turn, so the read-only investigation and approval boundary would rest on prose alone.

### 3. Plan exit: `ExitPlanMode`, approved by the module

Interviews use `AskUserQuestion`. Plans are written to the plan-mode plan file and finished with `ExitPlanMode`, which the person approves in Claude Code's dialog. For `/sdlc-write-spec` Finished, a Finished `AskUserQuestion` answer arms one approval: the workflow ends its reply with `ExitPlanMode`, and the module allows that single call so plan mode ends with no dialog. If the call is missing, the module asks for it once, then warns with a toast. Continue is driven by the merged-publication Bash result. Once the turn ends with an empty prompt box, the module re-enters plan mode with the Continue prompt.

*Rejected:* toggling `/plan` from the module to leave plan mode, as OMP did. It depended on the editor state and a confirmation prompt, and those were the source of the 3.x Finished defects.

### 4. Autopilot for unattended drivers

With `NMG_SDLC_AUTOPILOT=1` in a session's environment, the module approves every `ExitPlanMode` and answers every `AskUserQuestion` with each question's `(Recommended)` option, else its first. Unattended drivers, such as the live smoke provider's provisioning pane, set it at launch. It is scoped to the session that sets it and must never be set in a person's own session.

*Rejected:* screen-scraping the worker pane to press approval keys, as the OMP smoke provider did. It was fragile against pane width, truncated titles, and unpainted selectors.

### 5. State directory: `.nmg-sdlc/`

Runtime state moves from `.omp/sdlc/` to `.nmg-sdlc/` (`handoffs/`, `verification/`, `run.json`, `controller.lock`, `safe-recoveries.json`, `prompt-provenance/`, `plans/`, `smoke-deliveries/`). The managed ignore line is `.nmg-sdlc/`. The approved `/sdlc-upgrade-project` group `runtime-state-v4` migrates legacy state. It never overwrites existing `.nmg-sdlc/` files and preserves conflicts.

*Rejected:* keeping `.omp/sdlc/`. The name would advertise a host the plugin no longer supports, and a host-neutral name survives future host changes.

### 6. Worker permission mode

Herdr workers are Claude Code sessions: `herdr agent start <name> --kind claude --pane <id> -- --plugin-dir <plugin-root> --permission-mode <mode>`. `--plugin-dir` pins every worker to the controller's own plugin version. `<mode>` defaults to `auto`, so unattended workers can edit and run commands without stopping at prompts while Claude Code's own safeguards stay active. `NMG_SDLC_WORKER_PERMISSION_MODE` overrides it with `default`, `acceptEdits`, `auto`, `dontAsk`, or `bypassPermissions`; any other value falls back to `auto`. The Herdr integration check expects a `claude:` integration (`herdr integration install claude`).

*Rejected:* `bypassPermissions` as the default, which removes guardrails the operator never opted out of. `default` was also rejected, because it would stall unattended workers on the first permission prompt.

## Consequences

- Every 3.x capability is preserved, and contract tests assert the Claude Code behavior instead of the OMP behavior. Tests are deleted only for behavior that is gone by design.
- Consumers must reinstall through Claude Code, run `herdr integration install claude`, and approve the 4.0 upgrade groups (`runtime-state-v4`, `nmg-sdlc-ignore`, `agents-v4-host-language`, `packaging-v4-claude-code-herdr`).
- Workers inherit the operator's Claude Code settings and permission rules. A stricter worker mode can stop an unattended stage at a prompt.
- Interactive commands depend on Claude Code's plugin hooks-module support; a Claude Code build without it cannot run them.
