# Root Cause Analysis: Run-loop nested Codex sandbox inheritance

**Issue**: #113
**Date**: 2026-04-26
**Status**: Fixed
**Author**: Codex

---

## Root Cause

runCodex() built its child process options from the parent process environment without filtering host-only sandbox controls. That made CODEX_SANDBOX, CODEX_SANDBOX_NETWORK_DISABLED, and CODEX_SANDBOX_SEATBELT_PROFILE part of the nested Codex session contract even though those variables describe the current host execution context, not the intended child workflow.

### Affected Code

| File | Lines / Area | Role |
| --- | --- | --- |
| scripts/sdlc-runner.mjs | buildCodexEnv(), runCodex() | Builds the child Codex process environment and spawn options. |
| scripts/__tests__/sdlc-runner.test.mjs | buildCodexEnv regression test | Locks sandbox stripping and unrelated environment preservation. |

### Triggering Conditions

- Parent environment contains one or more Codex sandbox variables.
- Runner launches a child Codex step through runCodex().
- The child needs normal git, filesystem, or network behavior.

---

## Fix Strategy

### Approach

Introduce a narrow environment builder that copies the parent environment, removes known Codex sandbox controls, and pass that environment to spawn(). Keep all unrelated variables unchanged so auth and user configuration continue to work.

### Changes

| File | Change | Rationale |
| --- | --- | --- |
| scripts/sdlc-runner.mjs | Add INHERITED_CODEX_SANDBOX_ENV, buildCodexEnv(), and use it in runCodex(). | Removes the failing inherited state at the only child-spawn boundary. |
| scripts/__tests__/sdlc-runner.test.mjs | Add coverage that sandbox variables are stripped and normal variables remain. | Prevents regression in the spawn contract. |

### Blast Radius

- **Direct impact**: scripts/sdlc-runner.mjs, scripts/__tests__/sdlc-runner.test.mjs
- **Indirect impact**: SDLC runner state transitions and issue/spec gating that consume these paths
- **Risk level**: High before fix; Low after regression coverage

---

## Regression Risk

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Accidentally dropping auth or PATH variables | Low | Regression test asserts unrelated variables survive. |

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
| #113 | 2026-04-26 | Initial defect design |
