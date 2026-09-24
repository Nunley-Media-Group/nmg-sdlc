# Design: Regenerate Failed Verification After Repair

**Issue**: #433
**Status**: Approved
**Date**: 2026-09-24
**Author**: NMG

## Boundary

Extend the existing `scripts/sdlc-recover-verification.mjs` classifier with a separate `changed_head_failed_report` disposition. Keep the #413 external-only same-head Incomplete path intact. The candidate must bind to the existing verify owner, controller run, singular Approved spec/scope, exact branch, original Fail/Partial report and matching old canonical artifact. Prove a distinct current clean head B was published by the issue-owned repair after A; neither prose nor a dirty tree is repair proof. Recheck lease, ownership, identities, source bytes and prior consumption under the checkpoint lock before the first validation side effect.

Archive bounded no-follow regular report/artifact bytes and a digest-bound receipt before replacing them. Preserve history and other owner records. Consume an exact A→B one-use key before running the registered gate; do not refill on failure. On full-pass new gate at B, verify-code performs acceptance review and publishes a fresh B report through the normal finalizer. On a failed/incomplete B gate, preserve the A archive and B result and stop without a pass handoff. Unsafe, ambiguous or unchanged inputs return explicit non-recoverable reasons without mutation.

Update `workflows/verify-code/WORKFLOW.md` so the worker branches on the classifier result: changed-head Fail/Partial recovery permits precisely one gate at B; same-head external-only Incomplete retains #413 behavior; `not_applicable` only permits publication-only finalization when current report/artifact still match current head. Do not regenerate a report simply because one exists. The finalizer remains authoritative for safe publication and handoff.

## Verification

Extend `scripts/__tests__/sdlc-recover-verification.test.mjs` and relevant finalizer/controller tests with isolated A→B fixtures, before-fix reproduction, positive Pass, failed new gate, unchanged head, dirty/foreign owner, unsafe files, mismatched spec/manifest and consumed recheck. Exercise the bundled workflow through Pi in a disposable consumer. Run full Jest, plugin surface/spec validators, cross-platform checks and registered live smoke against a fresh invocation-bound consumer issue. Do not use retained PennyScan #204 runtime data as a writable test fixture.

## Rejected Paths

Deleting the old report, editing `run.json`, writing a handoff by hand, treating local tests as the registered gate, or replaying a consumed controller dispatch removes the evidence boundary and is not recovery.
