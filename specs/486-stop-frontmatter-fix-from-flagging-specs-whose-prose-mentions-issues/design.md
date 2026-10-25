# Root Cause Analysis: frontmatter-fix flags specs whose prose mentions Issues

**Issue**: #486
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG

## Root Cause

1. `detectUpgrade` in `scripts/sdlc-upgrade.mjs` computes `isPlural = /Issues/.test(req)` against the full `requirements.md` text, or `design.md` when there is no requirements file. Any heading or sentence that contains "Issues" makes an already-singular `{N}-{slug}` package satisfy `alreadyNumSlug && primary && (isPlural || numsInFm.length > 1)`, so a `frontmatter-fix` item is emitted.
2. `rewriteFrontmatter` converts `# Issue:` comment lines to `**Issue**: #N`. It then checks only the bold `**Date**:`, `**Status**:`, and `**Author**:` forms, so for a gherkin whose header uses `# Date:` / `# Status:` / `# Author:` comments it inserts new bold lines (Date = today, Author = Unknown) and leaves the comment lines in place.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/sdlc-upgrade.mjs` | `detectUpgrade` directory/frontmatter loop (`isPlural`) | False plural detection |
| `scripts/sdlc-upgrade.mjs` | `rewriteFrontmatter` | Duplicates comment-header fields |
| `scripts/sdlc-upgrade.mjs` | `applyFrontmatterFix`, directory-rename apply, cumulative split, epic flatten | Callers of `rewriteFrontmatter` (unchanged) |

## Fix Strategy

- **Detection:** change `isPlural` to `/^\*\*Issues\*\*:/m.test(req)`. `numsInFm` (from `extractIssueNumbersFromContent`, which already reads only `**Issue(s)**:` lines) and the rest of the condition stay unchanged. A plural `**Issues**: #N, #M` field still emits `frontmatter-fix` with `primaryN` from `extractPrimaryN`.
- **Rewrite:** restructure `rewriteFrontmatter(content, targetN, targetStatus)` as follows:
  1. Rewrite bold lines in place: `^\*\*Issues?\*\*:.*$` → `**Issue**: #N`, and `^\*\*Status\*\*:.*$` → `**Status**: T` (unchanged).
  2. Rewrite comment lines in place: `^#\s*Issues?:.*$` → `# Issue: #N`, and `^#\s*Status:.*$` → `# Status: T`. Leave `# Date:` and `# Author:` lines unchanged.
  3. Set `commentStyle` to true when a `^# Issue:` line exists and no `^\*\*Issue\*\*:` line exists.
  4. Treat a field (Issue, Date, Status, Author) as present when either `^\*\*Field\*\*:` or `^#\s*Field:` matches.
  5. Insert each missing field in the existing order:
     - Issue goes after the first H1, together with all four fields, as today.
     - Date goes after the Issue line, Status after the Date line, and Author after the Status line.
     - Use `# Field: value` syntax when `commentStyle` is true, and `**Field**: value` otherwise. The defaults stay the same (today's ISO date and `Unknown`).
- For a file with only bold fields, steps 2–4 change nothing, so the output is byte-identical to the current behavior (AC4).
- **Docs:** in `workflows/upgrade-project/references/v3-detectors.md` item 8, state that plural detection uses only the `**Issues**:` field line, and that gherkin `# Issue:` / `# Date:` / `# Status:` / `# Author:` comment headers are normalized in place without adding bold duplicates. Edit it after invoking the `skill-creator` skill. Add a CHANGELOG `[Unreleased]` `### Fixed` entry.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/sdlc-upgrade.mjs` | Field-line plural check | AC1, AC2, FR1 |
| `scripts/sdlc-upgrade.mjs` | Comment-aware `rewriteFrontmatter` | AC3, AC4, FR2, FR3 |
| `workflows/upgrade-project/references/v3-detectors.md`, `CHANGELOG.md` | Document the behavior | User-facing behavior |

## Blast Radius

- `isPlural` also feeds the `directory-rename` description text and `needsFrontmatter`. Prose "Issues" no longer forces a frontmatter rewrite during a rename, while a plural field still does.
- `rewriteFrontmatter` is shared by directory-rename, frontmatter-fix, cumulative split, and epic flatten. All of them gain comment-header preservation, and bold-only output is unchanged.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Convert comment headers to bold lines and drop the comments | Rejected | Out of scope; comment syntax must be kept |
| Skip `feature.gherkin` in `applyFrontmatterFix` | Rejected | A genuine plural `# Issues:` header must still be normalized (AC3) |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #486 | 2026-10-25 | Initial defect report |
