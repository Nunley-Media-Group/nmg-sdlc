# Tasks: Route remediable failed verification into rN-verify

**Issue**: #354
**Date**: 2026-09-02
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/259-add-controller-owned-fresh-session-remediation-loops/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Make Fail/Partial verify handoffs remediable | [ ] |
| T002 | Add finalize regression coverage | [ ] |
| T003 | Confirm existing rem and pass paths | [ ] |

---

### T001: Make Fail/Partial verify handoffs remediable

**File(s)**: `scripts/sdlc-finalize-verification.mjs`, `workflows/verify-code/WORKFLOW.md`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `handoff(issue, status, summary, reportPath, reasonCode = null, options = {})` uses `options.intervention ?? (status !== 'passed')` and `options.artifacts ?? (passed ? [reportPath] : [])`
- [ ] Fail and Partial (`blocked` + `implementation_non_pass` + `implementationStatus` `'fail'` or `'partial'`) write `status: 'failed'`, `intervention: false`, `reasonCode: 'verification_not_ready'`, `next: null`, `artifacts: [reportPath]`
- [ ] Incomplete, unverifiable, `verification_report_invalid`, and `verification_publish_failed` still write `intervention: true`
- [ ] Lease hold still writes no handoff
- [ ] `inspectVerificationReadiness` and `isRemediableFailedHandoff` are unchanged
- [ ] Before editing `workflows/verify-code/WORKFLOW.md`, resolve and read `skill://skill-creator`, then apply the exact description and Finalize Verification closing paragraph from design.md

**Notes**: Follow the fix strategy from design.md. Keep changes minimal. Do not publish Fail/Partial reports.

### T002: Add finalize regression coverage

**File(s)**: `scripts/__tests__/sdlc-finalize-verification.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Extend the existing `report()` helper (or add a sibling) so Implementation Status can be `Fail`, `Partial`, `Incomplete`, or missing
- [ ] Fail and Partial: `outcome.status === 1`, handoff matches `{ status: 'failed', intervention: false, reasonCode: 'verification_not_ready', step: 'verify', next: null }`, `artifacts` is `['specs/42-feature/verification-report.md']`, summary contains `implementation_non_pass`, `validateHandoff(outcome.handoff)` equals the handoff, and `isRemediableFailedHandoff({ step: 'verify', state: 'idle', handoff: outcome.handoff })` is `true` (and the same for `state: 'done'`)
- [ ] Incomplete: same `reasonCode: 'verification_not_ready'` but `intervention: true` and `isRemediableFailedHandoff(...)` is `false`
- [ ] Missing Implementation Status (unverifiable): `intervention: true`, no rem
- [ ] Existing `verification_publish_failed` assertion `{ status: 'failed', intervention: true, reasonCode: 'verification_publish_failed' }` still passes
- [ ] Existing passed-path assertions still pass (`intervention: false`, `next: 'deliver'`)
- [ ] Scenarios are tagged in this package’s `feature.gherkin` with `@regression`

**Notes**: Reuse `fixture()`, `successfulRun`, and `validateHandoff` already imported from `../sdlc-execute.mjs`. Import `isRemediableFailedHandoff` from the same module. Do not add a new execute controller fixture unless a finalize-shaped handoff would otherwise be unproven; `#259` already covers `r42-verify` topology for `remediableFailedStep: 'verify'`.

### T003: Confirm existing rem and pass paths

**File(s)**: `scripts/__tests__/sdlc-finalize-verification.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/verification-readiness.test.mjs`
**Type**: Verify (no file changes)
**Depends**: T001, T002
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/sdlc-finalize-verification.test.mjs __tests__/verification-readiness.test.mjs` exits 0
- [ ] Focused execute rem cases still pass: `cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs` exits 0
- [ ] Partial/Incomplete/Fail remain `blocked` / `implementation_non_pass` in readiness tests
- [ ] No review/fix/start/deliver intervention mapping changes

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T002)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
