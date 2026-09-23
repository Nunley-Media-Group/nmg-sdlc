# Root Cause Analysis: Recover issue-unreadable failed START

**Issue**: #411
**Date**: 2026-09-22
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/374-recover-bounded-automatic-delivery-stops-without-loops/

## Root Cause

`discoverRecovery` classifies a valid failed START intervention as blocked. Its closed-worker auto-resume requires a missing or invalid handoff in `REMEDIABLE_STEPS`, excluding this exact START failure. Restoring GitHub credentials changes neither the terminal handoff nor checkpoint, so repeating discovery never admits the stage.

## Design

Keep the exception narrow in `scripts/sdlc-execute.mjs`: only `currentStep === 'start'`, `failed.reasonCode === 'issue_unreadable'`, and a strictly read, identity-matched failed START handoff with `intervention === true`, `reasonCode === 'issue_unreadable'`. Require current `runId`, current issue, empty START completion, original non-issue checkout branch and exact checkpoint HEAD, clean Git status, no live/ambiguous worker or foreign controller lock, no prior matching recovery, and fresh `gh issue view <N> --json number,state` returning the requested open issue. A pre-existing spec branch is not evidence that START mutated the checkout. No credential inference from `gh auth status` alone.

Discovery performs only reads, returning a specific `issue_unreadable_start_resume` class and digest/identity evidence. Under the acquired controller lease, re-read checkpoint, checkout, handoff and issue, compare discovery-bound digest and file identity, and reject changed proof. Archive the original handoff bytes under `.omp/sdlc/history/issue-unreadable-start/` with exclusive immutable write and hash validation. Append a one-use `recoveries[]` tuple keyed to run/issue/START, including invocation id, source branch/head/handoff archive and original failed handoff, then persist using exact-head/checkpoint CAS before redispatch. Do not write a substitute passed handoff. Ordinary worker launch replaces the canonical failed file only after durable consumption and starts the standard START prompt. A repeat failure remains blocked because the tuple is already consumed.

Preserve existing `closed_worker_resume`, repaired-publication and passed-handoff reconciliation unchanged. A rejected or stale proof performs no worker dispatch. No generic credential retries or client-specific assumptions.

## Risks and Verification

A lost process between archive and checkpoint persistence must not silently overwrite history: archive is content-addressed, exclusive and verified on reread; an unconsumed record with an archive is not evidence of permission to retry with changed conditions. A lost process after persistence is already consumed and must not mint a second retry. Fixture tests exercise discovery read-only, successful one dispatch, changed/malformed proof, failed repeat, branch/head/dirty/lock/worker/prior-branch guards. Run focused suite, whole scripts suite, plugin surface and workflow exercise. Candidate install/doctor, retained MileDar read-only smoke and fresh registered consumer smoke are separate evidence layers.
