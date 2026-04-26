# Root Cause Analysis: Unsupported maxTurns runner config contract

**Issue**: #117
**Date**: 2026-04-26
**Status**: Fixed
**Author**: Codex

---

## Root Cause

Documentation drifted from the runner implementation. The current supported per-step controls are timeout, model, effort, and approval policy, but stale text and examples kept the old turn-limit concept visible.

### Affected Code

| File | Lines / Area | Role |
| --- | --- | --- |
| scripts/sdlc-config.example.json | step config examples | Removes unsupported maxTurns fields. |
| README.md | runner documentation | Removes unsupported turn-limit claims. |
| skills/upgrade-project/** | upgrade guidance | Removes stale config contract from generated docs. |
| scripts/__tests__/runner-config-contract.test.mjs | config contract tests | Prevents reintroducing unsupported fields. |

### Triggering Conditions

- A user follows the public config template.
- They expect maxTurns to constrain automation.
- The runner ignores the value because it has no implementation.

---

## Fix Strategy

### Approach

Remove unsupported maxTurns references from live docs and templates, then add a contract test that fails if the example config or README reintroduces that promise.

### Changes

| File | Change | Rationale |
| --- | --- | --- |
| scripts/sdlc-config.example.json | Delete all maxTurns keys. | Keeps sample config truthful. |
| README.md | Change runner controls wording to supported controls. | Aligns public docs with implementation. |
| skills/upgrade-project/SKILL.md and references | Remove generated upgrade guidance for maxTurns. | Prevents new projects from inheriting stale settings. |
| scripts/__tests__/runner-config-contract.test.mjs | Add template/docs assertions. | Locks the contract. |

### Blast Radius

- **Direct impact**: scripts/sdlc-config.example.json, README.md, skills/upgrade-project/SKILL.md, skills/upgrade-project/references/upgrade-procedures.md, skills/upgrade-project/references/verification.md, scripts/__tests__/runner-config-contract.test.mjs
- **Indirect impact**: SDLC runner state transitions and issue/spec gating that consume these paths
- **Risk level**: Medium before fix; Low after regression coverage

---

## Regression Risk

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Users expecting turn limits lose a documented knob | Low | The knob was never functional; removing it reduces false confidence. |

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
| #117 | 2026-04-26 | Initial defect design |
