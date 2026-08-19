# Version Bump (v3 automatic)

**Consumed by**: open-pr.

No --major flag, no user question. Bump classification from steering/tech.md ## Versioning matrix only (label match → type, unmatched → minor, spike label → skip entirely).

Compute new version from VERSION file.

Apply updates to:
- VERSION
- package.json (version field)
- .claude-plugin/plugin.json (version)
- CHANGELOG.md [Unreleased] → new versioned section
- every file declared in tech.md versioned-files table (json/toml/plain)

Stage together with delivery changes. One commit carries the bump when needed.

BREAKING detection + approved major note check happens in caller (open-pr) before bump; produces major_bump_required failed handoff when violated.

No sibling/epic downgrade logic (deleted in v3).

If no VERSION file, skip bump and omit Version section from PR body.
