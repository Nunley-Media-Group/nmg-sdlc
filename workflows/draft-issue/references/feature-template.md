# Feature / Enhancement Issue Body Template

**Consumed by**: `draft-issue` synthesis.
**Triggering condition**: `classification === 'feature'`.

Use this template as the drafted GitHub issue body. Fill it only with functional software behavior and implementation-relevant technical constraints retained by the rendered `/sdlc-execute` eligibility contract. Omit excluded motivation, proof, sign-off, operations, and policy context from every section.

## Template

```markdown
## User Story

**As a** [specific software user or actor]
**I want** [observable action or capability]
**So that** [software outcome]

## Background

[Concise functional problem and user-visible context required to understand the behavior.]

## Current State

[Repository-grounded description of existing behavior, relevant code patterns, and the observable gap. If no relevant implementation exists, state that this is a greenfield software addition.]

## Acceptance Criteria

### AC1: [Observable happy path]

**Given** [software precondition]
**When** [user or system action]
**Then** [observable outcome]

### AC2: [Observable boundary or alternative]

**Given** [software precondition]
**When** [action]
**Then** [observable outcome]

### AC3: [Observable error behavior]

**Given** [error precondition]
**When** [failing action]
**Then** [observable error handling]

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | [executable software behavior] | Must |

## Out of Scope

- [Adjacent software behavior intentionally excluded from this issue]

## Technical Notes

[Repository-specific interface, compatibility, data, performance, security, configuration, migration, or infrastructure-as-code constraints that affect retained software behavior and can be implemented and tested.]
```

## Authoring Guidance

- Keep the title concise and verb-first.
- Map every AC to observable Given/When/Then behavior.
- Keep Background, Current State, and Technical Notes implementation-relevant.
- Out of Scope may name only adjacent software behavior.
- Do not include arbitrary links, legal or policy rationale, ownership or authority proof, external approval or attestation, live operations, or delivery/control-plane work.
- For multi-issue plans, keep bodies dependency-free and record approved official blocked-by edges only in the plan entry's `blockedBy` array.
