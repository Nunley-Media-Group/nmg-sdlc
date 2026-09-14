# Tasks: Read-only owner-bound implementation scope probe

**Issue**: #390
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/383-reject-missing-near-miss-or-duplicate-delivery-file-declarations/

---

### T001: Implement structured scope and read-only owner probe

**File(s)**: `scripts/sdlc-safe-recoveries.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Scope has exactly the five approved keys and never grants spec inputs writable authority
- [ ] Operations, task/source provenance, read-only inputs, explicit untracked evidence, duplicate reduction, and Create-then-Modify are deterministic
- [ ] `probePublicationScope` validates actual branch, current run, and one matching owner without locks or writes
- [ ] `probe` CLI accepts only the owner-bound implementation arguments and surfaces discrepancies
- [ ] Missing, ambiguous, unsupported, duplicate, and unsafe inputs fail closed with stable diagnostics

### T002: Migrate controller and publication consumers

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/sdlc-apply-review.mjs`, `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Execute preflight consumes structured inspection and establishes the implement owner under the controller lease at branch-bound dispatch
- [ ] Review-fix and delivery mergeability publication checks authorize only `scope.allowedPaths`
- [ ] No consumer re-adds spec files or reconstructs a flat allowlist

### T003: Prove exact PathCast and fail-closed behavior

**File(s)**: `scripts/__fixtures__/pathcast-108-publication-scope/tasks.md` (Create), `scripts/__tests__/sdlc-safe-recoveries.test.mjs` (Modify), `scripts/__tests__/sdlc-execute.test.mjs` (Modify), `scripts/__tests__/sdlc-apply-review.test.mjs` (Modify), `scripts/__tests__/sdlc-deliver.test.mjs` (Modify)
**Type**: Create or Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] Exact PathCast T001-T004 fixture yields 18 allowed, 12 tracked, and six explicitly untracked evidence paths
- [ ] Spec paths remain read-only; stale run branch is reported against the actual/owner branch
- [ ] Before/after hashes and bytes prove no lock, recovery, run, handoff, spec, product, or `.pi-glla` write
- [ ] Parser covers read-only-then-writable, duplicate operations, Create-then-Modify, and unsupported/missing/duplicate declaration failures
- [ ] Existing scope consumers remain covered

### T004: Document workflow and release evidence

**File(s)**: `workflows/write-code/WORKFLOW.md`, `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] Write-code uses owner-bound `probe` before edits and state-changing subject `bind` only at publication
- [ ] Public docs show CLI/API arguments, structured JSON, `scope.allowedPaths`, discrepancies, and no-write guarantee
- [ ] Unreleased changelog records the bug fix without changing VERSION or package version
- [ ] Skill bundle validation, focused suites, disposable exercise, plugin current/stability/surface, contribution evidence, version sync, and diff checks pass

## Traceability

| AC | Tasks |
|----|-------|
| AC1 | T001, T003 |
| AC2 | T001, T003 |
| AC3 | T001, T003 |
| AC4 | T003 |
| AC5 | T001, T003 |
| AC6 | T002, T003, T004 |
| AC7 | T003, T004 |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #390 | 2026-09-13 | Initial approved tasks |
