# Design: Resolve missing required-check event provenance

**Issue**: #284
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/195-move-exact-head-delivery-into-a-controller-with-on-demand-remediation/

---

## Overview

Keep fail-closed classification in `pr-delivery-state.mjs`. Enrich check records inside `sdlc-deliver.mjs` while the exact PR head is available. Existing non-empty events pass through unchanged. Missing events are eligible only when their link identifies a GitHub Actions run.

## Resolution Contract

1. Parse `/actions/runs/<positive-id>` from the check URL.
2. Resolve each run id once per snapshot with `gh run view <id> --json event,headSha`.
3. Require schema-valid non-empty event and 40-hex head SHA.
4. Require run head SHA equals the fetched PR `headRefOid`.
5. Canonicalize exact-head `pull_request` and `pull_request_target` run events to the existing `pull_request` check identity; preserve other resolved events so classification rejects them. `pull_request_target` is accepted only with the same exact PR-head equality required for `pull_request`, preventing base-head or unrelated-run substitution.
6. On any failure, retain the empty event so existing classification rejects it.

## Affected Paths

- `scripts/sdlc-deliver.mjs`: run-link parsing, cached resolution, and snapshot enrichment.
- `scripts/__tests__/sdlc-deliver.test.mjs`: generic provenance regressions.
- `README.md`, `CHANGELOG.md`, and issue-owned verification evidence.

## Verification Strategy

- Focused delivery controller tests.
- Full scripts suite and plugin compatibility.
- Deterministic steering validation.
- Live PR evidence proving an empty aggregate event resolves from an exact-head `pull_request_target` run to canonical `pull_request` provenance.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #284 | 2026-08-26 | Initial approved bug-fix design |
| #284 | 2026-08-26 | Approved amendment: canonicalize exact-head `pull_request_target` provenance |
