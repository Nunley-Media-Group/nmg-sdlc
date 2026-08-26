# Tasks: Publish verification reports before delivery

**Issue**: #282
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG

---

## Implementation

- [ ] T1 — Add deterministic verification-finalization controller and argument validation.
- [ ] T2 — Validate report identity and allow only the active report as non-runtime dirt.
- [ ] T3 — Commit changed report evidence, push without force, and prove synchronization.
- [ ] T4 — Write complete passed or failed verify handoffs from the controller.
- [ ] T5 — Route verify-code and generated command through the controller.

## Regression Coverage

- [ ] T6 — Prove changed report publication yields a clean synchronized head.
- [ ] T7 — Prove identical published report creates no commit.
- [ ] T8 — Prove unexpected dirty paths and unsafe reports fail closed.
- [ ] T9 — Prove add, commit, upstream, and push failures cannot pass.
- [ ] T10 — Prove execute advances from verify to delivery only with the published report handoff.

## Documentation and Delivery

- [ ] T11 — Synchronize README, changelog, references, and generated surfaces.
- [ ] T12 — Run focused, compatibility, full-suite, and steering verification.
- [ ] T13 — Merge exact head, install the plugin, and resume PennyScan #103/#104.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #282 | 2026-08-26 | Initial approved task plan |
