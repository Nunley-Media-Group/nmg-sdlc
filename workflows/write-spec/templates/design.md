# Design Template

Use this template for executable feature or bug specs. Include only architecture, interface, data, storage, state, UI, root-cause, and fix details required to implement retained software behavior. Omit empty sections. Do not generate generic security, performance, testing, risk, validation, or Open Questions sections; place concrete security or performance behavior in the relevant implementation section.

## Feature Variant

```markdown
# Design: [Feature Name]

**Issue**: #[number]
**Date**: [YYYY-MM-DD]
**Status**: Draft | Approved
**Author**: [name]
**Related Spec**: specs/{M}-{slug}/

## Overview

[Technical summary of the retained behavior, selected implementation direction, and repository integration points.]

## Architecture

[Components and data flow required to implement the retained behavior. Use the project's actual structure and omit generic diagrams.]

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| [path, method, command, event, or function] | [schema or value] | [observable result] | [retained behavior] |

## Data / Storage Changes

[Schema, migration, rollback, retention state, or persistence details required by retained behavior.]

## State and UI Behavior

[State transitions, accessibility behavior, components, and user-visible states required by retained behavior.]

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| [bounded implementation option] | Selected / Rejected | [repository-grounded reason] |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #[number] | [YYYY-MM-DD] | Initial feature design |
```

## Defect Variant

Use when the GitHub issue has the `bug` label.

```markdown
# Root Cause Analysis: [Bug Summary]

**Issue**: #[number]
**Date**: [YYYY-MM-DD]
**Status**: Draft | Approved
**Author**: [name]
**Related Spec**: specs/{M}-{slug}/

## Root Cause

[Repository-grounded explanation of the incorrect code path, assumption, or state transition and the triggering software conditions.]

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `path/to/file` | [symbol or bounded area] | [role in defect path] |

## Fix Strategy

[Minimal source change that corrects the retained observable behavior.]

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `path/to/file` | [specific change] | [AC or FR implemented] |

## Blast Radius

[Callers, dependents, shared state, interfaces, or data paths affected by the fix.]

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| [bounded fix option] | Selected / Rejected | [repository-grounded reason] |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #[number] | [YYYY-MM-DD] | Initial defect design |
```

Never include delivery work, external obligations, approval or attestation burdens, feasibility-ledger rows, instructional checklists, or unresolved material choices.
