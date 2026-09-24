# Design: Route explicit local project-provider failures to implementation repair

**Issue**: #417
**Date**: 2026-09-23
**Status**: Approved
**Author**: NMG

## Trust Boundary
The steering manifest registers providers and the verification runner creates a bounded canonical artifact. A provider's textual summary is diagnostic, not authorization. A new explicit `repairable: true` is accepted only on a failed registered project-provider result with credible executed local test-command evidence and exact envelope/request identity. Unknown fields, malformed flags, stale identity, incomplete coverage and unexecuted prerequisites never become repairable. Built-in command classification keeps its existing contract. A required incomplete external prerequisite prevents new project-only recovery.

The retained MileDar #169 artifact is immutable and predates this field. Its SHA-256 is `4a7afb16391e03492beb941e5f7a35bb406b9683ef22271c110e0fd18afc232c`. Require an operator-supplied digest authorizing only the original bytes, plus current issue/head, registered required applicable failed provider, command-execution evidence with exact request/result identity, failed verify handoff, unique owner and unused recovery. Reject a digest mismatch and every incomplete result. Do not parse a provider's summary as proof. Preserve report/artifact paths and original failure in recovery provenance; do not alter the retained artifact or MileDar steering.

## Lifecycle
Reuse `inspectVerificationArtifactRepair`, finalization and existing `actionable_verification_resume` rather than adding an independent worker loop. Recovery consumes once before dispatch, records source evidence and rewinds to normal implement. Normal implement publication then review1, fix1, review2, fix2, verify and all registered gates remain mandatory. A second failure requires intervention, never another legacy recovery allowance. Reject stale HEAD, foreign owner, invalid branch or mismatched report before mutation.

## Affected Paths
- `src/sdlc-verification-runtime.mjs`: provider result envelope and validation.
- `scripts/verification-readiness.mjs` and `scripts/sdlc-finalize-verification.mjs`: exact artifact classification and failed handoff.
- `scripts/sdlc-execute.mjs`: bounded existing recovery and explicit legacy authorization.
- `workflows/verify-code/WORKFLOW.md`: operator and provider distinctions.
- Focused tests in `scripts/__tests__/`; README and CHANGELOG explain behavior.

## Verification
Prove a pre-fix failing fixture, exact legacy MileDar eligibility read-only, positive and negative signal/digest/identity/ownership cases, focused/full Jest, plugin surface, skill exercise, candidate install/doctor, and fresh approved issue registered smoke in the existing Herdr pane topology. Stop on no progress; do not create a workspace or bypass smoke.
