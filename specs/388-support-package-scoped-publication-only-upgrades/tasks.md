# Tasks: Support single-package publication-only upgrades

**Issue**: #388
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Implement single-package publication authority | [x] |
| T002 | Expose CLI and workflow contract | [x] |
| T003 | Add focused regressions and actual-source fixture exercise | [x] |
| T004 | Update public and contribution evidence | [x] |

---

### T001: Implement single-package publication authority

**File(s)**: `scripts/sdlc-upgrade.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [x] Export `detectPublicationUpgrade` and `applyPublicationUpgrade`
- [x] Require exactly one complete Approved singular issue-owned package and compare issue digits exactly
- [x] Reject symlinked roots and invalid, repeated, multiple, stale, or ambiguous selections with stable reasons
- [x] Bind exact root/package, separate globally sorted regular-file records and JSON-safe directory records (POSIX path, high-resolution identity, deterministic name/type listing), and rewrite/finding plan from the privately carried descriptor-bound tasks Buffer
- [x] Acquire one exclusive fsynced regular root lock and validate matching high-resolution pre-open, descriptor, and post-read identity plus exact owner bytes immediately before rename and adjacent to unlink
- [x] Stage and fsync one exact Buffer output, then run authority/approval equality, target proof, stage proof, lock proof, and one immediate atomic rename without unrelated work between
- [x] State that non-target inventory mutation after authority completion and non-cooperative mutation after each final target/stage/lock proof inside the following pathname syscall gap are undefined out-of-scope external interference
- [x] Report post-rename cleanup failure with `applied: true` while retaining unproven lock evidence
- [x] Preserve existing `detectUpgrade` and `applyUpgrade` behavior

### T002: Expose CLI and workflow contract

**File(s)**: `scripts/sdlc-upgrade.mjs`, `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/v3-detectors.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [x] Add `detect-publication` and `apply-publication` commands requiring exactly one `--spec`
- [x] Resolve the actual command with legacy command-position semantics before deciding whether strict publication parsing applies
- [x] For a resolved publication command, require exactly one command token and one exact publication approval id for apply
- [x] Reject repeated specs, unknown options, unexpected positionals, duplicate singleton options, missing/option-like values, and extra commands before mutation
- [x] Preserve publication-command tokens in positional locations and command-named legacy option values whenever a legacy command resolves
- [x] Emit stable structured `reasonCode`, `state`, and `applied` fields for transaction failures
- [x] `/sdlc-upgrade-project` uses this entry point whenever publication authorization is package-bounded
- [x] Workflow documentation distinguishes selected publication-only apply from full upgrade apply

### T003: Add focused regressions and actual-source fixture exercise

**File(s)**: `scripts/__tests__/sdlc-upgrade.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [x] Selected single-package apply leaves unselected rewrites/findings byte-identical
- [x] Selected apply causes no spec-created-label, dependency, or GitHub side effect
- [x] Stale source bytes, empty and non-empty identical-listing directory replacement after approval, directory replacement before or during recursive traversal, late directory entries, descriptor-read package file replacement, different root/report/package, and invalid selections fail before the final validated boundary
- [x] Symlinked root, symlinked ancestor, and symlink-before-`..` spellings fail with the stable root-symlink reason
- [x] Final target validation uses one phase-gated final opened descriptor and rejects same-byte replacement during the authority rerun or its read boundary before rename
- [x] Stage replacement and byte mutation during the authority rerun are detected by final descriptor-bound stage proof and do not install unapproved bytes
- [x] Lock replacement and same-size mutation detected by final lock proof cause zero target renames and retain inspection evidence
- [x] Injected atomic rename failure without external interference leaves original target bytes and identity untouched
- [x] Pre-existing, symlinked, and same-token replacement locks detected before cleanup receive zero writes/deletes
- [x] Partial and wrong-byte owner setup failures retain unproven lock evidence
- [x] Post-commit unlink failure and equal-length mutation after cleanup owner read report `applied: true` and retain the lock
- [x] Invalid UTF-8, mixed line endings, duplicate findings, fenced/commented duplicate headings, escaped-backtick visibility, strict CLI, and legacy command-position parsing remain covered
- [x] Directory records are separately globally path-sorted, contain no duplicates or raw Buffers, and deterministically preserve captured name/type order
- [x] Run a disposable actual-source fixture with unrelated dirty packages; do not install

### T004: Update public and contribution evidence

**File(s)**: `README.md`, `CHANGELOG.md`, `specs/388-support-package-scoped-publication-only-upgrades/verification-report.md`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- [x] README documents selected detect/approve/apply commands and safety boundary
- [x] Unreleased changelog records the defect fix without a version bump
- [x] Verification report records exact focused commands, outcomes, changed paths, steering alignment, and remaining risks
- [x] Plugin surface, current-spec archive, skill inventory, version synchronization, and contribution evidence checks pass

---

## Validation Checklist

- [x] Tasks are limited to package-scoped publication-only authority
- [x] Regression tests exercise observable mutation and failure boundaries
- [x] Workflow-bundled paths were identified before implementation
- [x] Existing full-upgrade behavior is explicitly preserved

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #388 | 2026-09-13 | Approved single-package task plan completed with verified actual-source evidence |
