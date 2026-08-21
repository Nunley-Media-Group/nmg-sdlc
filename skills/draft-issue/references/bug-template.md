# Bug Report Issue Body Template

**Consumed by**: `draft-issue` Step 6.
**Triggering condition**: `classification === 'bug'`.

Use this template as the body of the drafted GitHub issue when the current iteration classifies as a Bug. Fill each placeholder from the confirmed `understanding` block produced by Step 5c and the `investigation.summary` (root-cause hypothesis) from Step 4.

## Template

```markdown
## Bug Report

[1-2 sentence summary of the bug]

## Root Cause Analysis

[Hypothesis from Step 4 investigation — affected code paths, the incorrect
assumption or logic, and triggering conditions. If investigation was
inconclusive, state what is known and what needs further investigation.]

**User Confirmed**: Yes / Partially / Investigation inconclusive

## Reproduction Steps

1. [First step]
2. [Second step]
3. [Step that triggers the bug]

## Expected Behavior

[What should happen]

## Actual Behavior

[What actually happens]

## Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | [e.g., macOS 15.2, Ubuntu 24.04] |
| **Version / Commit** | [app version or commit SHA] |
| **Browser / Runtime** | [if applicable] |

## Acceptance Criteria

### AC1: Bug Is Fixed

**Given** [the reproduction precondition]
**When** [the action that previously triggered the bug]
**Then** [the correct expected behavior]

### AC2: No Regression

**Given** [a related scenario that currently works]
**When** [a related action]
**Then** [existing behavior is preserved]

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | [The fix] | Must |

## Out of Scope

- [Related improvements not part of this fix]
```

## Authoring Guidance (v3)

- Title starts with verb for the fix.
- Root cause from investigation.
- ACs are the minimal fix + no regression.
- Out of Scope lists tempting adjacent work for separate issues.

For multi-issue the caller inserts the Depends on: / Blocks: lines using plan topo summaries into the filled body before emitting the plan. The gh create in approved plan execution receives bodies that already contain the relation lines.
