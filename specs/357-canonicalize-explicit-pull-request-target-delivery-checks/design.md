# Root Cause Analysis: Canonicalize explicit pull_request_target delivery checks

**Issue**: #357
**Date**: 2026-09-03
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/284-resolve-missing-required-check-event-provenance/

---

## Root Cause

`enrichMissingCheckEvents` returns every check with a non-empty event before inspecting its Actions run. Issue #284 therefore canonicalizes `pull_request_target` only when the original event is empty. A job-level check that already reports `pull_request_target` bypasses exact-head run resolution and reaches `classifyPrDeliveryState`, which accepts only the canonical `pull_request` identity.

The defect appears when delivery merges required and unfiltered successful checks into one snapshot. The review-policy job remains correctly observed, but its explicit event makes otherwise valid exact-head evidence unverifiable.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-deliver.mjs` | `enrichMissingCheckEvents` | Resolves run provenance and canonicalizes exact-head PR-scoped events. |
| `scripts/__tests__/sdlc-deliver.test.mjs` | event enrichment tests | Proves canonicalization, preservation, fail-closed behavior, and cache use. |

### Triggering Conditions

- A successful observed check explicitly reports `pull_request_target`.
- Its job link identifies the exact Actions run at the PR head.
- Snapshot classification requires canonical `pull_request` provenance.

---

## Fix Strategy

### Approach

Treat explicit `pull_request_target` as a candidate for the same authoritative Actions-run resolution already used for missing events. Canonicalize it only when the linked run is readable, reports PR-scoped provenance, and its head SHA equals the PR head. On malformed, unreadable, or mismatched evidence, preserve the explicit value so classification continues to reject it.

Keep all other explicit events unchanged and retain every check in the snapshot. Reuse the existing per-run cache and missing-event path rather than adding a second classifier identity.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-deliver.mjs` | Resolve and canonicalize explicit `pull_request_target` only with exact-head Actions evidence. | Closes the provenance gap without weakening classification. |
| `scripts/__tests__/sdlc-deliver.test.mjs` | Add explicit-event exact-head and failure regressions. | Proves the live bug and fail-closed boundaries. |
| `README.md`, `CHANGELOG.md` | Record exact-head explicit-event behavior and patch release. | Keeps public delivery semantics and release history current. |

### Blast Radius

- **Direct impact**: Delivery snapshot event enrichment.
- **Indirect impact**: PR readiness classification receives canonical provenance for one additional verified input shape.
- **Risk level**: Low; no check is removed and classifier rules remain unchanged.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Base-head or unrelated `pull_request_target` evidence is trusted | Low | Require linked run head SHA equality before canonicalization. |
| Push or merge-group evidence is accepted | Low | Preserve non-PR events and assert fail-closed classification. |
| Issue #284 missing-event behavior regresses | Low | Keep existing tests and add explicit-event cases beside them. |
| Run lookup work is duplicated | Low | Reuse the existing per-run cache. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Accept two event identities in classification | Treat both `pull_request` and `pull_request_target` as merge-ready. | Loses the existing canonical identity and moves exact-head proof away from enrichment. |
| Drop the extra review-policy job | Filter the offending check from the snapshot. | Hides required evidence and weakens review-policy observation. |

---

## Validation Checklist

- [x] Root cause is identified with specific code references
- [x] Fix is minimal and keeps classification fail-closed
- [x] Blast radius and regression risks are documented
- [x] Fix follows the existing issue #284 enrichment pattern
