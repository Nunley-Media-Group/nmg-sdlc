# Defect Report: Generated CHANGELOG bullet lacks a blank line under an empty matching heading

**Issue**: #519
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/512-file-generated-bug-fix-changelog-lines-under-fixed/

## Reproduction

1. In a project with `VERSION` `3.4.5`, a declared `package.json` version mirror, and a `CHANGELOG.md` whose `## [Unreleased]` section contains only `### Fixed` followed by blank lines, use issue #42 titled `Deliver verified changes` and labelled `bug`, with no `BREAKING:` declaration.
2. Run `sdlc-deliver.mjs prepare-version --issue 42`.
3. Repeat with `[Unreleased]` containing `### Fixed`, blank lines, then `### Changed` with the bullet `- Renamed the option (#8)`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The `## [3.4.6]` section contains `### Fixed`, exactly one blank line, then `- Deliver verified changes (#42)`; when `### Changed` follows, exactly one blank line separates the generated bullet from `### Changed`. |
| **Actual** | The `## [3.4.6]` section contains `### Fixed` immediately followed by `- Deliver verified changes (#42)` on the next line; when `### Changed` follows, the blank lines that were under `### Fixed` end up between the bullet and `### Changed`. |

## Acceptance Criteria

### AC1: Empty trailing matching heading gets one blank line before the generated bullet

**Given** `[Unreleased]` ends with a `### Fixed` heading that has only blank lines beneath it, and issue #42 is a `bug` filed under `Fixed`
**When** `prepare-version` runs for issue #42
**Then** the new release section ends with `### Fixed\n\n- Deliver verified changes (#42)\n` and contains `### Fixed` exactly once

### AC2: Empty matching heading followed by another section gets one blank line on each side of the generated bullet

**Given** `[Unreleased]` contains `### Fixed` with only blank lines beneath it, followed by `### Changed` and `- Renamed the option (#8)`
**When** `prepare-version` runs for bug issue #42
**Then** the new release section contains `### Fixed\n\n- Deliver verified changes (#42)\n\n### Changed\n\n- Renamed the option (#8)\n` and contains `### Fixed` exactly once

### AC3: A matching section that already has bullets is appended to as before

**Given** `[Unreleased]` contains `### Fixed` with `- Corrected the widget (#7)`, followed by `### Changed` with `- Renamed the option (#8)`
**When** `prepare-version` runs for bug issue #42
**Then** the new release section contains `### Fixed\n\n- Corrected the widget (#7)\n- Deliver verified changes (#42)\n\n### Changed\n\n- Renamed the option (#8)\n`

### AC4: A section without a matching heading is unchanged

**Given** `[Unreleased]` is empty, or has no heading that exactly equals `### Fixed`
**When** `prepare-version` runs for bug issue #42
**Then** a new `### Fixed` heading is added, followed by one blank line and `- Deliver verified changes (#42)`, exactly as before this fix

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | When the rolled `[Unreleased]` section has a heading exactly equal to `### <category>` with no non-blank lines beneath it, version preparation writes exactly one blank line between that heading and the generated bullet. | Must |
| FR2 | When such an empty matching heading is followed by another `### ` heading, exactly one blank line separates the generated bullet from that next heading. | Must |
| FR3 | When the matching section already has non-blank content, the generated bullet is inserted directly after its last non-blank line; when no heading matches, a new `### <category>` heading, a blank line, and the bullet are appended as before. | Must |

## Out of Scope

- Normalizing blank-line spacing elsewhere in rolled or released CHANGELOG sections.
- Changing how the CHANGELOG category is chosen or how an existing `(#N)` bullet is detected.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #519 | 2026-10-25 | Initial defect report |
