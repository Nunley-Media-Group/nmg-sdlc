# Tasks: Remediate failing hosted checks that are not branch-protected

**Issue**: #319
**Date**: 2026-08-29
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/195-move-exact-head-delivery-into-a-controller-with-on-demand-remediation/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Include every hosted check in the delivery snapshot | [ ] |
| T002 | Add UNSTABLE / non-required-failure regressions | [ ] |
| T003 | Verify no regressions | [ ] |

---

### T001: Include every hosted check in the delivery snapshot

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `fetchSnapshot` still runs `gh pr checks <N> --required --json name,state,bucket,link,event` first.
- [ ] `fetchSnapshot` always runs `gh pr checks <N> --json name,state,bucket,link,event` (no `--required`), not only when `declaredEvidence` contains `kind === 'check_run'`.
- [ ] Both results go through existing `parseChecksResult` and `enrichMissingCheckEvents` with the shared `runEvidenceCache`.
- [ ] `snapshot.checks` is the required list plus every unfiltered check whose `${name}\0${event}` key is new. The `declaredCheckRuns.has(check.name)` filter is gone.
- [ ] `evidenceChecks` remains the full unfiltered list for `evidenceForHead`.
- [ ] No unrelated refactor.

**Notes**: Follow the fix strategy from design.md. Keep `requiredChecksConfigured` / `declaredPrOnlyChecks` construction unchanged.

### T002: Add UNSTABLE / non-required-failure regressions

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`, `scripts/__tests__/pr-delivery-state.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] In `sdlc-deliver.test.mjs`, add a test that uses the existing `fixture` split (`requiredChecks` vs unfiltered `checks`), default `verification()` (no `check_run`), `views: [openPr({ mergeStateStatus: 'UNSTABLE' })]`, required check `contract-tests` `SUCCESS` `pull_request`, unfiltered also including `{ name: 'Validate nmg-sdlc contribution evidence', state: 'FAILURE', link: 'https://github.test/check/gate', event: 'pull_request' }`. Expect `result.status === 3`, `result.stdout` contains one `NMG_SDLC_REMEDIATION:` line, `result.remediation.failingChecks` includes `{ name: 'Validate nmg-sdlc contribution evidence', url: 'https://github.test/check/gate' }`, `result.handoff` is null, and `f.sleeps` is empty.
- [ ] Same file: unfiltered pending non-required check (no `check_run` evidence) still classifies pending (sleeps, no merge, no remediation packet). All-success unfiltered + `CLEAN` still reaches merge-ready success on the existing happy path.
- [ ] Keep the existing assertion that the first `gh pr checks` argv is `['gh', 'pr', 'checks', '77', '--required', '--json', 'name,state,bucket,link,event']`. Add that a later call equals `['gh', 'pr', 'checks', '77', '--json', 'name,state,bucket,link,event']`.
- [ ] In `pr-delivery-state.test.mjs`, `classifyPrDeliveryState` with `mergeStateStatus: 'UNSTABLE'` and a failing non-required check returns `{ status: 'remediate', reasonCode: 'checks_failed' }`; UNSTABLE with only successful checks remains `mergeability_pending`; CLEAN with only successful checks remains `merge_ready`.
- [ ] Scenarios tagged `@regression` in `feature.gherkin` are covered by these tests (this repo uses Jest, not a Gherkin runner).

### T003: Verify no regressions

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`, `scripts/__tests__/pr-delivery-state.test.mjs`
**Type**: Verify (no file changes)
**Depends**: T001, T002
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/sdlc-deliver.test.mjs __tests__/pr-delivery-state.test.mjs` exits 0.
- [ ] Human-review, `CHANGES_REQUESTED`, required-check failure, empty required-check stderr, and GraphQL thread paths still pass in that focused run.

---

## Validation Checklist

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T002)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
