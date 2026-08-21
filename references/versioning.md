# Versioning

**Consumed by**: `open-pr`.

`VERSION` is the single version source. `open-pr` synchronizes:

| File | Field |
|------|-------|
| `VERSION` | file text |
| `package.json` | `version` |
| `.claude-plugin/plugin.json` | `version` |
| `CHANGELOG.md` | `[Unreleased]` → versioned heading |

There is no `--major` CLI flag and no interactive version gate.

## Bump matrix

| Label | Bump |
|-------|------|
| `bug` | patch |
| `enhancement` | minor |

Default unmatched issues to minor. Never infer major. A leftover `spike` label is unmatched and defaults to minor.

## Approved major note

A line in the approved spec `requirements.md` or `design.md` matching `^\*\*Version bump\*\*:\s*major\s*$` (case-insensitive).

If the issue title or body contains `BREAKING` and that line is absent, fail closed with `reasonCode: major_bump_required`.
