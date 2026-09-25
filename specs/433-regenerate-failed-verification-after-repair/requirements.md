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
Given a bounded owner-bound Fail or Partial report and canonical artifact for head A, or an Incomplete report with a registered local command failure plus incomplete external evidence, and a published implementation repair on a distinct clean head B for the same issue, branch, singular Approved spec and controller
When a verify worker resumes under that owner
Then it archives the original report and gate artifact with exact digests, consumes one authorized changed-head recheck, and runs the manifest-registered gate at B rather than finalizing A.

### AC2: Passing new evidence advances only through normal finalization
Given complete passing required validations at B and acceptance review for the repaired source
When the verify workflow replaces the report and finalizes it
Then the passed handoff and canonical artifact bind B, with every required validation's registered identity, applicability, invocation and provider evidence checked before publication; the same gate is required for standalone Pass, while a known report-only publication may reconcile against its unchanged source parent. The ordinary controller may advance to delivery; no old result grants authority.

### AC3: Unchanged or ambiguous evidence fails closed
Given head A is unchanged, the report or artifact is unsafe, the spec/config/owner/branch differs, a required result is missing, forged or falsely inapplicable, the tree is dirty, a worker or lease conflicts, the same A-to-B recheck was already consumed, or legacy report publication lacks a server-observed push chronology
When recovery is requested
Then no duplicate validation, report overwrite, handoff forgery, or worker replay occurs and the exact reason is retained.

### AC4: New non-passing evidence stays actionable only with progress
Given a fresh registered gate at B fails, including a mixed local failure with an incomplete external provider
When acceptance review records the exact new head, remaining failures and earlier attempted approaches in a truthful B report
Then historical A evidence remains archived, B failure remains explicit, and a non-passing handoff may authorize another distinct issue-owned repair, but never delivery.
Given a further repair publishes head C with materially changed project paths and distinct failure evidence
When the controller compares the checkpointed heads, paths, report and gate outcomes
Then it may continue without an arbitrary total attempt cutoff; unchanged/repeated work stops without replay.
External-only Incomplete or ambiguous evidence remains intervention-bearing. A mixed local failure can return to implementation, but incomplete external evidence never authorizes passing or delivery. External-only same-head Incomplete recovery retains its separate one-use rules.

### AC5: Deterministic regression and live proof
Given the isolated #204 Fail-to-repair transition and unsafe variants
When focused and registered plugin validations run on the final clean head
Then the before-fix loop reproduces, the changed-head path produces new exact-head evidence, unsafe cases remain blocked, and the registered live smoke records invocation-bound merge and closure.

### AC6: Evidence-driven recovery is stage-general, not a retry counter
Given any remediable stage has a failed handoff and checkpointed attempts
When the next LLM worker receives the spec, prior approaches, failure artifacts, and exact stage authority
Then it diagnoses the prior failure and proposes a different testable repair; the controller records exact inputs, output digests, head and side effects before dispatch.
Given a new, stage-authorized project change or gate result is proven after that repair
When the controller repeats its actual stage gate
Then progressful work may continue without an arbitrary total-attempt limit, including beyond two attempts.
Given the same inputs and outputs, an already consumed side effect, ambiguous ownership or missing external approval
When recovery is considered
Then it stops with the exact blocker rather than replaying or inferring success.

## Scope

Own verification recovery classification, verify-code workflow/finalizer, the stage-general evidence-driven remediation controller and its stage-specific authorization tests, bounded immutable evidence archives, README/changelog/version mirrors. No changes to PennyScan #204 checkpoint, no weakened provider gate, no automatic replay of an unchanged or consumed dispatch, and no nmg-sdlc workflow on the plugin repository.
