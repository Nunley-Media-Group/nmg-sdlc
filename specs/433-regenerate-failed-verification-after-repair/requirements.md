# Defect Report: Regenerate Failed Verification After Repair

**Issue**: #433
**Status**: Approved
**Date**: 2026-09-24
**Author**: NMG
**Related Specs**: `specs/354-route-remediable-failed-verification-into-rn-verify/`, `specs/413-recover-external-only-incomplete-verification/`

## Problem

A verify owner that produced a Fail or Partial report at head A enters `rN-verify` repair. After the repair commits distinct clean head B, the next verify worker sees the old report. The existing classifier accepts only external-only Incomplete at the *same* head, returns `not_applicable` for Fail, and the workflow finalizes the old report and old gate artifact. Repeated workers cannot verify B; execute consumes its remediation allowance and stops at `remediation_loop`.

Observed PennyScan #204: old artifact/report at `3883f89d7539d55c51ffa858ce6a78a4954cd14c`, repaired implementation at `618ecd8f935b20c2bcda4b6b1bdf68052b7ad244`, and run `7681447e-87e1-4395-b9d6-ad13625deb41` stopped at verify. Preserve these bytes and owners; no manual checkpoint or handoff surgery.

## Acceptance Criteria

### AC1: Exact changed-head repair enables one fresh verification
Given a bounded owner-bound Fail or Partial report and canonical artifact for head A, and a published implementation repair on a distinct clean head B for the same issue, branch, singular Approved spec and controller
When a verify worker resumes under that owner
Then it archives the original report and gate artifact with exact digests, consumes one authorized changed-head recheck, and runs the manifest-registered gate at B rather than finalizing A.

### AC2: Passing new evidence advances only through normal finalization
Given complete passing required validations at B and acceptance review for the repaired source
When the verify workflow replaces the report and finalizes it
Then the passed handoff and canonical artifact bind B and the ordinary controller may advance to delivery; no old result grants authority.

### AC3: Unchanged or ambiguous evidence fails closed
Given head A is unchanged, the report or artifact is unsafe, the spec/config/owner/branch differs, the tree is dirty, a worker or lease conflicts, or the recheck was already consumed without new authority
When recovery is requested
Then no new validation, report overwrite, handoff forgery, or worker replay occurs and the exact reason is retained.

### AC4: Non-passing new evidence remains explicit
Given a fresh registered gate at B fails or is incomplete
When its result is inspected
Then historical A evidence remains archived, B failure remains explicit, and no passing report or delivery handoff is manufactured. External-only same-head Incomplete recovery retains its existing one-use rules.

### AC5: Deterministic regression and live proof
Given the isolated #204 Fail-to-repair transition and unsafe variants
When focused and registered plugin validations run on the final clean head
Then the before-fix loop reproduces, the changed-head path produces new exact-head evidence, unsafe cases remain blocked, and the registered live smoke records invocation-bound merge and closure.

## Scope

Own only verification recovery classification, its verify-code workflow/finalizer integration where necessary, bounded immutable evidence archive, targeted tests, README/changelog/version mirrors. No changes to the PennyScan #204 checkpoint, no weakened provider gate, no auto-retry of an unchanged or consumed dispatch, and no nmg-sdlc workflow on the plugin repository.
