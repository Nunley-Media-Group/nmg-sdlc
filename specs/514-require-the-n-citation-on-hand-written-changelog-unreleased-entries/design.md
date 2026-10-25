# Root Cause Analysis: Hand-written CHANGELOG entries are not required to cite their issue

**Issue**: #514
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/503-fix-duplicate-changelog-entry-when-delivery-rolls-a-hand-written-issue-entry/

## Root Cause

Version preparation (`updateChangelog` in `scripts/sdlc-deliver.mjs`, as changed by #503) decides whether to add its generated `- <issue title> (#N)` line by looking for `(#N)` in the rolled `[Unreleased]` bullets. Spec tasks that require a changelog entry are authored from `workflows/write-spec/templates/tasks.md`, and implement workers follow `steering/snippets/project-tech.md` and `CLAUDE.md`. None of these sources, nor `references/versioning.md`, states that a hand-written bullet must cite its issue, and `references/versioning.md` does not describe the `[Unreleased]` roll at all. Citations therefore land inconsistently (mid-bullet for #484, #485, #486; at the end only for #487) or are omitted.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `workflows/write-spec/templates/tasks.md` | Introductory guidance before `## Feature Variant` | Source for spec tasks that require a changelog entry |
| `references/versioning.md` | Delivery `CHANGELOG.md` contract | Documents delivery's version and changelog behavior |
| `steering/snippets/project-tech.md` | `## Versioning` and the following subsections | Project convention read by implement workers |
| `CLAUDE.md` | `## Commit & CHANGELOG Conventions` | Project convention read by Claude Code sessions |

## Fix Strategy

Add one consistently worded rule to each source. The canonical rule phrase is: each `CHANGELOG.md` `[Unreleased]` bullet written for issue #N must end with the exact citation `(#N)`; a single trailing period is allowed. `references/versioning.md` additionally describes the roll. Add a contract test that pins the phrase in each file and pins the steering `## Versioning` table rows.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `workflows/write-spec/templates/tasks.md` | After the `**File(s)**:` paragraph, add: "When a task's acceptance requires a `CHANGELOG.md` `[Unreleased]` entry for issue #N, that acceptance requires each bullet written for that issue to end with the exact citation `(#N)`; a single trailing period is allowed, for example `- Corrected delivery (#42).`" | AC1, FR1 |
| `references/versioning.md` | Add a `## CHANGELOG entries` section after `## Bump matrix`: "Each `## [Unreleased]` bullet written for issue #N must end with the exact citation `(#N)`; a single trailing period is allowed. When delivery prepares the version for issue #N, it moves the `[Unreleased]` content under the new `## [X.Y.Z] - YYYY-MM-DD` heading. If a rolled `- ` bullet contains `(#N)`, delivery rolls it without adding its generated `- <issue title> (#N)` line; otherwise it adds the generated line." | AC2, FR2 |
| `steering/snippets/project-tech.md` | Add a `### Changelog Entries` subsection after `### Version Bump Classification` stating the canonical rule. The `## Versioning` table is not edited. | AC3, AC5, FR3 |
| `CLAUDE.md` | Add a bullet to `## Commit & CHANGELOG Conventions`: "Each `CHANGELOG.md` `[Unreleased]` bullet written for issue #N must end with the exact citation `(#N)`; a single trailing period is allowed" | AC3, FR3 |
| `scripts/__tests__/changelog-citation-contract.test.mjs` | New Jest ESM contract test following `scripts/__tests__/onboard-changelog-contract.test.mjs` (reads files relative to the repository root) | AC1–AC5, FR4 |
| `scripts/skill-inventory.baseline.json` | Regenerate with `node scripts/skill-inventory-audit.mjs --baseline` so it includes the new `references/versioning.md` content | Keeps the existing inventory freshness check current |

Contract test assertions:

- `workflows/write-spec/templates/tasks.md`, `references/versioning.md`, `steering/snippets/project-tech.md`, and `CLAUDE.md` each match `/end with the exact citation `\(#N\)`/` and mention `[Unreleased]`.
- The `CLAUDE.md` match lies inside the `## Commit & CHANGELOG Conventions` section (text between that heading and the next `## ` heading).
- `references/versioning.md` contains `` `- <issue title> (#N)` ``, `without adding`, and `otherwise it adds the generated line`.
- The `steering/snippets/project-tech.md` `## Versioning` section, sliced to the next `##`/`###` heading exactly as `versionedArtifacts` in `scripts/sdlc-deliver.mjs` slices it, has table rows whose first backticked cells are exactly `VERSION`, `package.json`, `.claude-plugin/plugin.json`, with `package.json` and `.claude-plugin/plugin.json` field `version`.

## Blast Radius

Documentation, template, and steering text only, plus one new test and a regenerated inventory baseline. No runtime code changes. The steering rule sits in its own `###` subsection, outside the `## Versioning` section slice that `versionedArtifacts` parses, so delivery's mirror set is unchanged. Rendered write-spec prompts include the new template sentence.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Document the rule as "contains `(#N)`" to mirror delivery's detection | Rejected | The issue requires the stricter "ends with `(#N)`" authoring rule; versioning.md still describes delivery's "contains" match |
| Put the steering rule inside the `## Versioning` table section | Rejected | Prose there sits inside the slice `versionedArtifacts` parses; a separate subsection keeps mirror discovery isolated |
| Enforce the rule with a CHANGELOG validator | Rejected | Out of scope; this fix is the authoring guidance and its contract test |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #514 | 2026-10-25 | Initial defect design |
