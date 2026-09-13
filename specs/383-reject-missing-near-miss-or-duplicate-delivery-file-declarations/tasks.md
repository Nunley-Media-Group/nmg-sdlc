# Tasks: Reject missing, near-miss, or duplicate delivery File(s) declarations

**Issue**: #383
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Enforce declaration presence and cardinality | [ ] |
| T002 | Add parser and execute regressions | [ ] |
| T003 | Synchronize authoring and public contracts | [ ] |

---

### T001: Enforce exactly one canonical declaration

**File(s)**: `scripts/sdlc-safe-recoveries.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Every admitted task has exactly one canonical `**File(s)**:` declaration
- [ ] Missing, near-miss, and duplicate declarations fail with located `publication_scope_unproven`
- [ ] Existing declaration value grammar and non-admitted task behavior remain unchanged

### T002: Add observable regressions and exercise coverage

**File(s)**: `scripts/__tests__/sdlc-safe-recoveries.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/publish-approved-spec.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Parser and publication validation reject missing, near-miss, and duplicate declarations
- [ ] Execute fresh-run fixtures reject each defect with zero panes, workers, or bind calls
- [ ] A valid multi-task specification remains accepted
- [ ] A disposable workflow exercise reproduces the pre-fix PathCast shape and proves the fixed result

### T003: Synchronize authoring and public contracts

**File(s)**: `workflows/write-spec/WORKFLOW.md`, `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Write-spec requires exactly one canonical declaration per task before approval
- [ ] README documents missing, near-miss, and duplicate rejection before dispatch
- [ ] Unreleased changelog records the defect fix
- [ ] Skill-creator validation and repository-managed checks pass for the workflow change

---

## Validation Checklist

- [x] Tasks are focused on the defect
- [x] Regression coverage is included
- [x] Every task has exactly one canonical `**File(s)**:` declaration
- [x] File paths match repository structure
- [x] No review, delivery, or smoke authority changes are included

## Change History

| Issue | Date | Summary |
|---|---|---|
| #383 | 2026-09-13 | Initial defect tasks |
