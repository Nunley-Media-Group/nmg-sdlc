---
name: status
description: "Inspect and report current SDLC lifecycle state without mutation. Accepts --json. Recommends /sdlc-execute when approved spec exists and issue unblocked; /sdlc-write-spec #N when ready issue lacks approved spec. Use /sdlc-status [--json]"
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
