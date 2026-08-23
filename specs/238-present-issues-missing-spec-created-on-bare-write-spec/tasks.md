# Tasks: Bare write-spec missing-spec picker

**Issue**: #238
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Helper | 1 | [ ] |
| Workflow | 1 | [ ] |
| Verification | 2 | [ ] |
| **Total** | 4 | |

---

### T001: Add missing-spec-created helper command

**File(s)**: `scripts/publish-approved-spec.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Lists open issue numbers, titles, and labels through explicit `gh` argv
- [ ] Validates the complete response and filters with exact `issueHasSpecCreatedLabel`
- [ ] Returns all missing-label rows sorted and deduplicated by issue number
- [ ] Emits `issues_unreadable` on any listing, parse, or row-shape failure and `invalid_arguments` on extras
- [ ] Leaves `candidates` unchanged

### T002: Route bare write-spec through the picker

**File(s)**: `workflows/write-spec/WORKFLOW.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Empty/whitespace arguments call the helper before any usage gate
- [ ] Non-empty numeric args bypass the picker; invalid non-empty args preserve exact usage
- [ ] Non-empty helper results ask once with at most three sorted issue chips plus exact bare Finished wording
- [ ] Valid listed/Other choice enters existing initial Discovery; invalid Other re-asks from cached rows
- [ ] Empty and failure paths stop with exact required output and no ask

### T003: Cover helper and workflow regression contracts

**File(s)**: `scripts/__tests__/publish-approved-spec.test.mjs`, `scripts/__tests__/interactive-plan-contract.test.mjs`, write-spec exercise fixtures
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] Covers label shapes/case, sorting, deduplication, empty result, malformed data, and command failure
- [ ] Covers immediate picker, option cap/order, automatic Other, invalid re-ask, and silent Finished
- [ ] Covers explicit numeric bypass, invalid non-empty usage, empty exact message, and helper failure
- [ ] Proves post-publish candidates and Finished wording are unchanged

### T004: Run full plugin verification

**File(s)**: affected workflow/helper tests and plugin-surface checks
**Type**: Modify
**Depends**: T003
**Acceptance**:
- [ ] Full scripts Jest suite passes
- [ ] Plugin-surface verification passes
- [ ] Interactive exercise proves the bare invocation's first authored action is the missing-label picker
- [ ] Explicit `/sdlc-write-spec #N` and post-publication continuation smokes remain unchanged

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #238 | 2026-08-23 | Initial defect report |
