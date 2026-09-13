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

**Given** a valid selected-package publication report
**When** its approval id is computed
**Then** the digest binds the canonical repository root, canonical sorted package set, complete regular-file inventory and source digest for every selected package file, and exact rewrite and finding content

### AC3: Publication-only apply has no other side effects

**Given** an approved selected-package publication report
**When** publication-only apply succeeds
**Then** it writes only the approved **File(s)** line rewrites in selected `tasks.md` files
**And** it never runs dependency mutation, spec-created-label backfill, another upgrade phase, or any GitHub command

### AC4: Invalid or stale authority fails closed

**Given** a missing, outside-root, duplicate, symlinked, incomplete, wrongly named, issue-mismatched, non-Approved, or otherwise non-spec selection
**Or** an approval from a different root, selection, or report
**Or** selected package bytes or inventory changed after approval
**When** detection or apply runs
**Then** it fails before mutation with a stable reason code

### AC5: Byte preservation and convergence

**Given** selected and unrelated files containing LF, CRLF, or mixed line endings
**When** selected publication-only apply succeeds
**Then** only approved line payload bytes change, every unrelated byte and original line ending remains unchanged, and repeated selected detection reports zero writes

### AC6: PathCast-shaped four-token repair

**Given** one selected package whose T001-T004 **Files** values contain four recoverable PathCast-style prose-prefixed tokens
**And** multiple unselected spec packages contain other rewrites and findings
**When** the selected report is approved and applied
**Then** exactly the four selected tokens become canonical **File(s)** declarations and every unselected package remains byte-for-byte unchanged

### AC7: Supported workflow and compatibility

**Given** `/sdlc-upgrade-project` needs bounded publication repair
**When** it renders detection and apply commands
**Then** it uses documented native publication-only CLI flags or the equivalent exported API with explicit package selections
**And** existing unbounded `detectUpgrade()` and `applyUpgrade()` behavior remains compatible

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Export dedicated selected-package publication detect/apply APIs and expose equivalent CLI commands | Must |
| FR2 | Validate selections as canonical direct children of `specs/`, complete Approved singular issue-owned packages, without following symlinks | Must |
| FR3 | Bind approval to root, sorted selection, complete selected-package file inventory/digests, rewrites, and findings | Must |
| FR4 | Recompute and compare exact live authority before any write | Must |
| FR5 | Publication-only apply invokes no dependency, label, or general-upgrade code path | Must |
| FR6 | Preserve bytes outside approved line payloads and preserve each line ending | Must |
| FR7 | Keep legacy full-repository detect/apply behavior compatible | Must |
| FR8 | Cover the specified boundaries with focused Jest and disposable installed-source exercises | Must |
| FR9 | Update public/workflow/changelog surfaces without implementation-time version bump | Must |

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
