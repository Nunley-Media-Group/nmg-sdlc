# Tasks: Honor and resume selected issues from the empty /sdlc-execute picker

**Issue**: #231
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/223-apply-spec-created-after-specs-exist-and-gate-execute-selection/

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Picker | 4 | [ ] |
| Resume | 2 | [ ] |
| Verification | 3 | [ ] |
| **Total** | 9 | |

---

### T001: Correct the empty execute picker contract

**File(s)**: `workflows/execute/references/selection.md`, generated command only if entrypoint changes
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Read `skill://skill-creator` before editing
- [ ] One built-in multi-select ask has no recommended option and no Cancel chip
- [ ] Up to four lowest-numbered issue chips are authored and every eligible issue is listed
- [ ] Empty or invalid-only Continue reopens the same picker
- [ ] Selected chips and Other tokens produce ordered deduplicated `#N` argv
- [ ] Exactly one eligible issue remains interactive and starts only after selection

### T002: Embed the picker in the packaged execute command

**File(s)**: `src/sdlc-commands.mjs`, `workflows/execute/WORKFLOW.md`, `commands/sdlc-execute.md`, `scripts/__tests__/extension-commands.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] The renderer appends the installed execute selection reference only to `sdlc-execute`
- [ ] The execute entrypoint points to the packaged section, not a working-directory-relative file
- [ ] Generated command synchronization is byte-for-byte
- [ ] Consumer-project smoke loads branch instructions without working-tree or GitHub lookup

### T003: Normalize OMP-expanded explicit issue tokens

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `N`, `#N`, `issue://N`, and `pr://N` resolve to the same positive safe integer
- [ ] Mixed forms preserve order and first-occurrence deduplication
- [ ] Unrelated schemes, paths, authorities, and nonnumeric URI values remain usage errors
- [ ] Existing 20-issue and eligibility gates remain unchanged

### T004: Add executable picker interaction coverage

**File(s)**: existing workflow contract test or focused new test beside execute tests
**Type**: Modify or Create
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] Covers first chip, another chip, multiple chips, chip plus Other, dedupe, empty Continue, invalid Other, and exactly one eligible issue
- [ ] Proves exact controller argv rather than only checking Markdown substrings
- [ ] Preserves explicit-token bypass after OMP transport normalization

### T005: Add a pure remediation transition

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Accepts only validated matching failed/intervention handoffs with same-or-earlier supported `next`
- [ ] Returns the completed prefix strictly before the target
- [ ] Rejects null, unknown, forward, mismatched, malformed, and passed/non-intervention transitions

### T006: Resume a retained failed worker at its requested gate

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T005
**Acceptance**:
- [ ] First failure observation still reports failure, retains the pane, and stops
- [ ] Later explicit resume closes an idle/done retained pane only after accepting its remediation transition
- [ ] Durable state stays on the current issue and starts the target worker
- [ ] Downstream completion is invalidated and later issues do not advance
- [ ] Close failure and active workers remain fail-closed

### T007: Add controller regression coverage

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T005, T006
**Acceptance**:
- [ ] Failed verify to implement preserves queue then resumes implement
- [ ] Reviews, fixes, verify, and deliver rerun after rewind
- [ ] Invalid transitions, active worker, and pane close failure preserve recoverable state
- [ ] Ordinary passed handoff and resume behavior remain green

### T008: Run focused automated verification

**File(s)**: execute, command synchronization, and workflow contract tests
**Type**: Verify
**Depends**: T004, T007
**Acceptance**:
- [ ] Focused Jest suites exit 0
- [ ] Rendered command byte and synchronization contracts remain green
- [ ] Handoff validator accepts every exercised fixture handoff

### T009: Exercise the real Herdr OMP TUI and remediation path

**File(s)**: `specs/231-honor-and-resume-selected-issues-from-the-empty-sdlc-execute-picker/verification-report.md`
**Type**: Create
**Depends**: T008
**Acceptance**:
- [ ] A real TUI selection reaches built-in ask, workflow token conversion, and controller invocation
- [ ] First-chip, another-chip, empty Continue, exactly-one, and chip-plus-Other behavior are observed
- [ ] Consumer-project execution uses the packaged branch picker with no reference lookup
- [ ] OMP's explicit `#N` transport expansion is observed and normalized by controller tests
- [ ] Failed verify with `next: implement` resumes all affected gates without advancing a later issue
- [ ] Every new execute finding is incorporated into this spec and fixed before delivery

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #231 | 2026-08-23 | Initial implementation and verification plan |