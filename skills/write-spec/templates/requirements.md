# Requirements Template

Use this template for executable feature or bug specs. Never create an epic aggregate.

---

```markdown
# Requirements: [Feature Name]

**Issue**: #[number]
**Date**: [YYYY-MM-DD]
**Status**: Draft | Approved
**Author**: [name]
**Related Spec**: specs/{M}-{slug}/

---

## User Story

**As a** [user type]
**I want** [action]
**So that** [benefit]

---

## Background

[Why this feature is needed.]

---

## Acceptance Criteria

Each criterion becomes a Gherkin scenario.

### AC1: [Scenario Name]

**Given** [precondition]
**When** [action]
**Then** [outcome]

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | [requirement] | Must | |

---

## Out of Scope

- [item]

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #[number] | [YYYY-MM-DD] | Initial feature spec |
```

---

# Defect Requirements Variant

Use when the GitHub issue has the `bug` label.

```markdown
# Defect Report: [Bug Summary]

**Issue**: #[number]
**Date**: [YYYY-MM-DD]
**Status**: Draft | Approved
**Author**: [name]
**Related Spec**: specs/{M}-{slug}/

---

## Reproduction

1. [step]

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | [what should happen] |
| **Actual** | [what happens] |

## Acceptance Criteria

### AC1: Bug Is Fixed

**Given** [reproduction precondition]
**When** [action]
**Then** [correct behavior]

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | [the fix] | Must |

## Out of Scope

- [related improvement]

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #[number] | [YYYY-MM-DD] | Initial defect report |
```
