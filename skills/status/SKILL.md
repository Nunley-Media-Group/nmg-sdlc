---
name: status
description: "Inspect and report current SDLC lifecycle state without mutation. Accepts --json. Recommends /skill:execute when approved spec exists and issue unblocked; /plan /skill:write-spec #N when ready issue lacks approved spec. Use /skill:status [--json]"
---

# Status

Read-only lifecycle report. Delegates to bundled scripts/sdlc-status.mjs .

## Arguments

Only empty or exactly `--json` accepted.

Any other → print:
Usage: /skill:status [--json]
and exit non-zero.

## Execution

Resolve project root via git rev-parse --show-toplevel .

Locate this skill's plugin root (two dirs above skills/status/SKILL.md) to find scripts/sdlc-status.mjs .

Invoke:
node scripts/sdlc-status.mjs --project <root> [--json]

Pass output through unchanged.

## JSON Contract

The emitted JSON (when --json) must not contain coordination keys.

Depends-on blocked/ready state from parseBodyRelationships is retained.

## Recommendations (from evidence)

- If first ready (unblocked by Depends-on) issue has approved spec/{N}-*/ (Status Approved + Issue match): recommend `/skill:execute`
- Else if ready issue exists but no approved spec: recommend `/plan /skill:write-spec #N`
- Report current step from run.json or inferred (start/implement/verify/deliver or blocked).
- Dirty tree, unmerged PR etc reported as state.

## Read-Only

No writes, no gh mutations, no branch changes.

## Integration with SDLC Workflow

```
/plan /skill:draft-issue [need] → /plan /skill:write-spec #N → /skill:execute [#N …] → /skill:status
```
Status can be called at any point.
