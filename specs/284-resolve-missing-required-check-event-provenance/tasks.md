# Tasks: Resolve missing required-check event provenance

**Issue**: #284
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG

---

## Implementation

- [x] T1 — Parse exact Actions run ids from missing-event check links.
- [x] T2 — Resolve run event and head SHA once per run id.
- [x] T3 — Enrich only exact-head records and preserve explicit events.
- [x] T4 — Keep malformed, unreadable, mismatched, and non-PR evidence fail-closed.

## Regression Coverage

- [x] T5 — Prove exact-head pull_request and pull_request_target enrichment passes canonical provenance.
- [x] T6 — Prove push, merge_group, empty, and unknown events fail.
- [x] T7 — Prove head mismatch, malformed link, and unreadable run fail.
- [x] T8 — Prove explicit events are not replaced and lookups are cached.

## Verification and Delivery

- [x] T9 — Update README and changelog.
- [x] T10 — Run focused, full-suite, compatibility, and steering verification.
- [ ] T11 — Merge, install, and resume PennyScan #103/#104.

## Verification Evidence

- `cd scripts && npm test -- --runInBand __tests__/sdlc-deliver.test.mjs` — passed, 40 tests.
- `cd scripts && npm test -- --runInBand` — passed, 670 tests with 2 skipped.
- `cd scripts && npm run compat` — passed.
- `node scripts/sdlc-verify-steering.mjs --project . --issue 284 --spec specs/284-resolve-missing-required-check-event-provenance --base main` — passed with complete 2/2 required coverage and no ceiling.
- Behavior for `scripts/sdlc-deliver.mjs`: resolves missing events from cached exact-head Actions runs and canonicalizes only PR-scoped events.
- Behavior for `scripts/__tests__/sdlc-deliver.test.mjs`: covers pull_request, pull_request_target, push, merge_group, empty, head mismatch, malformed links, unreadable runs, explicit events, and cache reuse.
- Behavior for `VERSION`: records patch release 3.17.8.
- Behavior for `package.json`: publishes matching plugin version 3.17.8.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #284 | 2026-08-26 | Initial approved task plan |
