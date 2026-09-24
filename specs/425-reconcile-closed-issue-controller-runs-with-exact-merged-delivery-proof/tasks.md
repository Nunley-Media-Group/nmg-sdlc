# Tasks: Reconcile closed issue controller runs

**Issue**: #425
**Date**: 2026-09-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/409-reconcile-independently-merged-failed-deliver-checkpoint/

### T001: Prove exact terminal delivery before admission

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Acceptance**:
- [ ] Classify the single failed prior issue, including cancelled implementation and failed delivery without a recorded #409 tuple, only with CLOSED issue, unique merged closing PR, full head/branch/default base/merge, checkpoint ancestry to PR head and merge ancestry on clean default checkout.
- [ ] Reject ambiguity, changed head, failed GitHub reads, non-default or dirty checkout, active worker/foreign lease and unrelated queued issues with exact proof diagnostics; never replay the old worker.

### T002: Archive immutable owner and controller evidence

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/sdlc-safe-recoveries.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Acceptance**:
- [ ] Persist byte-exact run, strict handoffs, verification/review/history evidence, implicated recovery-owner records and bounded owner-proven standalone sessions with digests and receipt before pointer release.
- [ ] Guard under owned lease and checkpoint CAS; preserve unrelated records and source files; collisions, symlinks and partial copies block without removing pointer.
- [ ] Repeated invocation cannot duplicate archive or consume/restart prior recovery.

### T003: Verify and deliver installed behavior

**File(s)**: `README.md`, `CHANGELOG.md`, `VERSION`, `package.json`, `scripts/__fixtures__/pennyscan-206-closed-checkpoint/`, `scripts/__fixtures__/pennyscan-217-closed-checkpoint/`, `scripts/__tests__/sdlc-execute.test.mjs`, `specs/425-reconcile-closed-issue-controller-runs-with-exact-merged-delivery-proof/`
**Type**: Modify
**Acceptance**:
- [ ] Reproduce #206 from retained evidence/PR #208 and #217 from immutable current run/handoff bytes and PR #230 proof in isolated fixtures; leave live PennyScan unchanged until post-install parent acceptance of #218.
- [ ] Run focused/full tests, candidate install, registered fresh smoke, PR checks/review and clean pinned install after exact-head merge; document verified behavior and evidence.
