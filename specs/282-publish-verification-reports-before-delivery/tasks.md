# Tasks: Publish verification reports before delivery

**Issue**: #282
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG

---

## Implementation

- [x] T1 — Add deterministic verification-finalization controller and argument validation.
- [x] T2 — Validate report identity and allow only the active report as non-runtime dirt.
- [x] T3 — Commit changed report evidence, push without force, and prove synchronization.
- [x] T4 — Write complete passed or failed verify handoffs from the controller.
- [x] T5 — Route verify-code and generated command through the controller.

## Regression Coverage

- [x] T6 — Prove changed report publication yields a clean synchronized head.
- [x] T7 — Prove identical published report creates no commit.
- [x] T8 — Prove unexpected dirty paths and unsafe reports fail closed.
- [x] T9 — Prove add, commit, upstream, and push failures cannot pass.
- [x] T10 — Prove execute advances from verify to delivery only with the published report handoff.

## Documentation and Delivery

- [x] T11 — Synchronize README, changelog, references, and generated surfaces.
- [x] T12 — Run focused, compatibility, full-suite, and steering verification.
- [ ] T13 — Merge exact head, install the plugin, and resume PennyScan #103/#104.

## Verification Evidence

- `cd scripts && npm test -- --runInBand __tests__/sdlc-finalize-verification.test.mjs` — passed, 9 tests.
- `cd scripts && npm test -- --runInBand` — passed, 661 tests with 2 skipped.
- `cd scripts && npm run compat` — passed.
- `node scripts/sdlc-verify-steering.mjs --project . --issue 282 --spec specs/282-publish-verification-reports-before-delivery --base main` — passed with complete 2/2 required validation coverage and no ceiling.


## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #282 | 2026-08-26 | Initial approved task plan |
