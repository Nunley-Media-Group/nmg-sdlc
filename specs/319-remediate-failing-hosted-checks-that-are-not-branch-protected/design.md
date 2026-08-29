# Root Cause Analysis: Remediate failing hosted checks that are not branch-protected

**Issue**: #319
**Date**: 2026-08-29
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/195-move-exact-head-delivery-into-a-controller-with-on-demand-remediation/

---

## Root Cause

`scripts/sdlc-deliver.mjs` `fetchSnapshot` always loads `gh pr checks N --required --json name,state,bucket,link,event`. It loads unfiltered `gh pr checks N --json name,state,bucket,link,event` only when verification declared `check_run` evidence. A failing contribution-gate job therefore never enters `snapshot.checks`.

Even when unfiltered checks are loaded, `snapshotChecks` appends them only when `declaredCheckRuns` contains the check name. Non-required failures that are not declared `check_run` evidence are dropped.

`classifyPrDeliveryState` in `scripts/pr-delivery-state.mjs` already treats any snapshot check in `FAILURE_CHECKS` (`FAILURE`, `ERROR`, `CANCELLED`, `TIMED_OUT`, `ACTION_REQUIRED`) as `remediate` / `checks_failed` before it inspects `mergeStateStatus`. With those checks omitted, `UNSTABLE` with no failing snapshot checks becomes `pending` / `mergeability_pending`. The delivery loop in `runDeliverUnlocked` then `sleep`s `POLL_INTERVAL_MS` (30000) indefinitely. `NMG_SDLC_REMEDIATION` is emitted only for `checks_failed` or `review_threads_unresolved`.

The classifier does not need a new `UNSTABLE` rule. The snapshot must contain every hosted check.

### Affected Code

| File | Role |
|------|------|
| `scripts/sdlc-deliver.mjs` | `fetchSnapshot` gates unfiltered `gh pr checks` on `check_run` evidence and filters `snapshotChecks` through `declaredCheckRuns`. |
| `scripts/pr-delivery-state.mjs` | `classifyPrDeliveryState` already maps failing snapshot checks to `checks_failed` before `UNSTABLE` → `mergeability_pending`. |
| `scripts/__tests__/sdlc-deliver.test.mjs` | Fixture already splits `requiredChecks` vs unfiltered `checks`; no regression covers UNSTABLE plus a failing non-required check without `check_run` evidence. |
| `scripts/__tests__/pr-delivery-state.test.mjs` | Classifies a failing check as `remediate` but does not lock UNSTABLE + failing non-required vs `mergeability_pending`. |

### Triggering Conditions

- Required checks returned by `gh pr checks --required` are successful (or empty-success).
- Unfiltered `gh pr checks` includes a failing non-required hosted check.
- GitHub reports `mergeStateStatus: UNSTABLE`.
- Verification evidence does not declare that check as `kind: check_run` (default `verification()` fixtures and typical `/sdlc-open-pr` reports).

These were not caught because existing delivery tests either put the failure on the required-check command or declare `check_run` evidence, which is the only path that currently loads unfiltered checks.

---

## Fix Strategy

### Approach

Keep fetching `gh pr checks --required` for the existing empty-required and required-collection fail-closed paths. Always also fetch unfiltered `gh pr checks` with the same JSON fields, using the existing `parseChecksResult` / `enrichMissingCheckEvents` pair (same run-evidence cache). Do not gate that second call on declared `check_run` evidence.

Build `snapshot.checks` as the required set plus every unfiltered check whose `name\0event` key is not already present. Delete the `declaredCheckRuns.has(check.name)` filter. Keep returning the full unfiltered list as `evidenceChecks` for `evidenceForHead`.

Do not change `classifyPrDeliveryState` status precedence: failing checks already win over `UNSTABLE` pending. Do not treat `UNSTABLE` itself as remediable when no snapshot check is failing. Do not change human-review, `CHANGES_REQUESTED`, required-check failure, pending-check, or `CLEAN` → `merge_ready` behavior.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-deliver.mjs` | Always run unfiltered `gh pr checks`; merge every distinct unfiltered check into `snapshot.checks`. | Puts non-required failures into the classifier input. |
| `scripts/__tests__/sdlc-deliver.test.mjs` | Add controller regression: required SUCCESS + unfiltered FAILURE + `UNSTABLE` + default verification (no `check_run`) → exit 3, `failingChecks` includes the non-required name, `f.sleeps` empty. Preserve pending and CLEAN merge-ready. Keep the existing first-call `--required` argv assertion; also assert the unfiltered argv. | Locks AC1/AC2 on the live controller. |
| `scripts/__tests__/pr-delivery-state.test.mjs` | Add classifier regression: `mergeStateStatus: UNSTABLE` plus a failing non-required check → `remediate` / `checks_failed`; UNSTABLE with only successful checks still `mergeability_pending`; CLEAN with only successful checks still `merge_ready`. | Locks that snapshot contents, not a new UNSTABLE rule, are the fix. |

### Blast Radius

- **Direct impact**: `fetchSnapshot` in `scripts/sdlc-deliver.mjs`; two Jest files above.
- **Indirect impact**: every `/sdlc-open-pr` observation now classifies non-required hosted checks. Pending non-required checks become `checks_pending` (poll) instead of being ignored. That matches AC2.
- **Risk level**: Low — classifier precedence and remediation packet construction are unchanged.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Pending non-required checks start blocking merge | Med | AC2: pending still classifies as `pending`; existing poll/timeout remains. |
| Required-only empty-check stderr handling breaks | Low | Keep the `--required` call and `parseChecksResult` empty-check forms. |
| Human review / `CHANGES_REQUESTED` / required failures change | Low | Existing tests in `sdlc-deliver.test.mjs` and `pr-delivery-state.test.mjs` must still pass. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Classify `UNSTABLE` as `checks_failed` without loading unfiltered checks | Would stop the infinite poll | Packet `failingChecks` would be empty; the worker would not know which job to fix. |
| Load unfiltered checks only when `mergeStateStatus` is `UNSTABLE` | Narrower GitHub traffic | Misses failing non-required checks while status is still `UNKNOWN` or while required checks are pending; FR1 requires every snapshot. |

---

## Validation Checklist

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #319 | 2026-08-29 | Initial defect report |
