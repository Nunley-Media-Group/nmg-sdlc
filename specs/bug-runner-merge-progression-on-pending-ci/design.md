# Root Cause Analysis: Runner merge progression on pending CI

**Issue**: #118
**Date**: 2026-04-26
**Status**: Fixed
**Author**: Codex

---

## Root Cause

Check parsing looked for failure text but did not separately detect non-terminal states. In CI gating, absence of failure is not success; queued or in-progress checks must halt progression.

### Affected Code

| File | Lines / Area | Role |
| --- | --- | --- |
| scripts/sdlc-runner.mjs | checksIndicatePending(), validate-ci and merge preconditions | Detects pending states and blocks progression. |
| scripts/__tests__/sdlc-runner.test.mjs | pending-check regression tests | Covers parser and precondition behavior. |

### Triggering Conditions

- GitHub reports checks in pending/queued/waiting/in-progress state.
- Runner evaluates validate-ci or merge preconditions.
- The output does not include explicit failure text.

---

## Fix Strategy

### Approach

Add pending-state parsing alongside failure-state parsing and apply it wherever the runner decides CI readiness.

### Changes

| File | Change | Rationale |
| --- | --- | --- |
| scripts/sdlc-runner.mjs | Add and use checksIndicatePending(). | Makes non-terminal checks block progression. |
| scripts/__tests__/sdlc-runner.test.mjs | Add pending parser, validate-ci, and merge tests. | Prevents premature merge regressions. |

### Blast Radius

- **Direct impact**: scripts/sdlc-runner.mjs, scripts/__tests__/sdlc-runner.test.mjs
- **Indirect impact**: SDLC runner state transitions and issue/spec gating that consume these paths
- **Risk level**: High before fix; Low after regression coverage

---

## Regression Risk

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| False positives from unrelated output containing pending words | Low | Parser targets common gh check status terms and remains paired with existing failure handling. |

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
| #118 | 2026-04-26 | Initial defect design |
