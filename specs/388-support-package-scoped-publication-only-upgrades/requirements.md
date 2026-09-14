# Defect Report: Support package-scoped publication-only upgrades

**Issue**: #388
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch/

---

## Reproduction

1. Create several issue-owned spec packages with non-canonical delivery-task **File(s)** declarations.
2. Run `detectUpgrade(root, { includeIssueDependencies: false })` while intending to authorize only one package.
3. Observe one repository-wide `publication-files:<digest>` item containing every package rewrite and finding.
4. Pass that id to `applyUpgrade()`.
5. Observe that the aggregate rewrites unrelated packages and `applyUpgrade()` also runs spec-created-label backfill, which may invoke GitHub.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | A supported publication-only entry point validates an explicit package selection, detects only that selection, binds approval to the root, selection, complete selected-package bytes, rewrites, findings, and source digests, and applies only the selected rewrites with no other phase or side effect. |
| **Actual** | Disabling issue-dependency lookup does not scope publication detection. The only approval item is repository-wide, and the only apply entry point also performs label backfill and other approved upgrade phases. |

## Cooperative filesystem threat model

Authorized nmg-sdlc invocations honor the exclusive repository-root publication lock. Within that cooperative model, apply detects and rejects lock, stage, target, inventory, or byte changes observed before the final validated boundary. The uninterrupted boundary first completes the package authority rerun, then proves target, stage, and lock immediately before `renameSync`. Node provides no portable identity-conditional rename or unlink primitive: mutation of non-target inventory after the completed authority rerun, or a non-cooperative same-credential actor deliberately replacing or mutating the lock, stage, or target after its respective final proof inside the immediately following pathname syscall gap, is out of scope and constitutes undefined external interference.

## Acceptance Criteria

### AC1: Explicit selected-package detection

**Given** a repository with publication rewrites or findings in several spec packages
**When** publication-only detection receives exactly one explicit `specs/{N}-{slug}/` selection
**Then** it inspects only that package, rejects zero or multiple selections, and does not interpret disabled dependency lookup as publication scope

### AC2: Exact digest-bound approval

**Given** one valid publication-only package rooted at a caller path with no symlinked component
**When** its approval id is computed and later applied
**Then** the digest binds the exact root, exact package path, complete locale-independent repository-relative regular-file inventory, and a separately globally path-sorted directory inventory whose records contain repository-relative POSIX path, deterministic name/type listing, and identity containing `device`, `inode`, `mode`, `size`, `mtimeNs`, and `ctimeNs`
**And** it binds source digests and regular-file identities containing `device`, `inode`, `mode`, `size`, `mtimeNs`, and `ctimeNs`
**And** directory and frontmatter issue digits are compared exactly without numeric coercion

### AC3: Publication-only apply has no other side effects

**Given** an approved single-package publication report
**When** publication-only apply succeeds
**Then** it inventories every directory as exactly one JSON-safe record after binding its identity before and after the initial deterministic `readdirSync`, traversing only those captured names/types, and revalidating the directory identity and identical deterministic names/types after traversal
**And** it carries those globally path-sorted directory records through detection, includes them in approval authority, and requires their exact equality during the final authority rerun
**And** it inventories every regular package file separately through one no-follow descriptor where supported, requiring matching pre-open lstat, descriptor fstat, exact descriptor bytes/hash, and post-read path identity before accepting authority
**And** rewrite planning and digest authority use the exact descriptor-bound `tasks.md` Buffer carried from that file inventory, never a later pathname reread or a Buffer exposed in JSON reports
**And** it creates one unique token-owned `O_EXCL` staged file at repository root, writes the exact Buffer output, and fsyncs it
**And** the final uninterrupted pre-rename sequence is complete descriptor-bound package inventory/authority rerun with exact approval-id equality, descriptor-bound target identity/byte proof, descriptor-bound staged identity/exact-output proof, descriptor-bound lock identity/exact-owner proof, then immediate `renameSync`
**And** a failed `renameSync` that experiences no out-of-scope interference leaves the original `tasks.md` bytes and identity untouched
**And** its publication-only code path does not run dependency mutation, spec-created-label backfill, another upgrade phase, or any GitHub command

### AC4: Invalid or stale authority fails closed

**Given** a missing, outside-root, repeated, multiple, incomplete, wrongly named, issue-mismatched, non-Approved, or otherwise invalid selection
**Or** a root whose final component or any raw lexical ancestor—including one later collapsed by `..`—traverses a symlink
**Or** an approval from a different root, package, or report
**Or** selected package bytes, directory records/identity/listing—including replacement with an identical listing and descendant bytes—file inventory, target identity/bytes, staged identity/bytes, lock identity/bytes, visible duplicate task declarations, or hidden-heading visibility changed after approval
**When** detection or apply runs without out-of-scope external interference
**Then** every change observed before the final validated boundary fails before rename with a stable reason and does not install unapproved bytes
**And** the root lock is one exclusive regular `.nmg-sdlc-publication.lock` file, fsynced and guarded by matching `dev`, `ino`, `mode`, `size`, `mtimeNs`, and `ctimeNs` across pre-open lstat, opened-descriptor fstat, and post-read lstat, plus exact owner bytes
**And** pre-existing, partial, wrong-byte, replaced, or in-place-mutated locks detected before rename or unlink are not overwritten or deleted
**And** cleanup re-reads exact owner bytes adjacent to unlink; an equal-length mutation after that descriptor read but before post-read lstat reports `publication_files_cleanup_failed`, `state: applied_cleanup_failed`, and `applied: true` while retaining the lock

### AC5: Byte preservation and convergence

**Given** selected and unrelated files containing LF, CRLF, mixed line endings, or invalid UTF-8 bytes
**When** selected publication-only apply succeeds
**Then** Buffer-based surgery changes only approved ASCII declaration spans, preserves every unrelated byte and original line ending, and repeated selected detection reports zero writes

### AC6: PathCast-shaped four-token repair

**Given** one selected package whose T001-T004 **Files** values contain four recoverable PathCast-style prose-prefixed tokens
**And** multiple unselected spec packages contain other rewrites and findings
**When** the selected report is approved and applied
**Then** exactly the four selected tokens become canonical **File(s)** declarations and every unselected package remains byte-for-byte unchanged

### AC7: Supported workflow and compatibility

**Given** `/sdlc-upgrade-project` needs bounded publication repair
**When** it renders detection and apply commands
**Then** it uses exactly one `--spec specs/N-slug` with the documented native publication-only CLI or equivalent API
**And** strict publication parsing applies only when the command resolved by legacy command-position semantics is `detect-publication` or `apply-publication`; those invocations reject repeated specs, ambiguous options, values, positionals, and extra command tokens before mutation
**And** when any legacy `detect` or `apply` command resolves, publication-command tokens in positional locations remain ignored just as unknown legacy positionals were before #388; command-named legacy option values also retain existing unbounded behavior

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Export dedicated single-package publication detect/apply APIs and equivalent CLI commands | Must |
| FR2 | Require exactly one canonical direct `specs/` child containing a complete Approved singular issue-owned package; reject symlinked caller-root components | Must |
| FR3 | Bind approval to exact root/package, separately globally path-sorted descriptor-read regular-file inventory/digests/high-resolution identities, JSON-safe directory records containing POSIX paths/high-resolution identities/deterministic name-type listings, exact-string issue identity, and rewrite/finding plan | Must |
| FR4 | Under the cooperative filesystem model, use one exclusive fsynced regular root lock file and validate exact high-resolution identity and owner bytes immediately before rename and adjacent to unlink | Must |
| FR5 | Build one exact Buffer output from the descriptor-bound inventory snapshot in a unique fsynced root-stage file; rerun complete authority and exact approval equality, then prove target, stage, and lock in that order immediately before one atomic rename | Must |
| FR6 | Publication-only apply invokes no dependency, label, or general-upgrade code path | Must |
| FR7 | Preserve arbitrary bytes, including invalid UTF-8, outside approved ASCII declaration spans and preserve each line ending | Must |
| FR8 | Resolve the command with legacy command-position semantics first; apply strict parsing only to a resolved publication command while preserving legacy full-repository compatibility | Must |
| FR9 | Cover empty and non-empty identical-listing directory replacement, directory-record order/uniqueness, inventory/target descriptor-read replacement, stage tampering, pre-rename and cleanup lock mutation/replacement, rename/cleanup failure, hidden task headings, command position, file inventory order, large issue digits, and prior boundaries with focused Jest and disposable exercises | Must |
| FR10 | Update public/workflow/changelog surfaces without implementation-time version bump | Must |

## Out of Scope

- Non-target inventory mutation after the completed authority rerun, and non-cooperative same-credential mutation or replacement of the lock, stage, or target after its respective final proof inside the immediately following pathname syscall gap
- Applying any PathCast repository rewrite during this issue
- Changing the publication declaration grammar introduced by #379
- Removing or narrowing the existing full-repository upgrade behavior
- Dependency reconciliation, spec-created label mutation, or other upgrade-phase redesign
- Publishing a pull request, merging, releasing, or closing #388

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #388 | 2026-09-13 | Initial approved defect report |
