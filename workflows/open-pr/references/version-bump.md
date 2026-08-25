# Version Bump (v3 automatic)

**Consumed by**: open-pr.

No --major flag, no user question. Bump classification comes from the manifest-registered technical steering snippet's Versioning matrix only (label match → type, unmatched → minor). A leftover `spike` label is unmatched.

Compute new version from VERSION file.

Apply updates to:
- VERSION
- package.json (version field)
- CHANGELOG.md [Unreleased] → new versioned section
- every file declared in tech.md versioned-files table (json/toml/plain)

Stage together with delivery changes. One commit carries the bump when needed.

BREAKING detection + approved major note check happens in caller (open-pr) before bump; produces major_bump_required failed handoff when violated.

No sibling/epic downgrade logic (deleted in v3).

If no VERSION file, skip bump and omit Version section from PR body.
