# Root Cause Analysis: Support package-scoped publication-only upgrades

**Issue**: #388
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch/

---

## Root Cause

`scripts/sdlc-upgrade.mjs` builds publication rewrites through `publicationFilesUpgrade(root, specDirs)`, but `detectUpgrade()` always supplies the repository-wide `listSpecDirs(root)` result plus projected legacy packages. `includeIssueDependencies: false` only suppresses remote dependency detection; it is not a package selector.

`applyUpgrade()` accepts ids, recomputes the full report, routes every approved category, then unconditionally calls `backfillSpecCreatedLabels()`. A repository-wide publication id therefore cannot represent package-limited authority, and the general apply path cannot promise publication-only effects.

The existing publication item digest covers package rewrite/finding records and the `tasks.md` digest, but not repository identity, explicit selection identity, or every file in the selected package. Identical reports from another root and post-approval package inventory changes are therefore not independently rejected.

## Fix Strategy

### Approach

Add a narrow sibling contract rather than overloading `includeIssueDependencies` or weakening `applyUpgrade()`:

- `detectPublicationUpgrade(root, { specDirs })` requires exactly one package, rejects symlinked caller-root components, inventories every regular file without following symlinks, sorts repository-relative paths with a locale-independent comparator, compares issue digits as exact strings, and hashes exact root/package/inventory/rewrite/finding authority.
- `applyPublicationUpgrade(root, approvedItemId, { specDirs })` recomputes that report, acquires one exclusive fsynced root lock file, creates one unique exclusive root stage, uses `O_NOFOLLOW` where available plus regular-file identity validation, writes/fsyncs the Buffer, reruns the report, revalidates target/stage, then performs one atomic rename. It never calls `applyUpgrade()`.
- CLI commands `detect-publication` and `apply-publication` require exactly one command token and exactly one `--spec <specs/N-slug>`. Repeated specs, ambiguous arguments, and malformed approval fail before mutation. Structured transaction errors expose stable `reasonCode`, `state`, and `applied`.
- Existing unbounded `detect`/`apply`, exports, parsing, and behavior remain unchanged.

### Selection validation

The single selected package must:

1. Be one repository-relative POSIX path exactly matching `specs/[1-9][0-9]*-[a-z0-9-]+`; zero, repeated, or multiple values fail.
2. Use a caller root whose final component and every lexically traversed ancestor are symlink-free, including raw paths with `..`.
3. Resolve as a real direct child of the repository's plain `specs/` directory without symlink traversal.
4. Contain regular `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin`.
5. Declare one singular `**Issue**: #N` whose digit string exactly matches the directory prefix, plus `**Status**: Approved`, in every required file.
6. Inventory every regular file recursively and sort paths with `a.path < b.path ? -1 : a.path > b.path ? 1 : 0`.

### Approval envelope

The item remains `publication-files:<sha256>` for compatibility with approval presentation. The hashed canonical JSON contains:

- schema version and `publication-only` mode;
- canonical real repository root and the one exact package path;
- the package's complete sorted file inventory with SHA-256 digest and stable regular-file lstat identity (`device`, `inode`, `mode`, `size`);
- the exact `tasks.md` source digest/identity and compatible rewrite/finding plan.

An item exists even when no rewrites/findings exist so the selected report remains explicit. `actionable` is true only when at least one rewrite exists. Repeated detection after apply therefore has the same validated selection but `writeCount: 0` and no actionable item.

### Byte safety and transaction

`publicationFilesUpgrade()` retains its compatible report shape and reversible Latin-1 grammar view. `applySinglePublicationFile()` constructs the final output with minimal ASCII Buffer slices. The root lock is one regular `.nmg-sdlc-publication.lock` file created `O_EXCL`, written with token/pid JSON, fsynced, and bound to exact identity/bytes. `O_NOFOLLOW` is used where available, but ownership never depends on it: cleanup requires matching regular-file lstat before open, matching opened-descriptor identity, exact bytes, and matching lstat again after read. Existing, symlinked, or replaced locks—including same-token copies on another inode—are never read through, overwritten, or deleted. Partial/wrong owner bytes remain unproven. The staged output is one unique root file created exclusive and fsynced, with the same regular-file safeguards. Under the lock, apply reruns complete detection and verifies target source/identity plus stage output/identity immediately before atomic rename. Stage replacement is retained; byte mutation is rejected. Rename failure leaves the original untouched. After rename, outcome is `applied: true`; failed exact lock unlink preserves that state and the lock as evidence.

### Affected files

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-upgrade.mjs` | Add selection validation, selected report digest, dedicated APIs, CLI parsing, and side-effect-free apply | Native supported contract |
| `scripts/__tests__/sdlc-upgrade.test.mjs` | Add high-value API and CLI-compatible contract coverage | Regression proof |
| `workflows/upgrade-project/WORKFLOW.md` | Require selected publication-only commands when authorization is package-bounded | Actual workflow consumer |
| `workflows/upgrade-project/references/v3-detectors.md` | Document exports, CLI, validation, approval, and side-effect boundary | On-demand workflow contract |
| `README.md` | Document public bounded publication repair entry point | User-facing discoverability |
| `CHANGELOG.md` | Record unreleased defect fix | Repository convention |
| `specs/388-support-package-scoped-publication-only-upgrades/verification-report.md` | Record exact focused commands and results after implementation | Contribution evidence |

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Package validation rejects legitimate issue packages | Medium | Require only the documented four files/frontmatter and exactly one explicit package |
| Report ids vary by platform locale | Low | Sort the complete single-package inventory with direct string comparison |
| Symlink escapes expose outside bytes | Low | Reject symlinked roots, specs directories, package paths, and recursive entries |
| Stale or tampered bytes install | Low | Recompute full authority and directly verify target/stage identity and bytes before atomic rename |
| Lock ownership is spoofed | Low | Require exact regular-file identity and full owner bytes before unlink |
| Commit succeeds but cleanup fails | Low | Report `applied: true` and retain the valid root lock as evidence |

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Add `specDirs` to `detectUpgrade()` only | Filter publication detector while running all detectors | Report still includes unrelated phases and apply still backfills labels |
| Add `publicationOnly` boolean to `applyUpgrade()` | Branch through the existing orchestrator | Boolean combinations make authority and side effects easy to misuse |
| Accept a tasks-file path | Scope one file directly | Loses singular issue-package validation and complete-package digest binding |
| PathCast issue-number special case | Hardcode package #108 | Consumer-specific and unusable by other repositories |

## Validation Checklist

- [x] Root cause identifies the aggregate detector and unconditional backfill path
- [x] Selected publication authority is explicit and fail closed
- [x] Existing full-upgrade compatibility is preserved
- [x] Byte preservation and stale-plan behavior are testable
- [x] Workflow-bundled changes follow the skill-authoring contract

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #388 | 2026-09-13 | Initial approved design |
