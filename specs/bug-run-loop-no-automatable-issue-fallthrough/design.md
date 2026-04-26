# Root Cause Analysis: Run-loop no-automatable issue fallthrough

**Issue**: #114
**Date**: 2026-04-26
**Status**: Fixed
**Author**: Codex

---

## Root Cause

The issue-selection branch distinguished blocked issues from selected issues, but did not include a terminal path for issue === null with no blocked issues. That left loop control to proceed despite not having an issue to execute.

### Affected Code

| File | Lines / Area | Role |
| --- | --- | --- |
| scripts/sdlc-runner.mjs | runStep() start-issue selection | Converts empty issue selection into a terminal done result. |
| scripts/__tests__/sdlc-runner.test.mjs | start-issue empty queue test | Asserts no child Codex session is spawned. |

### Triggering Conditions

- The repository or milestone contains no open automatable issue.
- Selection returns null and no blocked issue diagnostics.
- The runner is in unattended loop mode.

---

## Fix Strategy

### Approach

Handle the empty selection as normal completion: log a clear diagnostic, update state to no active step, remove unattended mode, and return done so the main loop shuts down.

### Changes

| File | Change | Rationale |
| --- | --- | --- |
| scripts/sdlc-runner.mjs | Add no-automatable-issues terminal branch and done handling. | Prevents downstream stale-state execution. |
| scripts/__tests__/sdlc-runner.test.mjs | Add start-issue no-issue regression test. | Locks the terminal behavior and no-spawn guarantee. |

### Blast Radius

- **Direct impact**: scripts/sdlc-runner.mjs, scripts/__tests__/sdlc-runner.test.mjs
- **Indirect impact**: SDLC runner state transitions and issue/spec gating that consume these paths
- **Risk level**: Medium before fix; Low after regression coverage

---

## Regression Risk

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Masking real blocked work | Low | Blocked issue diagnostics remain on the separate blocked-issues path. |

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
| #114 | 2026-04-26 | Initial defect design |
