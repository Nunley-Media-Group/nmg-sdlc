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

- `detectPublicationUpgrade(root, { specDirs })` rejects a root input whose final component or any ancestor is a symlink, validates a non-empty package set, inventories every regular file without following symlinks, calculates every source digest, detects publication rewrites/findings only within that set, and returns a `publication-only` report whose item digest includes schema/mode, exact root, sorted selections, inventories, rewrites, and findings.
- `applyPublicationUpgrade(root, approvedItemId, { specDirs })` recomputes that exact report, requires exact id equality and an actionable rewrite, acquires a project-owned mutation lock, constructs and stages every output from exact byte snapshots, revalidates complete inventory and target identities immediately before commit, and atomically renames staged outputs. Any multi-target stage or commit failure restores every original byte. It never calls `applyUpgrade()`.
- CLI commands `detect-publication` and `apply-publication` require exactly one command token and repeatable `--spec <specs/N-slug>` flags. They reject unknown options, unexpected positionals, duplicate singleton options, missing or option-like values, and extra command tokens before mutation. `apply-publication` additionally requires exactly one `--approve publication-files:<digest>` value.
- Existing `detect`/`apply`, exports, parsing, and behavior remain unchanged.

### Selection validation

A selected package must:

1. Be a repository-relative POSIX path exactly matching `specs/[1-9][0-9]*-[a-z0-9-]+`.
2. Occur once after separator normalization; duplicates fail rather than deduplicate.
3. Use a caller-supplied repository root whose final component and every lexically traversed ancestor are symlink-free; raw `.`/`..` spelling is inspected before normalization, and missing intermediate components do not stop inspection of later surviving components, so a symlink cannot disappear through `path.resolve()` or `realpathSync()`.
4. Resolve as a real direct child directory of the repository's plain `specs/` directory; the package path and inventoried entries must not traverse symlinks.
5. Contain regular `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin` files.
6. Declare exactly one singular `**Issue**: #N` matching the directory number and `**Status**: Approved` in every required file.
7. Inventory every regular file recursively in sorted repository-relative order. Unsupported entry types fail closed. Added, removed, renamed, or changed files after approval change the item digest.

### Approval envelope

The item remains `publication-files:<sha256>` for compatibility with approval presentation. The hashed canonical JSON contains:

- schema version and `publication-only` mode;
- canonical real repository root;
- for each selection, its sorted complete file inventory with SHA-256 digest and stable regular-file lstat identity (`device`, `inode`, `mode`, `size`);
- the existing exact publication package record, including `tasks.md` source digest and target identity, projected-path absence, rewrites, and findings.

An item exists even when no rewrites/findings exist so the selected report remains explicit. `actionable` is true only when at least one rewrite exists. Repeated detection after apply therefore has the same validated selection but `writeCount: 0` and no actionable item.

### Byte safety and transaction

`publicationFilesUpgrade()` uses a reversible Latin-1 view only to run the ASCII publication grammar and build byte-bound rewrite records. Ordinary unambiguous ASCII `**Files**` plus payload canonicalization remains one compatible rewrite containing its final `after`; it is not split into intermediate report records. Duplicate or otherwise unchanged blocking parser results discard every tentative rewrite for that task and retain only the finding. When opaque bytes make payload mapping unsafe, the planner permits only an exact label-span rewrite over an otherwise valid payload and retains the payload finding. `applyPublicationFiles()` verifies each exact source Buffer and lstat identity, maps each approved change to a minimal ASCII byte span, and constructs output with untouched Buffer slices; it never rebuilds the declaration line. The transaction stages original and output buffers under a project-owned lock outside selected packages. After staging, `applyPublicationUpgrade()` reruns complete selection, inventory, digest, rewrite, target identity, and byte checks under that lock immediately before commit. Each original target inode moves into the owned staging area before its replacement. If any stage write or target rename fails, no commit starts or every moved original target is renamed back, restoring bytes and identity. Cleanup requires the exact created lock-directory device/inode and, after owner metadata exists, its token. Failure while creating owner metadata therefore removes the provably self-created empty lock without touching an existing or replaced lock.

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
