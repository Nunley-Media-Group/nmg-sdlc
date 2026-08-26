# Tasks: Navigate paginated wrapped review branch picker

**Issue**: #274
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG

---

## Implementation

- [x] T1 — Update `scripts/sdlc-execute.mjs` to reconstruct wrapped picker fragments against a unique contiguous visible segment of known branch names.
- [x] T2 — Update `scripts/sdlc-execute.mjs` to expose the cursor-owned branch and compute Up/Down navigation relative to that selection.
- [x] T3 — Preserve existing numbered, unnumbered, fresh-worker, retained-worker, wait, and fail-closed behavior.

## Regression Coverage

- [x] T4 — Add a `scripts/__tests__/sdlc-execute.test.mjs` fixture with at least 18 branches, five visible wrapped options, pagination, and off-screen `main`.
- [x] T5 — Prove fresh and retained review workers send navigation plus Enter and continue only after review settlement.
- [x] T6 — Prove malformed, incomplete, cursor-invalid, and ambiguous visible segments send no selection keys and fail closed.

## Documentation and Verification

- [x] T7 — Update `README.md` and `CHANGELOG.md` for the corrected OMP picker integration.
- [x] T8 — Run focused execute tests and record command plus outcome.
- [x] T9 — Run repository-required validation and record command plus outcome.
- [ ] T10 — Open a linked pull request with steering alignment and exact-path evidence, pass hosted checks, merge exact head to `main`, and close #274.

## Verification Evidence

- `cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs` — passed, 165 tests.
- `cd scripts && npm test -- --runInBand` — passed, 643 tests with 2 skipped.
- `node scripts/sdlc-verify-steering.mjs --project . --issue 274 --spec specs/274-fix-navigate-paginated-wrapped-review-branch-picker --base main` — passed with `ceiling: null`, including the required read-only consumer smoke.
- Behavior for `scripts/sdlc-execute.mjs`: recognized a five-option wrapped first page from 18 known branches, sent eight Down events plus Enter to off-screen `main`, and preserved fail-closed ambiguity handling.
- Behavior for `scripts/__tests__/sdlc-execute.test.mjs`: covered fresh, retained, upward, malformed, and ambiguous picker transitions.

## Steering Alignment

- Product: restores automated two-review delivery for repositories with realistic branch counts without involving project steering before the host review completes.
- Technical: retains zero-dependency Node ESM, Herdr argument arrays, deterministic parsing, and fail-closed orchestration.
- Structure: keeps controller behavior in `scripts/sdlc-execute.mjs`, deterministic coverage in `scripts/__tests__/`, and issue-owned behavior in this spec.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #274 | 2026-08-26 | Initial approved task plan |
