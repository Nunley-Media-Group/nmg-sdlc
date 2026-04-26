# Root Cause Analysis: Runner spec validation accepts unrelated specs

**Issue**: #115
**Date**: 2026-04-26
**Status**: Fixed
**Author**: Codex

---

## Root Cause

Spec lookup mixed fuzzy feature discovery with issue-bound validation. The fallback to the latest directory is useful for loose discovery, but unsafe when the current step has an issue number and needs a deterministic spec contract.

### Affected Code

| File | Lines / Area | Role |
| --- | --- | --- |
| scripts/sdlc-runner.mjs | findFeatureDir() and spec-validation callers | Adds strict mode with issue and branch context. |
| scripts/__tests__/sdlc-runner.test.mjs | strict spec lookup regression test | Rejects unrelated old specs while preserving issue frontmatter lookup. |

### Triggering Conditions

- The current issue has no matching spec directory.
- Another spec directory exists.
- A later SDLC step validates or hydrates state from specs.

---

## Fix Strategy

### Approach

Add strict lookup options for issue-bound runner paths. Accept exact feature-name, branch-slug, or frontmatter issue matches; return null instead of falling back to unrelated specs.

### Changes

| File | Change | Rationale |
| --- | --- | --- |
| scripts/sdlc-runner.mjs | Add strict findFeatureDir() matching and update issue-bound callers. | Stops stale spec selection at the shared lookup boundary. |
| scripts/__tests__/sdlc-runner.test.mjs | Add tests for unrelated spec rejection and frontmatter matching. | Protects both the failure case and legacy fallback. |

### Blast Radius

- **Direct impact**: scripts/sdlc-runner.mjs, scripts/__tests__/sdlc-runner.test.mjs
- **Indirect impact**: SDLC runner state transitions and issue/spec gating that consume these paths
- **Risk level**: High before fix; Low after regression coverage

---

## Regression Risk

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Breaking legacy specs that only match by frontmatter | Low | Strict lookup explicitly preserves issue frontmatter matching. |

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
| #115 | 2026-04-26 | Initial defect design |
