# Tasks: Run-loop start-cycle destructive cleanup

**Issue**: #116
**Date**: 2026-04-26
**Status**: Complete
**Author**: Codex

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Fix the defect | [x] |
| T002 | Add regression test | [x] |
| T003 | Verify no regressions | [x] |

---

### T001: Fix the Defect

**File(s)**: scripts/sdlc-runner.mjs, scripts/__tests__/sdlc-runner.test.mjs
**Type**: Modify
**Depends**: None
**Acceptance**:
- [x] Bug no longer reproduces using the steps from requirements.md
- [x] Root cause from design.md is addressed, not just symptoms
- [x] No unrelated changes included in the diff

**Notes**: Follow the fix strategy from design.md. Skill-bundled file edits in this work were routed with the skill-creator guidance available in this Codex session.

### T002: Add Regression Test

**File(s)**: specs/bug-run-loop-start-cycle-destructive-cleanup/feature.gherkin, existing or new tests listed in design.md
**Type**: Create / Modify
**Depends**: T001
**Acceptance**:
- [x] Gherkin scenario reproduces the original bug condition
- [x] Scenario tagged @regression
- [x] Executable regression coverage exists in scripts/__tests__/ where applicable
- [x] Test passes with the fix applied

### T003: Verify No Regressions

**File(s)**: scripts/__tests__/, scripts/sdlc-runner.mjs, changed docs and skills
**Type**: Verify
**Depends**: T001, T002
**Acceptance**:
- [x] Full scripts test suite passes
- [x] Compatibility and inventory checks pass
- [x] No whitespace errors remain

---

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [ ] Tasks are focused on the fix — no feature work
- [ ] Regression test is included (T002)
- [ ] Each task has verifiable acceptance criteria
- [ ] No scope creep beyond the defect
- [ ] File paths reference actual project structure (per `structure.md`)## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #116 | 2026-04-26 | Initial defect tasks |
