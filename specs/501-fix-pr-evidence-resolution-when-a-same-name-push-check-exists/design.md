# Root Cause Analysis: PR-evidence resolution fails when a same-name push check exists

**Issue**: #501
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/484-fix-first-run-delivery-missing-changelog-md-and-push-event-checks-block-sdlc-execute/

## Root Cause

`fetchSnapshot` builds `evidenceChecks` from the unfiltered `gh pr checks <pr> --json name,state,bucket,link,event,workflow` query, so it holds checks from every triggering event. On a draft PR with satisfied readiness, `evidenceForHead` calls `resolveDeclaredCheck(item.name, observed.evidenceChecks)` for every `required_check`/`check_run` item. A workflow that triggers on both `push` and `pull_request` reports two checks with the same job name. `resolveDeclaredCheck` sees two bare-name matches and returns `mismatch`, and `evidenceForHead` throws `verification_not_ready`. Its later `check.event !== item.event` guard only runs after a unique match, so the declared `event` never narrows the candidate set.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/sdlc-deliver.mjs` | `evidenceForHead` | Resolves declared PR-only evidence against all-event checks |
| `scripts/sdlc-deliver.mjs` | `fetchSnapshot` (`evidenceChecks`) | Supplies the unfiltered check list |
| `scripts/verification-readiness.mjs` | `resolveDeclaredCheck` | Reports ambiguous bare-name matches as `mismatch`; empty candidates as `pending` |

## Fix Strategy

In `evidenceForHead`, filter `observed.evidenceChecks` to `check.event === item.event` before calling `resolveDeclaredCheck`. This is the same pattern `scripts/pr-delivery-state.mjs` uses (`checks.filter((check) => check.event === 'pull_request')`). With the filter in place:

- a same-name `push` check is no longer a candidate, so the `pull_request` check matches uniquely (AC1);
- a push-only or empty declared-event set reaches `resolveDeclaredCheck`'s `candidates.length === 0` branch and returns `pending` (AC2, AC3);
- two matching declared-event checks still return `mismatch` → `verification_not_ready` (AC4);
- single-event bare and `Workflow / job` qualified matches and the existing state handling are unchanged (AC5).

The post-match `check.event !== item.event` guard becomes unreachable and is removed.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/sdlc-deliver.mjs` | In `evidenceForHead`, pass `observed.evidenceChecks.filter((check) => check.event === item.event)` to `resolveDeclaredCheck`; remove the now-redundant event guard | AC1–AC5, FR1–FR4 |
| `scripts/__tests__/sdlc-deliver.test.mjs` | Add draft-evidence regression tests driven by the fixture's `checkResponses.all` | AC1–AC5, FR5 |

## Blast Radius

Only `evidenceForHead`, which runs on the draft-PR branch of delivery after readiness is `pr_evidence_satisfied`, is affected. `resolveDeclaredCheck` and its caller in `scripts/pr-delivery-state.mjs` are unchanged. The snapshot's `checks` list and merge-loop classification are unchanged.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Filter by declared event in `evidenceForHead` | Selected | Smallest change; mirrors `pr-delivery-state.mjs`; keeps `resolveDeclaredCheck` event-agnostic for other callers |
| Add an `event` parameter to `resolveDeclaredCheck` | Rejected | Changes a shared resolver's interface for a single caller |
| Query `gh pr checks` per event | Rejected | `gh pr checks` has no event filter; adds calls without changing the outcome |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #501 | 2026-10-25 | Initial defect design |
