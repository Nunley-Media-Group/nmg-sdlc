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
- [ ] Reject missing, outside, duplicate, symlinked, incomplete, wrongly named, issue-mismatched, and non-Approved selections with stable reason codes
- [ ] Bind the item digest to canonical root, sorted selection, every selected regular-file digest, and exact rewrites/findings
- [ ] Recompute exact authority before any write
- [ ] Apply only selected publication rewrites without calling full apply, dependencies, label backfill, GitHub, or another upgrade phase
- [ ] Preserve existing `detectUpgrade` and `applyUpgrade` behavior

### T002: Expose CLI and workflow contract

**File(s)**: `scripts/sdlc-upgrade.mjs`, `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/v3-detectors.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Add `detect-publication` and `apply-publication` commands with repeatable required `--spec` flags
- [ ] Require one exact publication approval id for apply
- [ ] CLI argument errors fail with stable diagnostics before mutation
- [ ] `/sdlc-upgrade-project` uses this entry point whenever publication authorization is package-bounded
- [ ] Workflow documentation distinguishes selected publication-only apply from full upgrade apply

### T003: Add focused regressions and fixture exercise

**File(s)**: `scripts/__tests__/sdlc-upgrade.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] Selected single-package apply leaves unselected rewrites/findings byte-identical
- [ ] Selected apply causes no spec-created-label, dependency, or GitHub side effect
- [ ] Stale source bytes, changed package inventory, different root/report/selection, and invalid selections fail before mutation
- [ ] Mixed line endings and unrelated bytes are preserved
- [ ] PathCast-like T001-T004 conversion changes exactly four selected tokens
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
