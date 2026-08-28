# Tasks: Select review base without interactive picker parsing

**Issue**: #292
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/291-enforce-one-controller-writer-and-close-stale-workers/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Resolve and start reviews without picker parsing | [ ] |
| T002 | Replace picker tests with deterministic ref coverage | [ ] |
| T003 | Verify review lifecycle and prompt contracts | [ ] |
| T004 | Wait for handoff after direct review submission | [ ] |
| T005 | Make review completion handoff-driven in one sibling prompt | [ ] |
| T006 | Make supported CLI entry guards symlink-safe | [ ] |

---

### T001: Fix Review Base Selection

**File(s)**: `scripts/sdlc-execute.mjs`, `workflows/review-main/WORKFLOW.md`, `README.md`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Exact `refs/heads/<default>` is preferred; exact `refs/remotes/origin/<default>` is accepted when local is absent
- [ ] Missing both refs returns `review_failed` without guessing or submitting a review
- [ ] New, retained, and remediation review paths submit one resolved-base prompt that performs host review plus artifact and handoff finalization
- [ ] Production code no longer submits `/review`, parses review picker text, lists picker candidates, or sends picker navigation keys
- [ ] Review completion is handoff-driven without idle or working-state detection
- [ ] Resolve and follow `skill://skill-creator` before editing `workflows/review-main/WORKFLOW.md`; update README wording

### T002: Add Regression Coverage

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-prompt-snippets.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Remote-only `origin/main` succeeds for review1 and review2 without `/review` prompts or picker send-keys
- [ ] Local `main` remains preferred and succeeds
- [ ] Narrow-width/long-name presentation cannot affect selection because no rendered picker is read
- [ ] Missing local and remote default refs fails `review_failed` before review submission
- [ ] Retained and remediation reviews use the same deterministic helper and still wait for handoff
- [ ] Every `@regression` scenario for behavior implemented by T001 and T002 maps to a Jest case; lifecycle scenarios introduced by T004 and T005 are covered by those tasks

### T003: Verify No Regressions

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-prompt-snippets.test.mjs`
**Type**: Verify (no file changes)
**Depends**: T002
**Acceptance**:
- [ ] Focused execute and prompt-snippet suites exit 0
- [ ] Review1, fix1, review2, fix2, retained-review, and remediation fixtures still pass
- [ ] `node scripts/verify-current-specs.mjs` and `git diff --check` exit 0

### T004: Wait for Handoff After Direct Review Submission

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] A successful direct `agentPrompt --wait` result confirms prompt submission, but review completion still requires a validated artifact-backed handoff
- [ ] Only `agent_prompt_stalled` may inspect the pasted request; no path inspects visible idle or working state
- [ ] Exact pasted-request recovery submits one Enter, never resends the review, and then waits for the handoff
- [ ] A stalled prompt without a handoff remains open while the exact owned worker exists and waits until validated handoff creation, confirmed worker disappearance, genuine failure, or cancellation
- [ ] A non-stall prompt failure returns `review_failed` without recovery waits or send-keys
- [ ] New, retained, and remediation paths retain deterministic base resolution, controller ownership, handoff validation, and pane cleanup
- [ ] Jest regressions cover accepted submission awaiting handoff, exact pasted-request recovery, and true failure

### T005: Remove State-Detection Review Completion

**File(s)**: `scripts/sdlc-execute.mjs`, `workflows/review-main/WORKFLOW.md`, `README.md`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T004
**Acceptance**:
- [ ] New, retained, and remediation review paths submit one resolved-base prompt containing host review plus artifact/handoff finalization
- [ ] A stalled prompt with skipped or narrow detection remains open while the exact owned worker is registered
- [ ] Review completion waits for the actual handoff or confirmed worker disappearance, not idle/working detection or another future transition
- [ ] Exact pasted-prompt recovery sends one Enter; cancellation, controller lease, exact base, and pane ownership remain unchanged
- [ ] Passed review handoffs name an existing non-empty canonical review artifact
- [ ] Regressions reproduce the approximately 13-second stalled/no-handoff state and prove no-findings, findings, direct failure, invalid evidence, and process-loss outcomes

### T006: Make Linked Plugin CLI Entry Detection Reliable

**File(s)**: `scripts/*.mjs`, `scripts/__tests__/sdlc-verification-runtime.test.mjs`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- [ ] Audit every supported script CLI entry guard and replace raw URL or lexical path equality with shared canonical-real-path detection
- [ ] Missing `process.argv[1]` keeps imported modules inert
- [ ] Execute `sdlc-steering.mjs` through an actual temporary plugin symlink and assert normal JSON output
- [ ] Execute `sdlc-verify-steering.mjs` through the same link and assert stdout plus `.omp/sdlc/verification/<issue>.json`
- [ ] Import both affected modules through the link and assert no stdout or artifact

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on review-base selection
- [x] Regression coverage is included
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep into controller lease, checkpoint, or delivery CAS work
- [x] File paths reference actual project structure (per `structure.md`)
