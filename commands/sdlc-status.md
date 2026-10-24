---
description: "Report read-only SDLC status"
argument-hint: "[--json]"
---

Plugin paths: `${CLAUDE_PLUGIN_ROOT}` is the installed nmg-sdlc plugin root. Read packaged files by their `${CLAUDE_PLUGIN_ROOT}/...` path.
- In the inlined `status` workflow, relative paths such as `references/...`, `templates/...`, `checklists/...`, and `agents/...` resolve under `${CLAUDE_PLUGIN_ROOT}/workflows/status/`.
- `../../references/...` resolves under `${CLAUDE_PLUGIN_ROOT}/references/`, and a path beginning `workflows/` resolves under `${CLAUDE_PLUGIN_ROOT}/`.
- Paths such as `specs/`, `steering/`, and `.nmg-sdlc/` name files in the current project, not in the plugin.


# Status

Read-only lifecycle report. Delegates to bundled scripts/sdlc-status.mjs .

## Arguments

Only empty or exactly `--json` accepted.

Any other → print:
Usage: /sdlc-status [--json]
and exit non-zero.

## Execution

Resolve project root via git rev-parse --show-toplevel .


Invoke:
node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-status.mjs --project <root> [--json]

Pass output through unchanged.

## Read-Only

No writes, no gh mutations, no branch changes.
