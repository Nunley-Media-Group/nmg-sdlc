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

## Acceptance Criteria

### AC1: Explicit selected-package detection

**Given** a repository with publication rewrites or findings in several spec packages
**When** publication-only detection receives one or more explicit `specs/{N}-{slug}/` selections
**Then** it inspects only those exact packages and does not interpret disabled dependency lookup as publication scope

### AC2: Exact digest-bound approval

**Given** a valid selected-package publication report rooted at a caller path with no symlinked component
**When** its approval id is computed and later committed under the project mutation lock
**Then** the digest binds the exact root, canonical sorted package set, complete regular-file inventory, source digest, and stable lstat identity for every selected package file, plus exact compatible rewrite and finding content

### AC3: Publication-only apply has no other side effects

**Given** an approved selected-package publication report
**When** publication-only apply succeeds
**Then** it constructs every output from exact byte snapshots, stages all outputs, revalidates complete inventory, exact bytes, and target lstat identities immediately before commit, and writes only approved minimal ASCII spans in selected `tasks.md` files
**And** a failed multi-target stage or commit restores every original byte and recoverable original target identity
**And** it never runs dependency mutation, spec-created-label backfill, another upgrade phase, or any GitHub command

### AC4: Invalid or stale authority fails closed

**Given** a missing, outside-root, duplicate, incomplete, wrongly named, issue-mismatched, non-Approved, or otherwise non-spec selection
**Or** a root whose final component or any ancestor traverses a symlink
**Or** an approval from a different root, selection, or report
**Or** selected package bytes, inventory, target identity, or duplicate task declarations changed after approval or during staging
**When** detection or apply runs
**Then** it fails before commit with a stable reason code and removes artifacts only when lock ownership is proven

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
**Then** it uses documented native publication-only CLI flags or the equivalent exported API with explicit package selections
**And** each new CLI invocation requires exactly one command token and rejects ambiguous options, values, and positionals before mutation
**And** existing unbounded `detectUpgrade()` and `applyUpgrade()` parsing and behavior remain compatible

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Export dedicated selected-package publication detect/apply APIs and expose equivalent CLI commands | Must |
| FR2 | Validate selections as canonical direct children of `specs/`, complete Approved singular issue-owned packages, and reject a caller root whose final component or any ancestor traverses a symlink | Must |
| FR3 | Bind approval to exact root, sorted selection, complete selected-package file inventory/digests, rewrites, and findings | Must |
| FR4 | Hold a project-owned lock across final complete-inventory and target-identity revalidation plus commit | Must |
| FR5 | Construct and stage all outputs from exact byte snapshots; rollback every original byte after any multi-target stage or commit failure | Must |
| FR6 | Publication-only apply invokes no dependency, label, or general-upgrade code path | Must |
| FR7 | Preserve arbitrary bytes, including invalid UTF-8, outside approved ASCII declaration spans and preserve each line ending | Must |
| FR8 | New publication commands reject ambiguous syntax before mutation while legacy full-repository parsing remains compatible | Must |
| FR9 | Cover the specified boundaries with focused Jest and disposable installed-source exercises | Must |
| FR10 | Update public/workflow/changelog surfaces without implementation-time version bump | Must |

## Out of Scope

- Applying any PathCast repository rewrite during this issue
- Changing the publication declaration grammar introduced by #379
- Removing or narrowing the existing full-repository upgrade behavior
- Dependency reconciliation, spec-created label mutation, or other upgrade-phase redesign
- Publishing a pull request, merging, releasing, or closing #388

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #388 | 2026-09-13 | Initial approved defect report |
