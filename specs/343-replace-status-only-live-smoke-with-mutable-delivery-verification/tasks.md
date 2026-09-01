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

### T001: Replace status-only smoke with owned execute + current-run GitHub proof

**File(s)**: `steering/extensions/nmg-sdlc-smoke.mjs`, `steering/manifest.json`, `scripts/sdlc-execute.mjs`, `scripts/start-issue.mjs`, `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `createSmokeProvider` is exported (deps: `runCommand`, `mkdtempSync`, `readFileSync`, `rmSync`, `env`) and the frozen extension handler is `createSmokeProvider()`
- [ ] Production manifest `repository.nmg-sdlc-smoke` config is exactly `{"issuesEnv":"NMG_SDLC_SMOKE_ISSUES"}`; validation remains required + `when.kind=always`; no `issues` array
- [ ] Algorithm matches design.md order; clone is `git clone --single-branch` without `--depth`
- [ ] Queue from `config.issues` or `env[config.issuesEnv]` parsed as unique positive safe integers in configured order; tokens `/^#?[1-9]\d*$/`
- [ ] Execute child is `process.execPath` + `scripts/sdlc-execute.mjs` + `run` + `#${n}` tokens in queue order, cwd=clone, `NMG_SDLC_SMOKE_OWNED=1`
- [ ] Each newly split `verify` pane receives only `NMG_SDLC_SMOKE_ISSUES` through Herdr `pane split --env`, with its exact invocation value and order; missing values are omitted, non-verify panes receive none, and retained verify panes are not recreated or modified
- [ ] In a provider-created single-branch clone, start-issue fetches an existing canonical remote issue branch through its exact validated non-force refspec, registers only that narrow refspec, and checks it out with tracking; absent remote branches retain normal `gh issue develop` creation
- [ ] Before execute, graphql closing-PR baseline per issue; after execute 0, require `.omp/sdlc/smoke-deliveries/<n>.json` and exactly one new MERGED PR matching recorded `pullRequest` + `headSha`; status JSON and historical PRs cannot pass
- [ ] `scripts/sdlc-deliver.mjs` writes that JSON immediately before `gh pr merge` only when `NMG_SDLC_SMOKE_OWNED=1`; merge flags unchanged
- [ ] Nested env, invalid config/env, bad origin, dirty, missing auth, missing Herdr, execute nonzero, missing current-run proof are `failed`; clone/cancel/process_lost/launch_failed/cleanup_failed are `incomplete`
- [ ] `passed` deletes the clone; `failed`/`incomplete` retain it and record `retained smoke clone`; no `gh issue create` / remote deletes
- [ ] Cancellation still uses the file's owned-child `terminateOwnedProcessGroup` only

**Notes**: Do not change exact-head merge or issue-close semantics. Do not use `exercise-omp`. Do not hard-code any smoke issue number.

---

## Phase 2: Steering

### T002: Rewrite live-smoke steering as mutable delivery proof

**File(s)**: `steering/snippets/project-product.md`, `steering/snippets/project-tech.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Product **Live smoke integrity** target matches design.md exact string
- [ ] Tech consumer-smoke row, mutate-only/fresh-queue paragraph, evidence-boundary bullet, live-smoke gate Action/Pass Criteria, condition-evaluation sentence, and `NMG_SDLC_SMOKE_OWNED` / `NMG_SDLC_SMOKE_ISSUES` env rows match design.md
- [ ] Snippets no longer say the smoke clone is read-only, that status JSON is sufficient to pass, or that production config is a hard-coded issue list

---

## Phase 3: Testing

### T003: Add focused smoke provider regressions

**File(s)**: `scripts/__tests__/nmg-sdlc-smoke.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/start-issue-controller.test.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- [ ] Invalid/missing/empty/non-explicit `config.issues` → `failed` `nmg-sdlc-smoke issues config invalid`; no clone; no execute
- [ ] `config.issuesEnv: "NMG_SDLC_SMOKE_ISSUES"` with env absent, `""`, `"#7 nope"`, or `"#7,7"` → `failed` same summary; no clone
- [ ] `NMG_SDLC_SMOKE_ISSUES: "#11, 12"` → exactly one execute argv `run #11 #12` in that order
- [ ] `NMG_SDLC_SMOKE_OWNED=1` → `failed` `nmg-sdlc-smoke nested execution blocked`; no clone
- [ ] Origin not allowlisted → `failed`; clone retained
- [ ] Dirty porcelain → `failed`; clone retained
- [ ] Missing `gh auth` / Herdr env → `failed`
- [ ] Clone `launch_failed` → `incomplete`; clone retained
- [ ] Execute `cancelled` / `process_lost` → `incomplete`; clone retained
- [ ] Two-issue config `[7,9]`: exactly one execute argv `run #7 #9`; no `list-specified`; no `gh issue create`; no empty-run picker
- [ ] Stub that only returns `/sdlc-status --json` with `nextAction.command` `/sdlc-draft-issue` (no valid delivery JSON) → `failed` missing invocation delivery proof
- [ ] Two-issue GitHub CLOSED + new MERGED PR matching each smoke-deliveries JSON → `passed` with both `kind: "github"` evidence lines; `rmSync` called on the clone
- [ ] Execute nonzero → `failed` `nmg-sdlc-smoke execute exited`; `readFileSync` not used for proof; historical GitHub state cannot pass
- [ ] Closing PR present only in the pre-run baseline → `failed` missing new exact-head merged PR proof; clone retained
- [ ] Failed proof retains clone artifact path; `rmSync` not called
- [ ] `runCommand` programs never include `npm`, `pytest`, or `go`
- [ ] No assertion or fixture hard-codes a reusable production smoke issue identity or queue
- [ ] Controller regressions prove exact verify-pane propagation, non-verify omission, missing-value omission, retained-worker preservation, and separate Herdr argv with no shell composition
- [ ] A disposable Git regression reproduces `clone --single-branch` with an existing remote issue branch and proves exact fetch, narrow tracking refspec, no force/reset, and no new-branch substitution
- [ ] `cd scripts && npm test -- --runInBand __tests__/start-issue-controller.test.mjs __tests__/sdlc-execute.test.mjs __tests__/nmg-sdlc-smoke.test.mjs` exits 0

**Notes**: Import `createSmokeProvider`. Fake `runCommand`, `mkdtempSync`, `readFileSync`, `rmSync`, and `env`. Gherkin `@SCN001`–`@SCN006` are this package's scenarios; Jest is the executable evidence.

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
| #343 | 2026-08-31 | Spec revised to env-backed fresh queue after verification |
