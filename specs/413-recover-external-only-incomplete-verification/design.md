# Root Cause Analysis: Recover external-only incomplete verification

**Issue**: #413
**Date**: 2026-09-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/374-recover-bounded-automatic-delivery-stops-without-loops/

## Root Cause

`workflows/verify-code/WORKFLOW.md` chooses publication-only finalization whenever a report exists. That rule correctly protects an already produced report from duplicate publication, but treats a valid external-only Incomplete result as immutable after the external dependency returns. `scripts/sdlc-finalize-verification.mjs` correctly rejects Incomplete and must not be relaxed. The bounded execute owning-stage attempt therefore cannot reach `scripts/sdlc-verify-steering.mjs` to obtain new robot evidence.

## Fix Strategy

Keep finalizer/readiness authority unchanged. Before publication-only finalization, after the durable verify owner is bound, inspect the report and bounded canonical verification artifact. Candidate requires matching issue, singular Approved spec/scope, branch, HEAD, spec/config identity, complete coverage and only required external `incomplete` plus required passing results; reject failed, locally incomplete, malformed, stale, ambiguous or unsafe evidence. Consume a `external_verification_recheck` record in the existing safe-recoveries owner ledger before a single rerun. New lease/session/HEAD/report bytes do not grant another attempt to that incomplete owner.

The verify workflow calls the deterministic registered gate once under the same issue/spec/head and controller run id. Only a fresh complete all-required-pass artifact permits an accurate replacement report and issue comment through normal workflow ownership. Reuse the normal finalizer for report publication and passed handoff. If fresh validation is non-pass, preserve historical report and return normal intervention; never edit controller handoff/checkpoint, suppress robot validation, or retry automatically. Existing publication-only and `--recover-stale` handling remain in place.

## Safety Boundaries

- Artifact and report reads must be bounded, regular, no-follow and path-constrained; registered steering identity is not inferred from a prose claim.
- Require a unique live owner and clean non-runtime scope except the owned report; reject altered spec, manifest/config, branch and HEAD.
- Persist one-use consumption before any external validation side effect. No attempt refill on failure, restart or changed report.
- Controller advances only after existing full-pass readiness, publication and exact-head gates.
