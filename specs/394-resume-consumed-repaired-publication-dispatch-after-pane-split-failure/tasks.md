# Tasks: Resume consumed repaired-publication dispatch after pane split failure

**Issue**: #394
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/392-recover-repaired-publication-interventions-before-implementation/

---

### T001: Define pending consumed-dispatch state

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/sdlc-safe-recoveries.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Add a closed schema for one exact repaired-publication pending dispatch
- [ ] Bind run, invocation, class, issue, implement step, HEAD, branch, archive path/digest, pane, worker name, and disposition
- [ ] Reject unknown, mismatched, duplicate, started, or cross-class pending state
- [ ] Preserve existing run identity and checkpoint CAS behavior

### T002: Preflight panes before first consumption

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Derive split direction from the actual controller pane geometry
- [ ] Allocate and validate the standard worker pane before archive or safe-recovery consumption
- [ ] Make split failure leave recovery, run, handoff, archive, task, and product bytes unchanged
- [ ] Close only an attempt-owned pane proven unused when later pre-consumption validation fails

### T003: Discover exact stranded consumed dispatches

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Recognize only stopped `pane_split_failed` compatibility state or an exact pending dispatch for one consumed repaired-publication invocation
- [ ] Reuse #392 run, owner, HEAD, branch, scope, publication, handoff, task, worktree, evidence, lock, and product-clean proofs
- [ ] Require byte-exact immutable archive identity/hash, incomplete owner, empty workers, and absent matching pane/agent
- [ ] Return distinct `consumed-dispatch-available` only for parameter-free discovery
- [ ] Block every mismatch, explicit selector, duplicate resume, and non-pane failure without mutation

### T004: Resume the same invocation once

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/sdlc-execute-supervisor.mjs`
**Type**: Modify
**Depends**: T002, T003
**Acceptance**:
- [ ] Re-prove under lease and allocate a fresh standard pane from actual controller geometry
- [ ] Persist exact pending/start disposition by CAS before agent start
- [ ] Never call `consumeSafeRecovery`, append a recovery tuple, replace the invocation, or enter remediation
- [ ] Start only standard `s${issue}-implement`
- [ ] Preserve deterministic split/persist/start crash recovery and make successful start immediately non-offerable
- [ ] Clear only ephemeral pending dispatch after a validated successful implement handoff so next-step and terminal checkpoint schemas remain valid
- [ ] Retain the consumed safe-recovery record and immutable run recovery after successful completion
- [ ] Validate all current run/issue/step recovery tuples before class filtering and block wrong-class or additional tuples
- [ ] Make supervisor hard-loss cleanup preserve original implementation failure, close only the exact attempt-owned unused pane, and retain resumable state
- [ ] Persist prompt-path worker disappearance as same-dispatch `process_lost`
- [ ] Fail malformed controller layout before split, archive, or consumption

### T005: Add exact and adversarial fixtures

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-execute-supervisor.test.mjs`
**Type**: Modify
**Depends**: T001, T002, T003, T004
**Acceptance**:
- [ ] Model exact revision-14 issue-108 invocation and archive state without runtime special cases
- [ ] Cover split failure before consumption, start failure after consumption, pending discovery/resume, successful `s108-implement` start, and repeat unavailability
- [ ] Cover mutated/missing archive, run/HEAD/branch/owner/handoff/task/product drift, complete owner, worker/pane/agent presence, wrong invocation, duplicate resume, lock, selector, and non-pane failure
- [ ] Assert blocked paths do not mutate run, recovery, handoff, archive, task, product, or workflow evidence
- [ ] Preserve all existing #392 and other recovery fixtures
- [ ] Use real supervised processes and `SIGKILL` at prepared CAS, post-safe-consume/pre-run-tuple CAS, and pending-CAS/pre-worker-persist boundaries
- [ ] At each hard-loss boundary assert original implementation failure is preserved, only the exact attempt-owned unused pane is closed, and the same invocation remains resumable
- [ ] Cover prompt-path `process_lost`, malformed layout before any split/consume call, and wrong-class/additional current recovery tuples

### T006: Document fail-closed same-invocation semantics

**File(s)**: `CONTRIBUTING.md`, `workflows/execute/WORKFLOW.md`, `workflows/execute/references/selection.md`, `commands/sdlc-execute.md`, `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T002, T003, T004, T005
**Acceptance**:
- [ ] Document actual main-controller-pane geometry and pre-consumption allocation
- [ ] Document parameter-free same-invocation resumption and distinct discovery state
- [ ] Document archive, identity, owner, worker/pane absence, crash, cleanup, and explicit-selector fail-closed boundaries
- [ ] Keep generated execute command synchronized with workflow source
- [ ] Record the defect fix without changing VERSION or package version

### T007: Record complete verification evidence

**File(s)**: `specs/394-resume-consumed-repaired-publication-dispatch-after-pane-split-failure/verification-report.md`
**Type**: Create
**Depends**: T005, T006
**Acceptance**:
- [ ] Record focused execute/recovery and full Jest outcomes
- [ ] Record command sync, plugin/current-spec, 43-item inventory, contribution, version, and diff outcomes
- [ ] Record exact branch, base, verified head, commits, changed paths, state-machine transitions, and residual risks
- [ ] Keep every claim tied to observed command output
- [ ] Record reviewer/tool identity, exact command or invocation, exact scoped paths, reviewed pre-report implementation SHA/tree, outcome, and every finding or explicit no-findings result
- [ ] Prove the reviewed implementation SHA is the direct parent of the final report commit
- [ ] Keep the final report commit free of its own SHA and report that exact SHA from Git only after commit

## Traceability

| AC | Tasks |
|----|-------|
| AC1 | T002, T005 |
| AC2 | T001, T002, T005 |
| AC8 | T001, T003, T004, T005 |
| AC3 | T001, T003, T005 |
| AC4 | T004, T005 |
| AC5 | T002, T004, T005 |
| AC6 | T003, T004, T005 |
| AC7 | T005, T006, T007 |
| AC9 | T007 |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #394 | 2026-09-14 | Initial approved task plan |
| #394 | 2026-09-14 | Approved amendment authorizing supervisor cleanup and supervised hard-loss fixtures |
