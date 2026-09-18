# Requirements Template

Use this template for executable feature or bug specs. Generate only functional software context, observable criteria, retained Functional Requirements, adjacent-software Out of Scope, required frontmatter, and Change History. Never create an epic aggregate or copy the Execute Feasibility audit into the file.

## Feature Variant

```markdown
# Requirements: [Feature Name]

**Issue**: #[number]
**Date**: [YYYY-MM-DD]
**Status**: Draft | Approved
**Author**: [name]
**Related Spec**: specs/{M}-{slug}/

## User Story

**As a** [software user or actor]
**I want** [observable action or capability]
**So that** [software outcome]

## Background

[Concise functional context needed to understand retained behavior.]

## Acceptance Criteria

### AC1: [Observable scenario]

**Given** [software precondition]
**When** [action]
**Then** [observable outcome]

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | [executable software behavior] | Must |

## Out of Scope

- [Adjacent software behavior not owned by this issue]

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #[number] | [YYYY-MM-DD] | Initial feature spec |
```

## Defect Variant

Use when the GitHub issue has the `bug` label.

```markdown
# Defect Report: [Bug Summary]

**Issue**: #[number]
**Date**: [YYYY-MM-DD]
**Status**: Draft | Approved
**Author**: [name]
**Related Spec**: specs/{M}-{slug}/

## Reproduction

1. [software setup or action]

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | [observable correct behavior] |
| **Actual** | [observable incorrect behavior] |

## Acceptance Criteria

### AC1: Bug Is Fixed

**Given** [reproduction precondition]
**When** [action]
**Then** [observable correct behavior]

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | [executable corrective behavior] | Must |

## Out of Scope

- [Adjacent software improvement]

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #[number] | [YYYY-MM-DD] | Initial defect report |
```

Omit legal or policy rationale, ownership or authority proof, external sign-off or attestation, live operations, delivery controls, feasibility-ledger rows, and unresolved questions from every section.
