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

- `detectPublicationUpgrade(root, { specDirs })` validates and canonicalizes a non-empty explicit package set, inventories every regular file without following symlinks, calculates every source digest, detects publication rewrites/findings only within that set, and returns a `publication-only` report whose item digest includes schema/mode, canonical root, sorted selections, inventories, rewrites, and findings.
- `applyPublicationUpgrade(root, approvedItemId, { specDirs })` recomputes that exact report, requires exact id equality and an actionable rewrite, validates every source byte/inventory again before any write, then delegates only to the existing byte-preserving publication line writer. It returns a selected post-detect report and never calls `applyUpgrade()`.
- CLI commands `detect-publication` and `apply-publication` require repeatable `--spec <specs/N-slug>` flags. `apply-publication` additionally requires exactly one `--approve publication-files:<digest>` value.
- Existing `detect`/`apply`, exports, and behavior remain unchanged.

### Selection validation

A selected package must:

1. Be a repository-relative POSIX path exactly matching `specs/[1-9][0-9]*-[a-z0-9-]+`.
2. Occur once after separator normalization; duplicates fail rather than deduplicate.
3. Resolve as a real direct child directory of the repository's real `specs/` directory; the root, `specs/`, package directory, and inventoried entries must not traverse symlinks.
4. Contain regular `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin` files.
5. Declare exactly one singular `**Issue**: #N` matching the directory number and `**Status**: Approved` in every required file.
6. Inventory every regular file recursively in sorted repository-relative order. Unsupported entry types fail closed. Added, removed, renamed, or changed files after approval change the item digest.

### Approval envelope

The item remains `publication-files:<sha256>` for compatibility with approval presentation. The hashed canonical JSON contains:

- schema version and `publication-only` mode;
- canonical real repository root;
- sorted canonical selected directories;
- for each selection, its sorted complete file inventory with SHA-256 digest;
- the existing exact publication package record, including `tasks.md` source digest, projected-path absence, rewrites, and findings.

An item exists even when no rewrites/findings exist so the selected report remains explicit. `actionable` is true only when at least one rewrite exists. Repeated detection after apply therefore has the same validated selection but `writeCount: 0` and no actionable item.

### Byte safety

Reuse `applyPublicationFiles()` only after exact report equality. Its line array retains each original `\r\n`, `\n`, or no-final-newline separator. It replaces only the approved line payload. The selected inventory preflight occurs before the first write so no package can be partially updated due to stale authority.

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
| Package validation rejects legitimate issue packages | Medium | Require only repository's documented four files/frontmatter; test extra regular files as bound inventory rather than rejection |
| Report ids vary by selection ordering | Low | Normalize separators and sort before hashing |
| Symlink escapes expose outside bytes | Low | Reject symlinked roots, specs directories, package paths, and recursive entries |
| A stale package partially writes | Low | Recompute whole selected report and verify every source digest before the first write |
| Dedicated apply accidentally reaches GitHub | Low | Separate function with no `run` argument; test injected/full-path backfill remains untouched and no command runner is called |
| Existing aggregate behavior changes | Low | Leave full detect/apply path in place and retain existing tests |

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
