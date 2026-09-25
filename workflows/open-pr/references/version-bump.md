# Version Bump (v3 automatic)

**Consumed by**: `prepare-version --issue N`, before the final verification gate.

No `--major` flag, no user question. Bump classification comes from the manifest-registered technical steering snippet's Versioning matrix only (label match → type, unmatched → minor). A leftover `spike` label is unmatched.

Compute the new version from the required root `VERSION` file.

Apply updates to:

- `VERSION`;
- `CHANGELOG.md` `[Unreleased]` → new versioned section; and
- every stack-specific file and field declared in the technical steering `## Versioning` table.

The table is the sole authority for stack-specific mirrors. JSON uses a dot-separated property path, TOML uses a dot-separated table and key, and other text files use a field locator on one unambiguous line. `package.json` is updated only when the project declares it; non-Node projects do not create or read it. Missing files, unsafe paths, missing fields, ambiguity, or values that differ from `VERSION` fail delivery before the version commit.

Stage all configured version artifacts together. A single conventional version commit carries the bump when needed. Existing matching version content and exact upstream HEAD are acknowledged without another commit or push. An unpublished exact version commit may be safely reconciled using its actual paths and subject; neither a session token nor a stale ledger grants permission. If preparation changes the source HEAD, rerun the full registered gate before delivery.

BREAKING detection and the approved-major note check happen in the caller before the bump; a violation produces a `major_bump_required` failed handoff.

No sibling/epic downgrade logic exists in v3.
