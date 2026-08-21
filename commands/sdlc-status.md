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

Locate this workflow's plugin root (two dirs above workflows/status/WORKFLOW.md) to find scripts/sdlc-status.mjs .

Invoke:
node scripts/sdlc-status.mjs --project <root> [--json]

Pass output through unchanged.

## JSON Contract

The emitted JSON (when --json) must not contain coordination keys.

Depends-on blocked/ready state from parseBodyRelationships is retained.

## Recommendations (from evidence)

- If first ready (unblocked by Depends-on) issue has approved spec/{N}-*/ (Status Approved + Issue match): recommend `/sdlc-execute`
- Else if implementation exists without current verification: recommend `/sdlc-verify-code #N`
- Else if verification passed or a PR is in flight: recommend `/sdlc-open-pr #N`
- Else if ready issue exists but no approved spec: recommend `/sdlc-write-spec #N`
- Report current step from run.json or inferred (start/implement/verify/deliver or blocked).
- Dirty tree, unmerged PR etc reported as state.

## Read-Only

No writes, no gh mutations, no branch changes.

## Integration with SDLC Workflow

```
/sdlc-draft-issue [need] → /sdlc-write-spec #N → /sdlc-execute [#N …] → /sdlc-status
```
Status can be called at any point.
