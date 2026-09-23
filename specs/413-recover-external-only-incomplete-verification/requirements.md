# Defect Report: Recover external-only incomplete verification

**Issue**: #413
**Date**: 2026-09-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/374-recover-bounded-automatic-delivery-stops-without-loops/

## Reproduction

1. MileDar #169 at verification run `d27814f1-c1cd-482a-af83-46d931cdaafa`, branch `169-prevent-late-refresh-responses-from-restoring-signed-out-credentials`, HEAD `226c77f7ede44a987db5936f624dd82012df49a2`, has coverage 3/3. API and Flutter passed; required robot was Incomplete because local Kubernetes refused `127.0.0.1:6443`.
2. Enable local Kubernetes and observe `kubectl get ns` succeed. Keep the valid `verification-report.md` with `Implementation Status: Incomplete` unchanged.
3. Bounded `/sdlc-execute --recover-stale` invokes `/sdlc-verify-code #169` once. Existing-report publication-only branch invokes the finalizer without the registered steering gate; it returns `verification_not_ready` without robot evidence.

## Expected vs Actual

| | Behavior |
|---|---|
| **Expected** | One durable owner-bound attempt may rerun registered verification for exact issue, Approved singular spec, branch, unchanged spec/config and HEAD when only required external evidence was incomplete. Replace and publish report only after genuine full-pass evidence; finalizer/execute then advance under normal gates. |
| **Actual** | Existing report always takes publication-only finalization. The external prerequisite can recover without any path to rerun the gate. |

## Acceptance Criteria

### AC1: Exact external-only candidate

**Given** a valid Incomplete report and canonical coverage-complete artifact for the same issue, Approved singular spec, branch, HEAD and registered spec/config identity
**When** a required external provider is Incomplete and all other required applicable results passed
**Then** verify may offer one fresh deterministic gate run after binding its existing verify owner
**And** malformed, symlinked, oversized, stale, changed-scope, incomplete-coverage, required failed or locally incomplete evidence never qualifies.

### AC2: Durable one-use attempt

**Given** the exact candidate and incomplete verify owner
**When** recovery starts
**Then** consume a durable owner/issue/verify attempt record before rerunning the gate
**And** new sessions, leases, report edits, HEAD changes and repeated calls cannot mint a second attempt for the same owner.

### AC3: Genuine publication and advancement

**Given** the external prerequisite is now available
**When** the registered gate reruns once at exact identity
**Then** only full passing coverage and required results permit a newly evidenced report and normal finalization/publication
**And** only normal passed handoff permits execute to advance
**And** failed or still-incomplete rerun leaves the previous report intact and intervention-bearing, without forged handoff or checkpoint edits.

### AC4: Preserve existing recovery and prove boundaries

**Given** existing publication-only recovery and operator-authorized owning-stage behavior
**When** this targeted recovery is introduced
**Then** those paths still work, with no generic retry loop or reduced validation gate
**And** focused positive/negative fixtures and an actual skill exercise demonstrate the changed behavior.
