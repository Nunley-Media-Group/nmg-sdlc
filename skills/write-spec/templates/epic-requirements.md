# Epic Aggregate Requirements: [Epic title]

**Issue**: #[epic-number]
**Date**: [YYYY-MM-DD]
**Status**: Draft
**Author**: [Author]

---

> This aggregate is coordination-only. It owns cross-child outcomes and
> constraints, not executable acceptance criteria, tasks, or scenarios.
> The epic cannot be started. Children use normal dependency rules and display
> this aggregate only as informational lineage.

## Goal

[Describe the outcome delivered when every child is complete.]

## Aggregate Outcomes

### EO001: [Outcome name]

[Describe the cross-child result without copying a child acceptance criterion.]

## Cross-Child Constraints

- [Constraint shared by two or more children]

## Child Topology

| Child Issue | Expected Spec | Outcomes | Genuine Prerequisites |
|-------------|---------------|----------|-----------------------|
| #[child-number] | `specs/[child-spec-slug]` | EO001 | None |

## Out of Scope

- Executable tasks, Gherkin scenarios, implementation, verification, or delivery
  owned by an epic
- Closing an epic from child PR text; terminal child delivery explicitly closes
  only an eligible, fully revalidated epic after all direct children close

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #[epic-number] | [YYYY-MM-DD] | Initial coordination aggregate |
