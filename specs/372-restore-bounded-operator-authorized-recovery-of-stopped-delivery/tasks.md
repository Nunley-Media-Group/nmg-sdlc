# Tasks: Restore bounded operator-authorized recovery of stopped delivery

**Issue**: #372
**Date**: 2026-09-07
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/369-detect-execute-remediation-loops-and-close-workers-on-cancel/

## Summary
Four ordered defect tasks cover runtime repair, regression proof, operator surface and managed verification/delivery.

### T001: Implement exact single-use recovery and safe ownership reconciliation
**File(s)**: scripts/sdlc-execute.mjs; scripts/sdlc-status.mjs; scripts/sdlc-execute-supervisor.mjs only if needed; existing shared runtime helpers in src/ as required for one authoritative classifier.
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] AC1-AC5 preserve historical evidence and grant one exact authorized worker without an implicit allowance.
- [ ] Consume before dispatch; stale/concurrent/replayed/mismatched authorization and persistence failure cannot launch duplicates.
- [ ] Only positively absent pane ownership is reconciled; blocked, intervention, active and ambiguous owners stay protected.
- [ ] Passed recovery advances through existing gates; failed or ambiguous recovery cannot start automatic follow-on repair.

### T002: Add behavior-focused regressions and isolated command proof
**File(s)**: scripts/__tests__/sdlc-execute.test.mjs; scripts/__tests__/sdlc-status.test.mjs; scripts/__tests__/sdlc-execute-supervisor.test.mjs as applicable; existing fixtures in scripts/__fixtures__/ only as needed.
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] AC1-AC6 and SCN001-SCN006 have observable evidence including legacy 13-attempt checkpoints and ownership/replay boundaries.
- [ ] Focused reproduction fails before repair and passes afterward; actual isolated CLI proof records consumed-one-attempt behavior.
- [ ] Existing loop, cancellation, usage and exact-head contracts remain covered without weakened assertions.

### T003: Publish actionable operator recovery guidance
**File(s)**: commands/sdlc-execute.md; workflows/execute/; README.md; scripts/skill-inventory.baseline.json only when audit requires it; affected existing public-surface tests.
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] AC6 exposes eligible identity and exact retry command through stop/status, including cleanup blockers.
- [ ] Resume, lease recovery and authorization are distinct; automation never self-authorizes retries.
- [ ] Follow skill-creator for bundled edits and applicable inventory/surface/exercise checks.

### T004: Verify and deliver the scoped controller repair
**File(s)**: specs/372-restore-bounded-operator-authorized-recovery-of-stopped-delivery/verification-report.md; CHANGELOG.md; VERSION; package.json; minimal normal-workflow smoke fixture in the configured remote smoke repository.
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] Complete simplification, full registered tests, applicable artifact checks, fresh invocation-bound smoke, two managed reviews/fixes and final scope/architecture verification.
- [ ] Smoke changes are necessary plugin proof only; preserve failures and stop unchanged or two-attempt no-progress experiments.
- [ ] Publish clean implementation with upstream equality, then standard exact-head PR merge and issue closure; publication is intermediate, not completion.
- [ ] Preserve unrelated plugin #360 and PennyScan #137 state; actual PennyScan recovery is a later consumer action, not plugin proof.

## Implementation Handoff Boundary
T004 describes pipeline completion, not permission for implement to impersonate review/verify/deliver. The implementation worker completes T001-T003 and its implementation-owned simplification/tests/clean commit-push gates, records truthful evidence for downstream tasks, and hands off. The controller's review/fix/verify/deliver stages own their respective T004 gates. Do not loop in implement trying to open a PR or forge downstream completion.

## Change History

| Issue | Date | Summary |
|---|---|---|
| #372 | 2026-09-07 | Initial defect specification authorized by the operator request to fix recovery and complete delivery without repeating a loop |
