# Tasks: Resolve missing required-check event provenance

**Issue**: #284
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG

---

## Implementation

- [ ] T1 — Parse exact Actions run ids from missing-event check links.
- [ ] T2 — Resolve run event and head SHA once per run id.
- [ ] T3 — Enrich only exact-head records and preserve explicit events.
- [ ] T4 — Keep malformed, unreadable, mismatched, and non-PR evidence fail-closed.

## Regression Coverage

- [ ] T5 — Prove exact-head pull_request enrichment passes provenance.
- [ ] T6 — Prove push, merge_group, empty, and unknown events fail.
- [ ] T7 — Prove head mismatch, malformed link, and unreadable run fail.
- [ ] T8 — Prove explicit events are not replaced and lookups are cached.

## Verification and Delivery

- [ ] T9 — Update README and changelog.
- [ ] T10 — Run focused, full-suite, compatibility, and steering verification.
- [ ] T11 — Merge, install, and resume PennyScan #103/#104.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #284 | 2026-08-26 | Initial approved task plan |
