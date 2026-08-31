# Tasks: Add explicit recovery for confirmed stale controller leases

**Issue**: #328
**Date**: 2026-08-30
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/291-enforce-one-controller-writer-and-close-stale-workers/
---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Setup | 1 | [ ] |
| Backend | 2 | [ ] |
| Integration | 1 | [ ] |
| Testing | 1 | [ ] |
| **Total** | 5 | |

The implementation preserves the registered managed steering runtime and its `steering/manifest.json` verification gates; stale-lease recovery remains within the existing execute-controller boundary.

---

### T001: Parse `--recover-stale` beside existing issue tokens

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `parseArgs('#12 --recover-stale #10')` returns `{ issues: [12, 10], defaultBacklog: false, recoverStale: true }`
- [ ] `parseArgs('#12 --retain-worker --recover-stale')` returns both `retainWorker: true` and `recoverStale: true`
- [ ] Duplicate `--recover-stale` throws the usage error
- [ ] `usageError()` is exactly `Usage: /sdlc-execute [--retain-worker] [--recover-stale] [#N ...]`
- [ ] Every previous usage-string assertion in `scripts/__tests__/sdlc-execute.test.mjs` uses the new string
- [ ] Absent flag omits `recoverStale` (does not set it false)

### T002: Reclaim only a confirmed-stale same-run lease

**File(s)**: `scripts/sdlc-controller-lease.mjs`, `scripts/__tests__/sdlc-controller-lease.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Export `reclaimStaleControllerLease({ projectRoot, runId, processApi, listAgents })`
- [ ] Missing lease returns `{ reclaimed: false }` and does not create a file
- [ ] Same-run lease with `kill(pid, 0)` → `ESRCH` and successful empty/non-matching agent list unlinks the file and returns `{ reclaimed: true, record }`
- [ ] Live PID, live pane, non-ESRCH kill error, failed/unparseable list, foreign `runId`, malformed JSON, and changed bytes before unlink each throw `controller_lease_held` and leave the latest lease bytes unchanged
- [ ] Reclaim never calls `kill` with a non-zero signal, never restores snapshot bytes, and never closes a pane

### T003: Wire reclaim into execute immediately before acquire

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] `--recover-stale` runs reclaim after existing preflight and `controllerRunId` assignment and before `acquireControllerLease`
- [ ] Successful reclaim writes `Reclaimed stale controller lease.\n` into stdout and then acquires a new lease for the current process/pane
- [ ] Failed reclaim returns status 1, stderr `controller_lease_held\n`, starts no workers, and does not change run/handoff bytes
- [ ] Without `--recover-stale`, execute never probes PID/pane to unlink a foreign or leftover lease
- [ ] `--retain-worker` cleanup/retention behavior is unchanged

### T004: Carry the flag through execute workflow text

**File(s)**: `workflows/execute/WORKFLOW.md`, `workflows/execute/references/selection.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Resolve and read `skill://skill-creator` before editing these workflow-bundled files
- [ ] `WORKFLOW.md` accepts `--recover-stale` at most once among issue tokens and forwards it to `run` with selected issues
- [ ] `selection.md` strips optional `--retain-worker` and `--recover-stale` before deciding that no issue tokens remain, and appends `--recover-stale` to the `run` invocation when it was present

### T005: Cover AC1–AC4 in execute controller tests

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- [ ] AC1: seed a valid checkpoint for run R, write a same-run lease whose pid `kill(..., 0)` throws `ESRCH`, stub `listAgents` as a successful list without that pane, run `--recover-stale #N`; lease is replaced by the new controller, stdout includes `Reclaimed stale controller lease.\n`, and execute proceeds into normal startup (workers may start)
- [ ] AC2: live pid, listing failure, malformed lease, and different `runId` each return `controller_lease_held`, preserve lease and protected run/handoff bytes, and start no workers
- [ ] AC3: after observations, replace lease bytes with a different record before unlink; reclaim/execute leaves the new bytes, does not restore the old record, returns `controller_lease_held`
- [ ] AC4: same dead-looking lease without `--recover-stale` still returns `controller_lease_held`; `--retain-worker` still keeps owned panes on terminal stop

---

## Dependency Graph

```
T001 ──┬──▶ T002 ──▶ T003 ──▶ T005
       │
       └──▶ T004
```

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #328 | 2026-08-30 | Initial feature spec |
