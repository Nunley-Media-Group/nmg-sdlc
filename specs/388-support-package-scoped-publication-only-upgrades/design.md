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

The existing publication item digest covers package rewrite/finding records and the `tasks.md` digest, but not repository identity, explicit selection identity, or every file in the selected package. The first #388 implementation transiently validates recursive directory identity/listings but discards directories from the returned and hashed inventory, so replacing an empty directory—or a non-empty directory while retaining identical listing and descendant file authority—does not independently change approval.

## Fix Strategy

### Approach

Add a narrow sibling contract rather than overloading `includeIssueDependencies` or weakening `applyUpgrade()`:

- `detectPublicationUpgrade(root, { specDirs })` requires exactly one package. For every inventory directory it binds lstat identity before and after the initial deterministic listing, traverses those captured names/types, then revalidates identity and an identical deterministic listing at completion. It carries exactly one JSON-safe directory record containing repository-relative POSIX path, high-resolution identity, and captured sorted name/type listing. Every regular file remains in a separate inventory and is read through one descriptor with matching pre-open lstat, `O_RDONLY | O_NOFOLLOW` where supported, fstat, exact bytes/hash, and post-read lstat. Directory and file inventories are independently globally path-sorted; the descriptor-bound `tasks.md` Buffer is carried privately into rewrite planning and digest authority.
- `applyPublicationUpgrade(root, approvedItemId, { specDirs })` recomputes that report, acquires one exclusive fsynced root lock file, creates and fsyncs one unique exclusive root stage, then performs the uninterrupted final sequence: complete descriptor-bound package inventory/authority rerun with exact approval-id and directory-record equality, descriptor-bound target identity/byte proof, descriptor-bound staged identity/exact-output proof, descriptor-bound lock identity/exact-owner proof, and immediate atomic rename. It never calls `applyUpgrade()`.
- CLI command resolution first scans with the pre-#388 legacy command set and option-value consumption. If any legacy `detect` or `apply` command resolves, publication-command tokens in positional locations remain ignored; only when no legacy command resolves may a publication command select strict parsing.
- Existing unbounded `detect`/`apply`, exports, ignored command-looking positionals, command-named option values, and behavior remain unchanged.

### Selection validation

The single selected package must:

1. Be one repository-relative POSIX path exactly matching `specs/[1-9][0-9]*-[a-z0-9-]+`; zero, repeated, or multiple values fail.
2. Use a caller root whose final component and every lexically traversed ancestor are symlink-free, including raw paths with `..`.
3. Resolve as a real direct child of the repository's plain `specs/` directory without symlink traversal.
4. Contain regular `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin`.
5. Declare one singular `**Issue**: #N` whose digit string exactly matches the directory prefix, plus `**Status**: Approved`, in every required file.
6. Inventory every directory into one repository-relative POSIX record with high-resolution identity and deterministic name/type listing; inventory every regular file separately through one descriptor with matching pre-open lstat, descriptor fstat, exact bytes/hash, and post-read lstat; reject symlinks, nonregular entries, replacements, and duplicates; independently sort both inventories by `a.path < b.path ? -1 : a.path > b.path ? 1 : 0`.

### Approval envelope

The item remains `publication-files:<sha256>` for compatibility with approval presentation. The hashed canonical JSON contains:

- schema version and `publication-only` mode;
- canonical real repository root and the one exact package path;
- the package's complete sorted regular-file inventory with SHA-256 digest and high-resolution identity (`device`, `inode`, `mode`, `size`, `mtimeNs`, `ctimeNs`);
- the package's complete separately sorted directory inventory with repository-relative POSIX path, high-resolution identity, and captured deterministic name/type listing;
- the exact `tasks.md` source digest/high-resolution identity and compatible rewrite/finding plan.

An item exists even when no rewrites/findings exist so the selected report remains explicit. `actionable` is true only when at least one rewrite exists. Repeated detection after apply therefore has the same validated selection but `writeCount: 0` and no actionable item.

### Cooperative filesystem threat model

Authorized invocations cooperate by honoring the exclusive root lock. The final boundary completes package authority first, then proves target, stage, and lock in order immediately before `renameSync`. Node has no portable identity-conditional pathname primitive, so mutation of non-target inventory after the completed authority rerun, and non-cooperative same-credential mutation or replacement after a target, stage, or lock final proof inside the immediately following pathname syscall gap, are out-of-scope undefined external interference.

### Byte safety and transaction

`publicationFilesUpgrade()` retains its compatible report shape and reversible Latin-1 grammar view. Selected publication planning consumes the exact descriptor-bound `tasks.md` Buffer carried privately from `inventoryPublicationPackage()`; JSON reports expose file and directory metadata but no raw Buffer. Task ID discovery masks Markdown-fenced and HTML-commented headings with the same visibility semantics used for declaration validation. `applySinglePublicationFile()` constructs the final output with minimal ASCII Buffer slices. Inventory, target, and stage reads bind pre-open lstat, one no-follow descriptor where supported, fstat, exact descriptor bytes/hash, and post-read lstat. Every inventory directory emits exactly one record only after identity/listing revalidation. Directory records and regular-file records are globally path-sorted separately and both enter approval authority; final apply requires exact directory-record equality as well as exact approval-id equality before target proof.

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
| Stale or tampered bytes/directories install | Low within cooperative model | Hash separately sorted file and directory inventories; require exact directory-record and approval equality first, then prove target, stage, and lock in order immediately before atomic rename |
| Lock ownership is spoofed | Low within cooperative model | Compare high-resolution identity across pre-open/descriptor/post-read observations and exact owner bytes immediately before rename and adjacent to unlink |
| Pathname syscall gap | Undefined external interference | Exclude non-target inventory mutation after authority completion and non-cooperative target/stage/lock mutation after its final proof inside the immediately following pathname syscall gap; Node has no portable identity-conditional primitive |
| Commit succeeds but cleanup fails | Low | Report `applied: true` and retain the unproven root lock as evidence |

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
