# Tasks: Support package-scoped publication-only upgrades

**Issue**: #388
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Implement selected publication authority | [ ] |
| T002 | Expose CLI and workflow contract | [ ] |
| T003 | Add focused regressions and fixture exercise | [ ] |
| T004 | Update public and contribution evidence | [ ] |

---

### T001: Implement selected publication authority

**File(s)**: `scripts/sdlc-upgrade.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Export `detectPublicationUpgrade` and `applyPublicationUpgrade`
- [ ] Require a non-empty explicit canonical selection of complete Approved singular issue-owned packages
- [ ] Reject roots with a symlinked final component or ancestor and reject missing, outside, duplicate, symlinked, incomplete, wrongly named, issue-mismatched, and non-Approved selections with stable reason codes
- [ ] Bind the item digest to exact root, sorted selection, every selected regular-file digest and lstat identity, and exact rewrites/findings
- [ ] Hold a project-owned mutation lock across final complete-inventory, exact-byte, and target-identity revalidation plus commit
- [ ] Build and stage every output from exact Buffer snapshots; restore every original byte and recoverable target identity after any multi-target write or rename failure
- [ ] Apply only selected publication rewrites without calling full apply, dependencies, label backfill, GitHub, or another upgrade phase
- [ ] Preserve existing `detectUpgrade` and `applyUpgrade` behavior

### T002: Expose CLI and workflow contract

**File(s)**: `scripts/sdlc-upgrade.mjs`, `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/v3-detectors.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Add `detect-publication` and `apply-publication` commands with repeatable required `--spec` flags
- [ ] Require exactly one command token and one exact publication approval id for apply
- [ ] Reject unknown options, unexpected positionals, duplicate singleton options, missing or option-like values, extra command tokens, and other ambiguous forms before mutation
- [ ] Preserve documented legacy detect/apply parsing semantics
- [ ] `/sdlc-upgrade-project` uses this entry point whenever publication authorization is package-bounded
- [ ] Workflow documentation distinguishes selected publication-only apply from full upgrade apply

### T003: Add focused regressions and fixture exercise

**File(s)**: `scripts/__tests__/sdlc-upgrade.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] Selected single-package apply leaves unselected rewrites/findings byte-identical
- [ ] Selected apply causes no spec-created-label, dependency, or GitHub side effect
- [ ] Stale source bytes, changed package inventory or identity, different root/report/selection, and invalid selections fail before mutation
- [ ] Symlinked root and symlinked ancestor paths fail with the stable root-symlink reason
- [ ] Injected second selected write or rename failure leaves every target byte-identical
- [ ] Invalid UTF-8 and mixed line endings survive exact Buffer surgery
- [ ] Duplicate recoverable task declarations remain byte-identical and produce a blocking finding
- [ ] PathCast-like T001-T004 conversion changes exactly four selected label tokens
- [ ] Second selected detection reports zero writes
- [ ] Existing aggregate tests remain green
- [ ] Run a disposable installed-source fixture with multiple unrelated dirty packages

### T004: Update public and contribution evidence

**File(s)**: `README.md`, `CHANGELOG.md`, `specs/388-support-package-scoped-publication-only-upgrades/verification-report.md`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- [ ] README documents selected detect/approve/apply commands and safety boundary
- [ ] Unreleased changelog records the defect fix without a version bump
- [ ] Verification report records exact focused commands, outcomes, changed paths, steering alignment, and remaining risks
- [ ] Plugin surface, current-spec archive, skill inventory, version synchronization, and contribution evidence checks pass

---

## Validation Checklist

- [x] Tasks are limited to package-scoped publication-only authority
- [x] Regression tests exercise observable mutation and failure boundaries
- [x] Workflow-bundled paths were identified before implementation
- [x] Existing full-upgrade behavior is explicitly preserved

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #388 | 2026-09-13 | Initial approved task plan |
