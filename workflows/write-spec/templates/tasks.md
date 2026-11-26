# Tasks Template

Use this template for executable feature or bug specs. Emit only issue-specific repository implementation tasks and scenario-implementation tasks in dependency order. Every task belongs to the current issue and realizes or proves retained behavior. Do not add generic setup, quality, delivery, approval, release, publication, or external-operation tasks.

The `feature.gherkin` scenarios are the single acceptance test layer, so each AC is tested exactly once. An AC-linked test task implements those scenarios by their `@SCN` tags: their step definitions, or the test that the scenario's `# File:` header names and that cites the tag, plus any production seams the steps need. Never task a separate test that restates an AC; a duplicate only grows the suite without adding evidence. Follow the rendered Kept Test Layers rule: any other test task must be of a kept type and cover a behavior that no scenario covers. When `e2e` is kept, a scenario's implementation may be an e2e test that cites its `@SCN` tag, for behavior only observable through the running app or UI.

`**File(s)**:` is optional implementation guidance, never an allowlist. When present, use repository-relative paths enclosed in backticks, separated by commas or semicolons. Bounded directories and globs are allowed. Optional parenthetical notes may follow an entry. Acceptance is authoritative.

When a task's acceptance requires a `CHANGELOG.md` `[Unreleased]` entry for issue #N, that acceptance requires each bullet written for that issue to end with the exact citation `(#N)`; a single trailing period is allowed, for example `- Corrected delivery (#42).` Delivery detects the citation to decide whether it adds its generated line, so a bullet without the citation produces a duplicate entry.

## Feature Variant

```markdown
# Tasks: [Feature Name]

**Issue**: #[number]
**Date**: [YYYY-MM-DD]
**Status**: Draft | Approved
**Author**: [name]
**Related Spec**: specs/{M}-{slug}/

## Implementation Tasks

### T001: [Issue-specific implementation outcome]

**File(s)**: `path/to/source`, `path/to/config`
**Type**: Create | Modify | Delete
**Depends**: none
**Acceptance**:
- [Specific retained AC/FR behavior this task implements]
- [Observable repository result]

### T002: Implement the `feature.gherkin` scenarios

**File(s)**: `path/to/step-definitions-or-scenario-test`
**Type**: Create | Modify
**Depends**: T001
**Acceptance**:
- `@SCN001` (AC1): [scenario implementation and the production seams its steps need]
- `@SCN002` (AC2): [scenario implementation]
- [Exact command that runs the scenarios]

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #[number] | [YYYY-MM-DD] | Initial feature tasks |
```

Add only the number of tasks required by the retained issue behavior. Every dependency names an earlier task; independent tasks use `none`. Scenario-implementation tasks must name each `@SCN` tag and its AC. Do not include unconstrained Notes.

## Defect Variant

Use when the GitHub issue has the `bug` label. Keep a bounded flat task list for the minimal root-cause fix and its behavioral regression proof.

```markdown
# Tasks: [Bug Summary]

**Issue**: #[number]
**Date**: [YYYY-MM-DD]
**Status**: Draft | Approved
**Author**: [name]
**Related Spec**: specs/{M}-{slug}/

## Implementation Tasks

### T001: Correct the Root Cause

**File(s)**: `path/to/affected/source`
**Type**: Modify
**Depends**: none
**Acceptance**:
- [Root cause from design.md is corrected]
- [AC1 observable behavior is produced]

### T002: Implement the Regression Scenarios

**File(s)**: `path/to/step-definitions-or-scenario-test`
**Type**: Create | Modify
**Depends**: T001
**Acceptance**:
- `@SCN001` (AC1): [scenario implementation reproduces the original condition]
- [The scenario fails without the fix and passes with it]

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #[number] | [YYYY-MM-DD] | Initial defect tasks |
```

Never task execute with changing Approved spec inputs, another repository, acquiring credentials or authority, human approval, live deployment or migration, release/tag/package publication, version synchronization, pull-request creation, merge, issue closure, or any other control-plane or intervention-owned result.
