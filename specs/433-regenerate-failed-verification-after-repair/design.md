# Design: Regenerate Failed Verification After Repair

**Issue**: #433
**Status**: Approved
**Date**: 2026-09-24
**Author**: NMG

## Boundary

Extend the existing `scripts/sdlc-recover-verification.mjs` classifier with a separate `changed_head_failed_report` disposition. Keep the #413 external-only same-head Incomplete path intact. The candidate must bind to the existing verify owner, controller run, singular Approved spec/scope, exact branch, original Fail/Partial report and matching old canonical artifact. Prove a distinct current clean head B was published by the issue-owned repair after A; neither prose nor a dirty tree is repair proof. Recheck lease, ownership, identities, source bytes and prior consumption under the checkpoint lock before the first validation side effect.

Archive bounded no-follow regular report/artifact bytes and a digest-bound receipt before replacing them. Preserve history and other owner records. Consume a one-use key for each proven exact A→B transition before running the registered gate; the same pair never refills. On full-pass B gate, verify-code reviews acceptance and publishes a fresh B report through the normal finalizer. On a failed B gate, review remaining ACs, publish a truthful B Fail report with exact head and new gate evidence, and let normal non-passing finalization authorize a materially different repair. Incomplete/unsafe evidence remains intervention. The finalizer rejects an old A report at B and never grants delivery without a new passing B report.

Update `scripts/sdlc-execute.mjs` verify remediation to checkpoint each failure's head, changed paths, gate/report evidence digests, reason and prior attempts. A new source/test repair and distinct observed failure evidence resets the consecutive no-progress count; mere commit churn, identical evidence, a repeated A→B pair or a consumed dispatch does not. Remove the fixed total-attempt cutoff for progress-making verify work while retaining the no-progress stop and all other stage budgets. The rem prompt must read prior attempts and explain why the new hypothesis differs. The controller never asserts semantic progress from a SHA alone; required gates and acceptance review remain authoritative.

Update `workflows/verify-code/WORKFLOW.md` so the worker branches on the classifier result: changed-head Fail/Partial recovery permits precisely one gate per proven transition; same-head external-only Incomplete retains #413 behavior; `not_applicable` only permits publication-only finalization when report/artifact still match current head. The finalizer remains authoritative for safe publication and handoff.

## Verification

Extend `scripts/__tests__/sdlc-recover-verification.test.mjs` and relevant finalizer/controller tests with isolated A→B fixtures, before-fix reproduction, positive Pass, failed new gate, unchanged head, dirty/foreign owner, unsafe files, mismatched spec/manifest and consumed recheck. Exercise the bundled workflow through Pi in a disposable consumer. Run full Jest, plugin surface/spec validators, cross-platform checks and registered live smoke against a fresh invocation-bound consumer issue. Do not use retained PennyScan #204 runtime data as a writable test fixture.

## Rejected Paths

Deleting the old report, editing `run.json`, writing a handoff by hand, treating local tests as the registered gate, or replaying a consumed controller dispatch removes the evidence boundary and is not recovery.
