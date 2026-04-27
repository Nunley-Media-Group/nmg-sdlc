# Tasks: Prevent start-issue prompts during unattended run-loop exec

**Issue**: #129
**Date**: 2026-04-27
**Status**: Fixed
**Author**: Codex

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Harden `start-issue` prompt gates | [x] |
| T002 | Harden runner Step 2 prompt and failure classification | [x] |
| T003 | Add regression tests | [x] |
| T004 | Verify and exercise the defect path | [x] |

---

### T001: Harden start-issue Prompt Gates

**File(s)**: `skills/start-issue/SKILL.md`, `skills/start-issue/references/stale-remote-branch.md`, `skills/start-issue/references/milestone-selection.md`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [x] Step 3 confirmation is explicitly interactive-only and skipped when `.codex/unattended-mode` exists.
- [x] Argument-supplied and runner-preselected issue paths proceed directly to branch reconciliation/creation in unattended mode.
- [x] Stale-branch and milestone-selection prompt paths remain available in interactive mode only.
- [x] Skill-bundled edits are verified against `$skill-creator` steering expectations; no additional skill-bundled autofix was needed during verification.

**Notes**: Keep the wording stack-agnostic and preserve the existing `request_user_input` gates for manual sessions.

### T002: Harden Runner Step 2 Exec Prompt and Failure Classification

**File(s)**: `scripts/sdlc-runner.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [x] The preselected issue Step 2 prompt includes explicit unattended/no-user/no-`request_user_input` instructions.
- [x] `request_user_input is not supported in exec mode` is classified as a Step 2 contract failure.
- [x] Existing branch postcondition checking remains in place and runs before Step 2 completion state is persisted.
- [x] Normal quoted historical text is not misclassified as a live failure.

### T003: Add Regression Tests

**File(s)**: `scripts/__tests__/sdlc-runner.test.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [x] A test covers the preselected issue prompt and verifies it contains non-interactive instructions.
- [x] A test covers the current Codex exec `request_user_input` error phrase.
- [x] Existing tests for benign `request_user_input` permission denials and quoted historical text still pass.

### T004: Verify and Exercise the Defect Path

**File(s)**: `scripts/__tests__/sdlc-runner.test.mjs`, `specs/bug-prevent-start-issue-prompts-during-unattended-run-loop-exec/feature.gherkin`, verification evidence
**Type**: Verify
**Depends**: T003
**Acceptance**:
- [x] `cd scripts && npm test` passes.
- [x] `node scripts/skill-inventory-audit.mjs --check` passes when skill-bundled files changed.
- [x] An unattended `start-issue` exercise or dry-run transcript verifies no `request_user_input` call is attempted.
- [x] Manual/interactive behavior is preserved by explicit interactive-only branches and existing prompt-gate tests; no live interactive session was run during automated verification.

---

## Validation Checklist

- [x] Tasks are focused on the fix; no feature work is included.
- [x] Regression test is included.
- [x] Each task has verifiable acceptance criteria.
- [x] No scope creep beyond the defect.
- [x] File paths reference actual project structure.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #129 | 2026-04-27 | Initial defect tasks |
