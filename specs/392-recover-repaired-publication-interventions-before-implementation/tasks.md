# Tasks: Recover repaired publication interventions before implementation

**Issue**: #392
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/390-read-only-owner-bound-implementation-scope-probe/

---

### T001: Prove canonical publication repair bytes

**File(s)**: `scripts/sdlc-upgrade.mjs`, `scripts/sdlc-safe-recoveries.mjs`, `scripts/__tests__/sdlc-upgrade.test.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Reuse detector-selected rewrites rather than duplicate publication grammar
- [ ] Require one or more label-only `Files` to `File(s)` rewrites and zero findings
- [ ] Preserve every unrelated byte and original line separator
- [ ] Reject arbitrary payload, line, Unicode, EOL, or current-state differences
- [ ] Require current selected detection to converge to zero

### T002: Classify and consume repaired interventions

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/sdlc-safe-recoveries.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Bind failed run, strict handoff, exact HEAD, actual branch, one incomplete owner, and nonempty #390 scope without prose parsing
- [ ] Restrict artifacts to derived task/controller/handoff evidence; require every controller handoff filename and payload issue/step to derive from the current checkpoint queue/lifecycle; reject unrelated valid-looking handoffs and claimed implementation output
- [ ] Require task-only unstaged tracked state, no dirty allowed path, no lock, no prior record, and exact publication proof
- [ ] Structurally validate only the closed terminal goal-ledger evidence set; reject every arbitrary or partial untracked path and every basename-only ignored file such as nested `.DS_Store` outside an exact documented bounded location
- [ ] Re-prove after lease acquisition, consume one durable recovery, persist one checkpoint recovery tuple with CAS, preserve failed evidence, and dispatch only implement
- [ ] Repeat discovery never offers the consumed recovery

### T003: Add exact and adversarial recovery fixtures

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] Exact consumer-like fixture uses four canonicalized labels, stale run branch, matching exact head/owner/run, 18/12/6 scope, failed intervention handoff, and terminal goal-ledger evidence
- [ ] Discovery transitions blocked before repair, available after repair, and consumed after bare run
- [ ] Controlled Herdr boundary completes only implement and never executes product implementation
- [ ] Changed product/spec bytes, wrong identities, malformed or unrelated valid-looking controller handoffs, prior record, probe failure, staging, locks, arbitrary untracked evidence, and basename-only ignored files outside exact documented bounded locations remain blocked without mutation
- [ ] Existing loop, stale lease, retained worker, and consumed recovery behavior remains covered

### T004: Document bounded recovery behavior

**File(s)**: `CONTRIBUTING.md`, `workflows/execute/WORKFLOW.md`, `commands/sdlc-execute.md`, `README.md`, `CHANGELOG.md`, `specs/392-recover-repaired-publication-interventions-before-implementation/verification-report.md` (delivery-owner only)
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] Public and contributor docs distinguish exact repaired-publication recovery from general intervention bypass
- [ ] Execute workflow documents parameter-free discovery, under-lease revalidation, one-time consumption, preserved failure history, and implement-only dispatch
- [ ] Generated execute command remains byte-identical to the workflow renderer
- [ ] Docs state the byte, scope, staged/tracked/untracked, ownership/evidence, lock, and prior-record fail-closed boundaries
- [ ] Verification report creation or modification remains delivery-owner-only and outside worker implementation authority
- [ ] Unreleased changelog records the defect fix without changing VERSION or package version

## Traceability

| AC | Tasks |
|----|-------|
| AC1 | T002, T003 |
| AC2 | T001, T003 |
| AC3 | T002, T003 |
| AC4 | T002, T003 |
| AC5 | T001, T002, T003 |
| AC6 | T003, T004 |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #392 | 2026-09-14 | Initial approved task plan |
| #392 | 2026-09-14 | Approved amendment: shared recovery API scope, delivery-owner report, and stricter acceptance bounds |
