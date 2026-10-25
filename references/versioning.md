# Versioning

**Consumed by**: `open-pr`.

`VERSION` is the required single version source. `open-pr` synchronizes it with `CHANGELOG.md` and every stack-specific mirror declared in the manifest-registered technical steering snippet's `## Versioning` table.

Each table row declares a repository-relative file and field locator:

| File type | Field locator |
|-----------|---------------|
| JSON | Dot-separated property path, such as `version` or `tool.release.version` |
| TOML | Dot-separated table and key, such as `project.version` |
| Other text | A field name that occurs with the current version on exactly one line |

`package.json` is not universal. A Node project declares `package.json` and `version`; a Python project can instead declare `pyproject.toml` and a runtime version field. Delivery never invents a compatibility manifest. A missing, unsafe, ambiguous, or unsynchronized declared mirror fails before the delivery commit.

Resume validation uses `VERSION`, `CHANGELOG.md`, and the current steering-declared mirror set. The prior delivery commit must contain every path and the working tree must match that commit for those paths.

There is no `--major` CLI flag and no interactive version gate.

## Bump matrix

| Label | Bump |
|-------|------|
| `bug` | patch |
| `enhancement` | minor |

Default unmatched issues to minor. Never infer major. A leftover `spike` label is unmatched and defaults to minor.

## CHANGELOG entries

Each `[Unreleased]` bullet written for issue #N must end with the exact citation `(#N)`; a single trailing period is allowed.

When delivery prepares the version for issue #N, it moves the `[Unreleased]` content under the new `## [X.Y.Z] - YYYY-MM-DD` heading. If a rolled `- ` bullet contains `(#N)`, delivery rolls it without adding its generated `- <issue title> (#N)` line; otherwise it adds the generated line. Delivery detects the citation by containment, so a citation anywhere in a bullet suppresses the generated line; authors place it at the end so every entry reads uniformly.

## Approved major note

A line in the approved spec `requirements.md` or `design.md` matching `^\*\*Version bump\*\*:\s*major\s*$` (case-insensitive).

If the issue title or body contains `BREAKING` and that line is absent, fail closed with `reasonCode: major_bump_required`.
