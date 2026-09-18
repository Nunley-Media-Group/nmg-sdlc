# Tasks Template

Use this template for executable feature or bug specs. Emit only issue-specific repository implementation tasks and AC-linked test tasks in dependency order. Every task belongs to the current issue and realizes or proves retained behavior. Do not add generic setup, quality, delivery, approval, release, publication, or external-operation tasks.

`**File(s)**:` is optional implementation guidance, never an allowlist. When present, use repository-relative paths enclosed in backticks, separated by commas or semicolons. Bounded directories and globs are allowed. Optional parenthetical notes may follow an entry. Acceptance is authoritative.

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

### T002: [AC-linked behavioral verification]

**File(s)**: `path/to/test`
**Type**: Create | Modify
**Depends**: T001
**Acceptance**:
- [AC identifier and observable behavior exercised]
- [Exact repository test or registered validation evidence]

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #[number] | [YYYY-MM-DD] | Initial feature tasks |
```

Add only the number of tasks required by the retained issue behavior. Every dependency names an earlier task; independent tasks use `none`. Test tasks must map to specific ACs. Do not include unconstrained Notes.

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

### T002: Add Behavioral Regression Coverage

**File(s)**: `path/to/test`
**Type**: Create | Modify
**Depends**: T001
**Acceptance**:
- [AC-linked scenario reproduces the original condition]
- [Test fails without the fix and passes with it]

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #[number] | [YYYY-MM-DD] | Initial defect tasks |
```

Never task execute with changing Approved spec inputs, another repository, acquiring credentials or authority, human approval, live deployment or migration, release/tag/package publication, version synchronization, pull-request creation, merge, issue closure, or any other control-plane or intervention-owned result.
