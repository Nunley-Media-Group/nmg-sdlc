# Tasks: PR-evidence resolution fails when a same-name push check exists

**Issue**: #501
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/484-fix-first-run-delivery-missing-changelog-md-and-push-event-checks-block-sdlc-execute/

## Implementation Tasks

### T001: Scope declared evidence resolution to the declared event

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1/FR2: `evidenceForHead` passes only observed checks whose `event` equals the declared item's `event` to `resolveDeclaredCheck`
- FR3: a declared item with no matching check of its event yields a pending result
- FR4: two matching checks of the declared event still throw `verification_not_ready`
- The now-unreachable post-match event comparison is removed; `merge_blocking` handling is unchanged

### T002: Add draft-evidence regression coverage

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- The satisfied-report rewrite in `a draft becomes mergeable only after fresh source gate, satisfied PR evidence and final-head checks` is extracted into a reusable helper that accepts the declared evidence name, and that test keeps passing
- AC1: with `checkResponses.all` returning `push` and `pull_request` `SUCCESS` checks named `contract-tests` with distinct links, delivery returns `status: 0`, runs one `gh pr ready` and one merge, and the PR body contains the `pull_request` link and not the push link
- AC2: with only a `push` `SUCCESS` check named `contract-tests`, the handoff has `reasonCode: 'verification_not_ready'` and a summary containing `PR-only checks remain pending`, with no ready and no merge
- AC3: with no `pull_request` check returned, the handoff has the same pending summary, with no ready and no merge
- AC4: with two `pull_request` `SUCCESS` checks named `contract-tests`, the handoff summary is `Delivery failed for #42: verification_not_ready`, with no ready and no merge
- AC5: a single `pull_request` match by bare name and by `CI / contract-tests` against a `workflow: 'CI'` check merges; a single `PENDING` match reports the pending summary; a single `FAILURE` match reports `Delivery failed for #42: verification_not_ready`
- AC1 fails against the pre-fix `evidenceForHead`, and all cases pass with T001 under `cd scripts && npm test -- __tests__/sdlc-deliver.test.mjs`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #501 | 2026-10-25 | Initial defect tasks |
