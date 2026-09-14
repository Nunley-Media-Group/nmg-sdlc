# Tasks: Classify failed consumed-dispatch worker after post-resume cleanup

**Issue**: #395
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/394-resume-consumed-repaired-publication-dispatch-after-pane-split-failure/

---

### T001: Settle the consumed dispatch after fresh failure

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Reuse strict handoff, dispatch identity, terminal worker, and proven-owned pane cleanup checks
- [ ] Require a fresh failed intervention handoff distinct from the archived source handoff
- [ ] Remove only ephemeral `consumedDispatch` after successful worker removal and pane cleanup
- [ ] Preserve the fresh ordinary failure and handoff for existing approved intervention recovery
- [ ] Preserve dispatch state on wrong evidence, live ownership, incomplete cleanup, or cleanup failure

### T002: Preserve immutable recovery authority

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Leave original recovery tuple identity, archive identity/digest, source failure, classifier evidence, and safe-recovery record unchanged
- [ ] Allow only existing outcome fields to record the fresh stop; do not replay an invocation, consume again, append a recovery, or mint an allowance
- [ ] Prevent historical recovery class alone from selecting consumed-dispatch inspection after settlement

### T003: Regress the exact post-resume transition

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] Reproduce the behaviorally relevant revision-28 state after a fresh `implementation_failed` handoff
- [ ] Prove successful owned cleanup clears the stale dispatch while retaining the fresh failure
- [ ] Prove parameter-free discovery uses ordinary approved intervention recovery after an approved amendment
- [ ] Prove immutable recovery evidence is unchanged, old invocation is unavailable, and no hand edit is needed
- [ ] Prove malformed/stale handoff, live worker/pane, and cleanup failure retain fail-closed dispatch state
- [ ] Preserve every #394 prepared, pending, resumable, started, repeated, successful, and adversarial fixture

### T004: Document and verify the transition

**File(s)**: `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `specs/395-classify-failed-consumed-dispatch-worker-after-post-resume-cleanup/verification-report.md`
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] Document that only proven fresh-failure settlement removes ephemeral consumed-dispatch state
- [ ] Document preserved immutable authority, no replay, no minted allowance, and ordinary amended-spec recovery
- [ ] Record focused and full required verification with exact commands and outcomes
- [ ] Leave VERSION and package version unchanged before release delivery

## Traceability

| AC | Tasks |
|----|-------|
| AC1 | T001, T003 |
| AC2 | T002, T003 |
| AC3 | T001, T002, T003 |
| AC4 | T001, T003 |
| AC5 | T003 |
| AC6 | T003, T004 |
