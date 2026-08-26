# Verification Report: Resolve missing required-check event provenance

**Issue**: #284
**Date**: 2026-08-26
**Reviewer**: Inline architecture and acceptance verification
**Status**: Pass

## Executive Summary

Delivery now resolves missing aggregate-check events from exact linked GitHub Actions runs. Enrichment requires the run head SHA to equal the PR head. Exact `pull_request` and `pull_request_target` runs canonicalize to the existing `pull_request` identity; push, merge_group, malformed, unreadable, empty, unknown, and head-mismatched evidence remains fail-closed. Existing explicit events are never replaced.

## Acceptance Criteria

- AC1: Pass — missing events resolve only through exact Actions run links and exact PR heads.
- AC2: Pass — pull_request and pull_request_target canonicalize to accepted PR provenance.
- AC3: Pass — unsafe resolutions remain rejected by existing classification.
- AC4: Pass — explicit events bypass enrichment.
- AC5: Pass — duplicate, readiness, review, exact-head merge, and closure logic is unchanged.

## Architecture

- SOLID: 5/5 — one bounded enrichment function before existing classification.
- Security: 5/5 — no empty-field trust; exact run, exact head, closed PR-event allowlist.
- Performance: 5/5 — one cached lookup per run id per snapshot.
- Testability: 5/5 — pure injected resolver with generic event/head/link cases.
- Error handling: 5/5 — lookup and parse failures preserve fail-closed empty provenance.

## Verification

- `cd scripts && npm test -- --runInBand __tests__/sdlc-deliver.test.mjs` — passed, 40 tests.
- `cd scripts && npm test -- --runInBand` — passed, 670 tests with 2 skipped.
- `cd scripts && npm run compat` — plugin surface validation passed.
- `node scripts/sdlc-verify-steering.mjs --project . --issue 284 --spec specs/284-resolve-missing-required-check-event-provenance --base main` — passed with complete 2/2 required coverage and no ceiling.
- Live evidence: PR #113 required check had empty event and Actions run 33002331115 resolved to `pull_request_target` at exact head `861ff7e61d3d6cd9dd3e64ca1d68741d9347318b`.

## Remaining Issues

None for #284.
