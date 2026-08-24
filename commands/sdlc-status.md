---
name: sdlc-status
description: "Report read-only SDLC status"
---


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
node <plugin-root>/scripts/sdlc-status.mjs --project <root> [--json]

Pass output through unchanged.

## Read-Only

No writes, no gh mutations, no branch changes.
