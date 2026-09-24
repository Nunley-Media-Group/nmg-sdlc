# Root Cause Analysis: Treat old smoke failure as historical across changed verification identity

**Issue**: #423
**Date**: 2026-09-23
**Status**: Approved
**Author**: NMG

## Root Cause

`steering/extensions/nmg-sdlc-smoke.mjs` reads a single historical verification artifact by plugin issue number when the current recovery store has no owner. `inspectLegacySmokeFailure` mixes attribution to the current verification attempt with validation of that attempt's recovery proof. A prior head/spec/steering/config identity or queue mismatch therefore becomes an invalid current recovery record, even though the old artifact is not authoritative for the new request.

## Fix Strategy

Classify the artifact before inspecting its nested delivery proof. Require an unambiguous provider candidate with internally consistent issue, request, result and recorded identity. If its exact verification identity or demonstrably recorded smoke queue differs from the current request, return historical/absent recovery authority. Do not read its retained clone for recovery or write a recovery-store owner. Preserve old artifact and clone bytes. For matching identity and queue, continue the existing strict proof checks, diagnostics, and bounded resume path. Ambiguous, unattributable or malformed same-attempt evidence remains invalid, not a fresh-launch license. A current recovery-store owner continues to take precedence over legacy inspection.

## Safety Boundaries

- Compare authoritative identity fields, not transient report tree state; configuration and explicit issue queue are separate checks.
- Never classify mere corrupted same-attempt evidence or multiple candidates as historical.
- Never replay old #133 nested run for #135, synthesize delivery proof, delete evidence, or relax exact-head merged/closed proof.
- Preserve existing user-facing failure text for unsafe same-attempt evidence.
