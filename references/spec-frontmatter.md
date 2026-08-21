# Spec Frontmatter

**Consumed by**: `write-spec`, `verify-code`, `run-retro`, `execute`.

Every feature/bug spec file (`requirements.md`, `design.md`, `tasks.md`) begins with a bolded-list frontmatter block — not YAML. Field names must be exact.

## Fields

```markdown
**Issue**: #N
**Date**: YYYY-MM-DD
**Status**: Draft | Approved
**Author**: Full Name
**Related Spec**: specs/{M}-{slug}/
```

| Field | Format | Purpose |
|-------|--------|---------|
| `**Issue**` | `**Issue**: #N` | Singular only. Must equal the directory's leading number. |
| `**Date**` | `**Date**: YYYY-MM-DD` | Most recent revision date. |
| `**Status**` | `**Status**: Draft` or `Approved` | Only these two values. |
| `**Author**` | `**Author**: Full Name` | Original author. |
| `**Related Spec**` | `**Related Spec**: specs/{M}-{slug}/` | Required on defects (or `N/A`). Optional on features when continuing a prior shipped spec. Pointer, not shared ownership. |

Delete plural `**Issues**` as a current field. `upgrade-project` maps leftover plural lists.

Status values `Amended`, `Investigating`, `Fixed`, `Closed`, and `In Review` are not current. Upgrade maps `Amended` as specified in `upgrade-project`.

## Change History

`## Change History` has exactly one initial row (`Initial feature spec` / `Initial defect report`). Pre-delivery revision appends `Spec revised before delivery` for the same issue and updates Date/Status. After merge, a new issue creates a new directory — never amend a shipped spec.

```markdown
## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #42 | 2026-03-01 | Initial feature spec |
```

## Defect heading

Defect specs use `# Defect Report:` and required `**Related Spec**`. Feature specs use `# Requirements:`.
