# Tasks: Recover approved-spec start and implementation

**Issue**: #418
**Date**: 2026-09-23
**Status**: Approved
**Author**: NMG

### T001: Recover released issue-branch ownership

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Acceptance**:
- [ ] Reproduce blocked start while another worktree owns the branch, then discover one safe start retry after release with exact run, head, clean scope, owner, handoff and no-worker proof (AC1).
- [ ] Archive and consume one bounded recovery before ordinary worker dispatch; changed ownership or evidence stays blocked (AC5).

### T002: Safely reconcile old approved spec branch

**File(s)**: `scripts/start-issue.mjs`, `scripts/__tests__/start-issue-controller.test.mjs`
**Type**: Modify
**Acceptance**:
- [ ] Reproduce squash-merged default and divergent old issue branch; prove source, merge/scope, exact history and upstream equality before passed handoff (AC2).
- [ ] Refuse force, conflicts, unrelated divergence or another worktree's branch; include actual branch/head on success (AC2, AC5).

### T003: Bind start head before implement

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Acceptance**:
- [ ] CAS-update checkpoint to proven synchronized handoff head across normal and retained start settlement before implement (AC3).
- [ ] Block stale, mismatched or unpushed handoff without changing checkpoint (AC5).

### T004: Resume preserved implement publication

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Acceptance**:
- [ ] Reproduce PennyScan pre-publication upstream-ahead failure and synchronized old commits with in-scope dirty implementation (AC4).
- [ ] Consume one exact owner-bound recovery to normal implementation publication; reject changed history, published implementation, foreign/ignored/denied paths and repeat dispatch (AC4, AC5).

### T005: Document and verify delivery

**File(s)**: `workflows/execute/`, `workflows/start-issue/`, `workflows/write-code/`, `commands/sdlc-execute.md`, `README.md`, `CHANGELOG.md`, `VERSION`, `package.json`, `scripts/__tests__/`
**Type**: Modify
**Acceptance**:
- [ ] Align workflow instructions and user guidance with exact-head recovery, preserving existing authority and #417 integration (AC1–AC5).
- [ ] Record pre-fix reproduction, focused/full tests, candidate install, registered smoke, review/CI and exact-head merged/pinned installation without touching PennyScan.
