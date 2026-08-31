# Tasks: Fix final-head evidence hang on workflow-qualified check names

**Issue**: #336
**Date**: 2026-08-31
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/319-remediate-failing-hosted-checks-that-are-not-branch-protected/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Add canonical check identity and fail-closed matching | [ ] |
| T002 | Add qualified-name and collision regressions | [ ] |
| T003 | Verify no regressions | [ ] |

---

### T001: Add canonical check identity and fail-closed matching

**File(s)**: `scripts/verification-readiness.mjs`, `scripts/sdlc-deliver.mjs`, `scripts/pr-delivery-state.mjs`, `workflows/verify-code/references/report-format.md`, `references/pr-dependent-verification.md`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `canonicalCheckName` and `resolveDeclaredCheck` are exported from `scripts/verification-readiness.mjs` with the rules in this spec's design
- [ ] `normalizeCheck` preserves GitHub job `name` and sets `workflow` to trimmed non-empty string or `null`
- [ ] Every `gh pr checks` `--json` in `sdlc-deliver.mjs` is `name,state,bucket,link,event,workflow`
- [ ] Snapshot uniqueness and declared-name observation use canonical identity, not raw-name `Set.has`
- [ ] `evidenceForHead` returns `null` only for `pending`; `mismatch` throws; `matched` writes `evidenceIdentity` plus head/conclusion/url
- [ ] Marker `schemaVersion` remains `1` with no new `workflow` field
- [ ] Workflow-bundled producer docs use the same canonical `name` rule; `skill://skill-creator` is read before those edits
- [ ] No suffix matching and no H2 wall-clock deadline

**Notes**: Follow the fix strategy from design.md. Keep `enrichMissingCheckEvents` unchanged.

### T002: Add qualified-name and collision regressions

**File(s)**: `scripts/__tests__/verification-readiness.test.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`, `scripts/__tests__/pr-delivery-state.test.mjs`, `scripts/__tests__/exercise-pr-dependent-delivery.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Helper tests cover AC1 reconstruct, AC2 collision, AC3 unique bare empty workflow, AC4 pending vs terminal mismatch, and FR3 no suffix match
- [ ] Controller AC1: qualified declarations plus bare GitHub names with `workflow` complete H2 collection (`status === 0`, ready then merge, no extra polling after SUCCESS is visible)
- [ ] Controller AC2: two SUCCESS `verify` jobs from different workflows with declaration `verify` fail `verification_not_ready` without unbounded sleeps
- [ ] Controller AC3/AC6: `controlledVerification` `contract-tests` still delivers with empty or omitted `workflow`
- [ ] Controller AC4: pending miss still sleeps; terminal unresolved identity fails closed (`f.sleeps.length` is 0 or 1)
- [ ] Existing `--json name,state,bucket,link,event` argv assertions include `,workflow`
- [ ] `feature.gherkin` `@SCN001`–`@SCN006` `@regression` scenarios are covered by these Jest tests (this repo has no Gherkin runner)

### T003: Verify no regressions

**File(s)**: `scripts/__tests__/verification-readiness.test.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`, `scripts/__tests__/pr-delivery-state.test.mjs`, `scripts/__tests__/exercise-pr-dependent-delivery.test.mjs`
**Type**: Verify (no file changes)
**Depends**: T001, T002
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/verification-readiness.test.mjs __tests__/sdlc-deliver.test.mjs __tests__/pr-delivery-state.test.mjs __tests__/exercise-pr-dependent-delivery.test.mjs` exits 0
- [ ] Exact-name H1→H2, empty-required stderr, #319 UNSTABLE non-required failure, and #284 event enrichment still pass in that run

---

## Validation Checklist

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T002)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
