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

Authorized nmg-sdlc invocations honor the exclusive repository-root publication lock. Within that cooperative model, apply detects and rejects lock, stage, target, inventory, or byte changes observed before the final validated boundary. Node provides no portable identity-conditional rename or unlink primitive: a non-cooperative same-credential actor that deliberately replaces or mutates the lock, stage, or target after its last identity/byte validation and inside the subsequent single `renameSync` or `unlinkSync` pathname syscall boundary is out of scope and constitutes undefined external interference. This contract does not claim that replacement inside either syscall boundary is impossible.

## Acceptance Criteria

### AC1: Explicit selected-package detection

**Given** a repository with publication rewrites or findings in several spec packages
**When** publication-only detection receives exactly one explicit `specs/{N}-{slug}/` selection
**Then** it inspects only that package, rejects zero or multiple selections, and does not interpret disabled dependency lookup as publication scope

### AC2: Exact digest-bound approval

**Given** one valid publication-only package rooted at a caller path with no symlinked component
**When** its approval id is computed and later applied
**Then** the digest binds the exact root, exact package path, complete locale-independent repository-relative inventory, source digests, stable lstat identities, and exact compatible rewrite/finding plan
**And** directory and frontmatter issue digits are compared exactly without numeric coercion

### AC3: Publication-only apply has no other side effects

**Given** an approved single-package publication report
**When** publication-only apply succeeds
**Then** it creates one unique token-owned `O_EXCL` staged file at repository root, using `O_NOFOLLOW` where available plus exact regular-file identity checks, writes the exact Buffer output, fsyncs it, and revalidates complete package authority under the cooperative root lock
**And** immediately before atomic rename it validates the target through one opened no-follow descriptor where supported: pre-open lstat, descriptor fstat, exact descriptor bytes, and post-read path identity; without `O_NOFOLLOW`, the same lstat/fstat/post-lstat chain supplies the cooperative proof
**And** it verifies exact staged bytes/identity before rename, and a failed `renameSync` that experiences no out-of-scope interference leaves the original `tasks.md` bytes and identity untouched
**And** its publication-only code path does not run dependency mutation, spec-created-label backfill, another upgrade phase, or any GitHub command

### AC4: Invalid or stale authority fails closed

**Given** a missing, outside-root, repeated, multiple, incomplete, wrongly named, issue-mismatched, non-Approved, or otherwise invalid selection
**Or** a root whose final component or any raw lexical ancestor—including one later collapsed by `..`—traverses a symlink
**Or** an approval from a different root, package, or report
**Or** selected package bytes, inventory, target identity/bytes, staged identity/bytes, visible duplicate task declarations, or hidden-heading visibility changed after approval
**When** detection or apply runs without out-of-scope external interference
**Then** every change observed before the final validated boundary fails before rename with a stable reason and does not install unapproved bytes
**And** the root lock is one exclusive regular `.nmg-sdlc-publication.lock` file, fsynced and guarded by pre-open/post-read lstat plus opened-descriptor identity checks, with `O_NOFOLLOW` as defense in depth where available
**And** pre-existing, partial, wrong-byte, or replaced foreign locks detected before unlink are not overwritten or deleted
**And** cleanup failure after successful rename reports `publication_files_cleanup_failed`, `state: applied_cleanup_failed`, and `applied: true` while retaining the validated lock file as ownership evidence

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
| FR3 | Bind approval to exact root/package, complete locale-independently sorted inventory/digests/identities, exact-string issue identity, and rewrite/finding plan | Must |
| FR4 | Under the cooperative filesystem model, use one exclusive fsynced regular root lock file and validate it with pre-open, descriptor, post-read identity, and exact owner bytes before pathname unlink | Must |
| FR5 | Build one exact Buffer output in a unique fsynced root-stage file; revalidate complete authority and stage, and validate the final target through pre-open lstat, descriptor fstat/bytes, and post-read identity before one atomic rename | Must |
| FR6 | Publication-only apply invokes no dependency, label, or general-upgrade code path | Must |
| FR7 | Preserve arbitrary bytes, including invalid UTF-8, outside approved ASCII declaration spans and preserve each line ending | Must |
| FR8 | Resolve the command with legacy command-position semantics first; apply strict parsing only to a resolved publication command while preserving legacy full-repository compatibility | Must |
| FR9 | Cover target read-boundary replacement, stage tampering, rename/cleanup failure, foreign/partial/replaced locks, hidden task headings, command position, inventory order, large issue digits, and prior boundaries with focused Jest and disposable exercises | Must |
| FR10 | Update public/workflow/changelog surfaces without implementation-time version bump | Must |

## Out of Scope

- Non-cooperative same-credential mutation or replacement of the lock, stage, or target after its last validation and inside `renameSync` or `unlinkSync`
- Applying any PathCast repository rewrite during this issue
- Changing the publication declaration grammar introduced by #379
- Removing or narrowing the existing full-repository upgrade behavior
- Dependency reconciliation, spec-created label mutation, or other upgrade-phase redesign
- Publishing a pull request, merging, releasing, or closing #388

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #388 | 2026-09-13 | Initial approved defect report |
