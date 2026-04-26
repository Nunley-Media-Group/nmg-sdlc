# Root Cause Analysis: Run-loop start-cycle destructive cleanup

**Issue**: #116
**Date**: 2026-04-26
**Status**: Fixed
**Author**: Codex

---

## Root Cause

The start-cycle step was treated as safe to begin before checking local changes. Because its prompt mixed checkout/pull with cleanup instructions, a dirty worktree risked being modified before the runner surfaced the problem.

### Affected Code

| File | Lines / Area | Role |
| --- | --- | --- |
| scripts/sdlc-runner.mjs | Step 1 precondition and start prompt | Adds clean-tree gate and removes destructive cleanup wording. |
| scripts/__tests__/sdlc-runner.test.mjs | Step 1 dirty-tree and prompt tests | Locks early halt and safe prompt text. |

### Triggering Conditions

- Worktree contains uncommitted changes.
- Runner starts at Step 1.
- Start prompt or git operation runs before clean-tree validation.

---

## Fix Strategy

### Approach

Move the clean-worktree precondition to the beginning of Step 1 and send failures through the existing failure-loop mechanism. Limit the prompt to safe checkout and fast-forward pull instructions.

### Changes

| File | Change | Rationale |
| --- | --- | --- |
| scripts/sdlc-runner.mjs | Validate clean worktree before Step 1 and adjust prompt. | Prevents mutation before user work is protected. |
| scripts/__tests__/sdlc-runner.test.mjs | Add clean/dirty Step 1 tests and prompt assertions. | Guards both behavior and wording. |

### Blast Radius

- **Direct impact**: scripts/sdlc-runner.mjs, scripts/__tests__/sdlc-runner.test.mjs
- **Indirect impact**: SDLC runner state transitions and issue/spec gating that consume these paths
- **Risk level**: High before fix; Low after regression coverage

---

## Regression Risk

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Blocking legitimate dirty generated files | Medium | Failure loop surfaces the dirty files for explicit handling instead of discarding them. |

---

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| [Alternative fix] | [approach] | [why the chosen approach is better] |

*Omit this section if only one reasonable fix approach exists.*

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
| #116 | 2026-04-26 | Initial defect design |
