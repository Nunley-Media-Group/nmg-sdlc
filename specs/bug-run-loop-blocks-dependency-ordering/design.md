# Root Cause Analysis: Run-loop Blocks dependency ordering

**Issue**: #119
**Date**: 2026-04-26
**Status**: Fixed
**Author**: Codex

---

## Root Cause

The dependency parser did not distinguish the semantic direction of the two issue-body relationships. Depends on: #N means the current issue is blocked by #N; Blocks: #N means #N is blocked by the current issue.

### Affected Code

| File | Lines / Area | Role |
| --- | --- | --- |
| scripts/sdlc-runner.mjs | issue dependency parsing | Corrects Blocks: edge direction. |
| scripts/__tests__/select-next-issue-from-milestone.test.mjs | dependency ordering test | Asserts blocked issue waits for blocker. |

### Triggering Conditions

- An issue body uses Blocks: #N.
- Both issues are open and automatable.
- The runner builds dependency state for milestone selection.

---

## Fix Strategy

### Approach

Invert the Blocks: edge while preserving Depends on: handling. Regression tests assert that the blocker is selected before the issue it blocks.

### Changes

| File | Change | Rationale |
| --- | --- | --- |
| scripts/sdlc-runner.mjs | Correct Blocks: dependency edge creation. | Represents issue-body semantics correctly. |
| scripts/__tests__/select-next-issue-from-milestone.test.mjs | Update dependency ordering expectations. | Protects the selection order. |

### Blast Radius

- **Direct impact**: scripts/sdlc-runner.mjs, scripts/__tests__/select-next-issue-from-milestone.test.mjs
- **Indirect impact**: SDLC runner state transitions and issue/spec gating that consume these paths
- **Risk level**: High before fix; Low after regression coverage

---

## Regression Risk

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Changing ordering for existing incorrectly-authored issue bodies | Medium | The fix matches documented relationship wording; ambiguous bodies should be corrected in GitHub. |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal -- no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented
- [x] Test approach covers the reported failure mode

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #119 | 2026-04-26 | Initial defect design |
