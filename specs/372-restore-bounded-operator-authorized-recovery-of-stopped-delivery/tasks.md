# Tasks: Restore bounded operator-authorized recovery of stopped delivery

**Issue**: #372
**Date**: 2026-09-07
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/369-detect-execute-remediation-loops-and-close-workers-on-cancel/

## Summary
Four scoped tasks cover bare discovery/runtime repair, regressions, operator surface and final validation.

### T001: Implement exact-branch bare recovery and durable loop protection
**File(s)**: scripts/sdlc-execute.mjs; scripts/sdlc-status.mjs; scripts/sdlc-execute-supervisor.mjs (as needed); src/ (existing shared helpers as needed for one authoritative classifier)
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] AC1-AC5 resolve bare run to exact incomplete branch/queue, safely reclaim proven stale ownership, and preserve history/work/completed stages.
- [ ] Exhausted recovery consumes once per run/issue/step before one dispatch; repeat/concurrent invocations, commits, summaries, upgrade or another failure cannot refresh it.
- [ ] Persistence/dispatch/process-loss ambiguity stops without replay or automatic follow-on remediation.
- [ ] Intervention, branch and ownership remain fail-closed; only positively absent panes are reconciled.
- [ ] Passed handoffs settle and continue existing gates; later stages retain normal bounded policy.

### T002: Prove bare recovery and failure boundaries
**File(s)**: scripts/__tests__/sdlc-execute.test.mjs; scripts/__tests__/sdlc-status.test.mjs; scripts/__tests__/sdlc-execute-supervisor.test.mjs (as applicable); scripts/__fixtures__/ (existing fixtures only as needed)
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] AC1-AC6 and SCN001-SCN006 have behavior evidence including legacy 13-attempt state and exact linked-branch identity.
- [ ] Before/after regression proves the gap; actual isolated bare CLI exercise proves recovery dispatch once and no replay after failure/churn.
- [ ] Cover clean absence selection fallback, completed/mismatched/unreadable state, intervention and active/absent/reused/unknown ownership without weakening existing tests.

### T003: Integrate the no-parameter public command and actionable diagnostics
**File(s)**: commands/sdlc-execute.md; workflows/execute/WORKFLOW.md; workflows/execute/references/selection.md; README.md; scripts/skill-inventory.baseline.json (only if audit requires it); scripts/__tests__/sdlc-commands.test.mjs; scripts/__tests__/extension-commands.test.mjs; scripts/__tests__/plugin-surface-verification.test.mjs (existing affected command/surface tests)
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Bare invocation resolves current incomplete run before picker and requires no extra operator flags, tokens or reason entry.
- [ ] No incomplete run preserves normal selection; conflicting evidence fails closed rather than selecting another issue.
- [ ] Status/stop distinguish resumable, one-time recovery, consumed recovery and blockers; no unchanged-repeat advice after consumed failure.
- [ ] Follow skill-creator and applicable inventory/surface/exercise requirements for bundled changes.

### T004: Verify and publish scoped implementation evidence
**File(s)**: specs/372-restore-bounded-operator-authorized-recovery-of-stopped-delivery/verification-report.md; CHANGELOG.md; VERSION (delivery-owner only); package.json (delivery-owner only)
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] Use the normal-workflow minimal remote smoke fixture when required by the verification stage; it is not a local filesystem allowlist entry.
- [ ] Implementation is simplified and all implementation-owned checks pass with truthful evidence and clean commit/push/upstream equality.
- [ ] Two managed reviews/fixes, full registered final verification with fresh invocation-bound smoke, and standard exact-head merge/closure complete in their owning stages.
- [ ] Smoke proof is scoped to #372, preserves failures and stops unchanged or two-attempt no-progress experiments.
- [ ] No installed-plugin edits or unrelated nmg-sdlc #360/PennyScan #137 state mutations occur.

## Stage Ownership
Implement completes T001-T003 and its own simplification/tests/commit-push evidence. It does not impersonate review, verify or deliver. T004's downstream gates are completed by the controller's owning stages; their absence during implementation is not permission to loop, fabricate handoffs or open a PR from implement.

## Change History

| Issue | Date | Summary |
|---|---|---|
| #372 | 2026-09-07 | Initial defect specification authorized by the operator request to fix recovery and complete delivery without repeating a loop |
| #372 | 2026-09-07 | User-directed bare recovery replaces manual authorization flags throughout acceptance and tests |
| #372 | 2026-09-08 | Spec revised before delivery: clarify machine-readable file declarations and delivery ownership without changing implementation intent or acceptance criteria |
