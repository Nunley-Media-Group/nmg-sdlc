# Tasks: Replace status-only live smoke with mutable delivery verification

**Issue**: #343
**Date**: 2026-08-31
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/269-fix-project-runtime-loading-under-compiled-omp-host/
---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Provider | 1 | [ ] |
| Steering | 1 | [ ] |
| Testing | 1 | [ ] |
| **Total** | 3 | |

---

## Phase 1: Provider

### T001: Replace status-only smoke with owned execute + GitHub proof

**File(s)**: `steering/extensions/nmg-sdlc-smoke.mjs`, `steering/manifest.json`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `createSmokeProvider` is exported and the frozen extension handler is `createSmokeProvider()`
- [ ] Production manifest `repository.nmg-sdlc-smoke` config is exactly `{"issues":[30]}`; validation remains required + `when.kind=always`
- [ ] Algorithm matches design.md order; clone is `git clone --single-branch` without `--depth`
- [ ] Execute child is `process.execPath` + `scripts/sdlc-execute.mjs` + `run` + `#${n}` tokens in config order, cwd=clone, `NMG_SDLC_SMOKE_OWNED=1`
- [ ] Pass requires per-issue `gh issue view` CLOSED + exactly one `gh pr list --search linked:issue-N --state merged` MERGED with `headRefOid`; status JSON cannot pass
- [ ] Nested env, invalid config, bad origin, dirty, missing auth, missing Herdr are `failed`; clone/cancel/process_lost/launch_failed/cleanup_failed are `incomplete`
- [ ] `passed` deletes the clone; `failed`/`incomplete` retain it and record `retained smoke clone`; no `gh issue create` / remote deletes
- [ ] Cancellation still uses the file's owned-child `terminateOwnedProcessGroup` only

**Notes**: Do not edit `scripts/sdlc-execute.mjs` or delivery merge semantics. Do not use `exercise-omp`.

---

## Phase 2: Steering

### T002: Rewrite live-smoke steering as mutable delivery proof

**File(s)**: `steering/snippets/project-product.md`, `steering/snippets/project-tech.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Product **Live smoke integrity** target matches design.md exact string
- [ ] Tech consumer-smoke row, read-only sentence replacement, evidence-boundary bullet, live-smoke gate Action/Pass Criteria, and condition-evaluation sentence match design.md
- [ ] Snippets no longer say the smoke clone is read-only or that status JSON is sufficient to pass

---

## Phase 3: Testing

### T003: Add focused smoke provider regressions

**File(s)**: `scripts/__tests__/nmg-sdlc-smoke.test.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- [ ] Invalid/missing/empty/non-explicit `issues` → `failed` `nmg-sdlc-smoke issues config invalid`; no clone; no execute
- [ ] `NMG_SDLC_SMOKE_OWNED=1` → `failed` nested summary; no clone
- [ ] Origin not allowlisted → `failed`; clone retained
- [ ] Dirty porcelain → `failed`; clone retained
- [ ] Missing `gh auth` / Herdr env → `failed`
- [ ] Clone `launch_failed` → `incomplete`
- [ ] Execute `cancelled` / `process_lost` → `incomplete`; clone retained
- [ ] Two-issue config `[7,9]`: exactly one execute argv `run #7 #9` in that order; no `list-specified`; no `gh issue create`; no empty-run picker
- [ ] Stub that only returns `/sdlc-status --json` with `nextAction.command` `/sdlc-draft-issue` → `failed`
- [ ] Two-issue GitHub CLOSED+one MERGED PR+SHA each → `passed` with both extension evidence lines; `rmSync` called on the clone
- [ ] Same GitHub proof after execute nonzero → `passed` (observe already-delivered)
- [ ] Failed proof retains clone artifact path; `rmSync` not called
- [ ] `runCommand` programs never include `npm`, `pytest`, or `go`
- [ ] `cd scripts && npm test -- --runInBand __tests__/nmg-sdlc-smoke.test.mjs` exits 0

**Notes**: Import `createSmokeProvider`. Fake `runCommand`, `mkdtempSync`, `rmSync`, and `env`. Gherkin `@SCN001`–`@SCN006` are this package's scenarios; Jest is the executable evidence.

---

## Dependency Graph

```
T001 ──┬──▶ T002
       └──▶ T003
```

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #343 | 2026-08-31 | Initial feature spec |
| #343 | 2026-08-31 | Spec revised before delivery |
