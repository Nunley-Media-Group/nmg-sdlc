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
- [x] Bind exact root/package, complete sorted inventory/digests/identities, and rewrite/finding plan
- [x] Acquire one exclusive fsynced regular root lock and, within the cooperative model, validate pre-open, descriptor, post-read identity plus exact owner bytes before pathname unlink
- [x] Stage one exact Buffer output at repository root, fsync, revalidate full authority/stage, and validate final target through pre-lstat, descriptor fstat/bytes, and post-lstat before atomic rename
- [x] State that deliberate same-credential replacement after final validation inside `renameSync` or `unlinkSync` is undefined out-of-scope external interference
- [x] Report post-rename cleanup failure with `applied: true` while retaining validated lock evidence
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
- [x] Stale source bytes, changed package inventory/identity, different root/report/package, and invalid selections fail before the final validated boundary
- [x] Symlinked root, symlinked ancestor, and symlink-before-`..` spellings fail with the stable root-symlink reason
- [x] Final target validation uses one opened descriptor and rejects same-byte replacement during its read boundary before rename
- [x] Stage replacement and byte mutation detected before rename do not install unapproved bytes
- [x] Injected atomic rename failure without external interference leaves original target bytes and identity untouched
- [x] Pre-existing, symlinked, and same-token replacement locks detected before cleanup receive zero writes/deletes
- [x] Partial and wrong-byte owner setup failures retain unproven lock evidence
- [x] Post-commit lock unlink failure reports `applied: true` and retains valid owner bytes
- [x] Complete inventory order is locale-independent and large issue digits compare exactly
- [x] Invalid UTF-8, mixed line endings, duplicate findings, fenced/commented duplicate headings, escaped-backtick visibility, strict CLI, and legacy command-position parsing remain covered
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
