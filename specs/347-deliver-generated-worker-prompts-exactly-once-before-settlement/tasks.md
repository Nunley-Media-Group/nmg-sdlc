# Tasks: Deliver generated worker prompts exactly once before settlement

**Issue**: #347
**Date**: 2026-08-31
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/
---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Fix | 1 | [ ] |
| Testing | 1 | [ ] |
| **Total** | 2 | |

---

### T001: Prove live session and deliver generated prompt once before observation

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [x] Persist versioned `pending` ownership for fresh standard, review, and remediation workers
- [x] Persist `activating` immediately after one accepted prompt and before bounded activation
- [x] Persist `delivered` only after working/blocked or a valid expected handoff proves activation
- [x] Persist `pending` on activation exhaustion and retain the pane as `prompt_pending`
- [x] Resume `activating` through bounded activation without calling `agentPrompt`
- [x] Prevent the retained review path from re-prompting after resumed activation
- [x] Validate supported checkpoint states and migrate unversioned `delivered` to `activating`
- [x] Preserve exact canonical prompt delivery, the controller OMP large-paste overlay, and positive-visibility-only Enter recovery

**Notes**: Missing delivery state remains legacy unknown. Versioned `delivered` is the only state that authorizes normal missing-handoff settlement and close behavior.

---

### T002: Add start-then-prompt delivery regressions

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [x] Standard delayed idle → working records persisted `activating`, one prompt, no Enter, and normal completion
- [x] Review delayed idle → working records persisted `activating`, one protocol prompt, no Enter, and valid review completion
- [x] Remediation delayed idle → working records persisted `activating`, one prompt, no Enter, and normal completion
- [x] Simulated controller failure after accepted submission leaves versioned `activating` and retains the pane
- [x] The next invocation resumes that activation without another generated prompt and completes the interrupted step
- [x] Activation exhaustion persists `pending`, returns `prompt_pending`, and never closes on initial idle/done
- [x] Unversioned legacy `delivered` migrates through activation without re-prompting
- [x] Invalid prompt delivery states fail checkpoint validation
- [x] `cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs` exits 0

**Notes**: Reuse `makeControllerFixture` / injected `herdr`. Jest is the executable crash-boundary evidence.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #347 | 2026-08-31 | Initial defect report |
| #347 | 2026-09-01 | Add activation checkpoint, migration, and crash-resume coverage |
