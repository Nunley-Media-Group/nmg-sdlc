# Bug Report Issue Body Template

**Consumed by**: `draft-issue` synthesis.
**Triggering condition**: `classification === 'bug'`.

Use this template as the drafted GitHub issue body. Fill it only with software behavior, reproduction evidence, repository-grounded diagnosis, and technical constraints retained by the rendered `/sdlc-execute` eligibility contract. Omit provenance attestations and externally owned obligations.

## Template

```markdown
## Bug Report

[Concise description of the incorrect observable software behavior.]

## Root Cause Analysis

[Repository-grounded hypothesis: affected code paths, incorrect assumption or logic, and triggering conditions. If investigation is inconclusive, state only the known software evidence and the bounded implementation investigation required.]

## Reproduction Steps

1. [Software setup or precondition]
2. [Action]
3. [Action that triggers the defect]

## Expected Behavior

[Observable correct behavior.]

## Actual Behavior

[Observable incorrect behavior.]

## Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | [only when it affects reproduction] |
| **Version / Commit** | [relevant software version or commit] |
| **Browser / Runtime** | [only when it affects reproduction] |

## Acceptance Criteria

### AC1: Bug Is Fixed

**Given** [reproduction precondition]
**When** [action that previously triggered the bug]
**Then** [observable correct behavior]

### AC2: Related Behavior Is Preserved

**Given** [related software scenario]
**When** [related action]
**Then** [observable existing behavior]

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | [executable corrective behavior] | Must |

## Out of Scope

- [Adjacent software improvement intentionally excluded from this fix]
```

## Authoring Guidance

- Start the title with a verb describing the fix.
- Include only root-cause and environment details relevant to implementation or reproducibility.
- Keep acceptance criteria to observable fix and regression behavior.
- Out of Scope may name only adjacent software behavior.
- Do not include a user-confirmation attestation, arbitrary links, policy context, ownership proof, sign-off, live operations, or delivery/control-plane work.
- For multi-issue plans, keep bodies dependency-free and record approved official blocked-by edges only in the plan entry's `blockedBy` array.
