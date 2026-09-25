# Design: Regenerate Failed Verification After Repair

**Issue**: #433
**Status**: Approved
**Date**: 2026-09-24
**Author**: NMG

## Boundary

Extend the existing `scripts/sdlc-recover-verification.mjs` classifier with a separate `changed_head_failed_report` disposition. Keep the #413 external-only same-head Incomplete path intact. A mixed Incomplete report with a registered local command failure may follow the changed-head repair path, but its external incompleteness cannot pass. Bind the existing verify owner, controller run, singular Approved spec/scope, exact branch, old report/artifact and immutable steering metadata. For a markerless legacy report require the exact issue comment before a server-observed push of repair B; a forgeable Git commit timestamp is not sufficient. Prove a distinct current clean head B was published by the issue-owned repair after A; neither prose nor a dirty tree is repair proof.

Archive bounded no-follow regular report/artifact bytes and a digest-bound receipt before replacing them. Preserve history and other owner records. Consume a one-use key for each proven exact A→B transition before running the registered gate; the same pair never refills. On any Pass, including standalone, compare the source-head report and canonical artifact with the manifest's required validation identities, actual applicability, exact invocation, request/result identity and nonempty provider evidence. A report-only publication can reconcile against its unchanged source parent; it cannot turn a new source head into old gate authority. On a failed B gate, preserve a truthful B report and archive its gate evidence before rewinding implementation, both reviews and verification. Mixed external incompleteness never authorizes delivery.

In `scripts/sdlc-execute.mjs`, checkpoint each failed attempt's head, changed paths, referenced artifact digests and reason for every remediable stage. Supply the latest bounded attempts and paths to the next LLM worker with the full history retained in the checkpoint; require a new hypothesis grounded in the failure. The controller uses existing step-specific publication, review, verification and delivery proofs to decide whether any new action is authorized; it does not rank reasoning from prose. Reset consecutive no-progress count only on distinct authorized evidence, and consume an owner-bound one-use continuation for each new fact after an older recovery was spent. Preserve stage-specific approval and provider limits.

Update `workflows/verify-code/WORKFLOW.md` so the worker branches on the classifier result: changed-head failed-report recovery permits precisely one gate per proven transition; same-head external-only Incomplete retains #413 behavior; `not_applicable` only permits publication-only finalization when report/artifact still match current head. Metadata inspection must not execute project-controlled extensions. The finalizer remains authoritative for safe publication and handoff.

## Verification

Extend `scripts/__tests__/sdlc-recover-verification.test.mjs` and relevant finalizer/controller tests with isolated A→B fixtures, before-fix reproduction, positive Pass, failed new gate, unchanged head, dirty/foreign owner, unsafe files, mismatched spec/manifest and consumed recheck. Exercise the bundled workflow through Pi in a disposable consumer. Run full Jest, plugin surface/spec validators, cross-platform checks and registered live smoke against a fresh invocation-bound consumer issue. Do not use retained PennyScan #204 runtime data as a writable test fixture.

## Rejected Paths

Deleting the old report, editing `run.json`, writing a handoff by hand, treating local tests as the registered gate, or replaying a consumed controller dispatch removes the evidence boundary and is not recovery.
