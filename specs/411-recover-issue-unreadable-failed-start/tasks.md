# Tasks: Recover issue-unreadable failed START

**Issue**: #411
**Date**: 2026-09-22
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/374-recover-bounded-automatic-delivery-stops-without-loops/

## Summary

| Task | Description | Status |
|---|---|---|
| T001 | Prove exact START failure and one-use lease-bound redispatch | [ ] |
| T002 | Exercise positive and adverse controller fixtures | [ ] |
| T003 | Verify packaged and consumer surfaces | [ ] |

### T001: Bound the original START evidence

**File(s)**: `scripts/sdlc-execute.mjs`, `workflows/execute/`, `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Read-only discovery requires original failed issue_unreadable START and fresh exact issue read, no branch mutation, clean branch/head, no worker/foreign lock or prior tuple.
- [ ] Bare execute under lease revalidates handoff bytes/identity and checkpoint, archives immutable failure, consumes one run/issue/START invocation before normal START dispatch.
- [ ] Changed, malformed, moved, foreign or consumed evidence blocks; a failed repeat does not retry; no passed handoff is invented.

### T002: Reproduce the actual boundary

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Fixture starts with valid failed START issue_unreadable and inaccessible issue, then restores issue read; discovery changes from blocked to one bounded recovery without mutations.
- [ ] Inspect archive bytes, invocation tuple and exactly one normal worker start, then failed repeat blocked.
- [ ] Exercise malformed/changed handoff, branch/head/dirty/prior branch, foreign lock, live worker and failed fresh issue read.

### T003: Delivery verification

**File(s)**: `scripts/`, `workflows/execute/`, `commands/sdlc-execute.md`, `README.md`, `CHANGELOG.md`, `VERSION`, `package.json`
**Type**: Verify
**Depends**: T001, T002
**Acceptance**:
- [ ] Focused and full scripts suites, plugin-surface validation, skill inventory and changed execute exercise pass.
- [ ] Candidate install and doctor, read-only retained MileDar evidence, and fresh registered `NMG_SDLC_SMOKE_ISSUES` smoke are separately reported, with no-progress rule enforced.
- [ ] Manual PR carries issue/spec, steering alignment, exact-path verification; exact-head merge and issue closure precede pinned merged install.
