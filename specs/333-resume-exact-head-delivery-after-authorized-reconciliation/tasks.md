# Tasks: Resume exact-head delivery after authorized reconciliation

**Issue**: #333
**Date**: 2026-08-31
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/293-persist-exact-head-delivery-cas-and-isolated-session-tokens/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Replace sticky reconciliation return with authorized resume | [ ] |
| T002 | Add resume and no-regression coverage | [ ] |
| T003 | Verify no regressions | [ ] |

---

### T001: Fix the Defect

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `runDeliverUnlocked` no longer returns immediately when `delivery.status === 'reconciliation_required'`
- [ ] Resume observes only persisted PR number via `pullRequestByNumber` and never calls `existingPullRequest`
- [ ] Authorized CAS write is exactly `{ issue, pullRequest: P, expectedHead: H2, status: 'expected', reconciliation: null }`
- [ ] Unauthorized outcomes call `reconciliationFailure(context, namespace, null)` with no delivery persist
- [ ] `scopedSnapshot` `cleanHeadAdvance` still authorizes expected-status head advance without required checks
- [ ] No unrelated refactoring

**Notes**: Follow the fix strategy from design.md. Keep `human_review` short-circuit after the recovery block.

### T002: Add Regression Test

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Jest cases map 1:1 to `@SCN001` and `@SCN002` and are tagged in comments or test names to those scenarios
- [ ] Authorized resume with `--controller-run-id`: seed `delivery.status: reconciliation_required` expectedHead H1 PR 77, local HEAD H2, open PR 77 at H2 on `42-delivery`, required checks `SUCCESS` (or fixture `noRequiredChecks`); same invocation reaches merge `--match-head-commit` H2 and passed handoff; no `gh pr list` / `gh pr create`
- [ ] Authorized resume with `--session-token` also CAS-advances to `expected` then continues ordinary delivery
- [ ] Pending required checks (`PENDING`) keep `reconciliation_required`, do not rewrite `reconciliation`, do not `sleep`, and perform no create/list-select/ready/push/merge
- [ ] Failed, unknown, unreadable, and empty-without-none-required checks stay sticky the same way
- [ ] Different PR number, `CLOSED`, `MERGED`, dirty path outside `.omp/`, HEAD ≠ PR head, and foreign `headRefName` stay sticky
- [ ] Existing `persists unexpected head changes as byte-stable reconciliation failures` still proves unchanged delivery/handoff bytes on unauthorized rerun but may allow `gh pr view` / `gh pr checks --required` reads
- [ ] Expected-status existing-PR version-push rebind still advances H1→H2 when required checks are pending

### T003: Verify No Regressions

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Verify (no file changes)
**Depends**: T001, T002
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/sdlc-deliver.test.mjs` exits 0
- [ ] Unauthorized paths never create, list-select, ready, push, or merge a pull request
- [ ] In-run expected-status H1→H2 rebind still does not use the reconciliation-recovery check gate

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T002)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
