# Tasks: Repair obsolete steering manifests during project upgrades

**Issue**: #314
**Date**: 2026-08-28
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/291-enforce-one-controller-writer-and-close-stale-workers/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Detect and repair obsolete current-layout manifests | [ ] |
| T002 | Add regression and documentation contracts | [ ] |
| T003 | Verify the focused and repository contracts | [ ] |

---

### T001: Detect and repair obsolete current-layout manifests

**File(s)**: `scripts/sdlc-upgrade.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Current-layout manifests with at least one `byteBound` snippet field produce one actionable `steering-runtime` item without detection-time mutation
- [ ] The plan is `mode: "update"`, is bound to the complete current `steeringSourceDigest`, and contains only a `steering/manifest.json` write
- [ ] The candidate manifest removes only `byteBound` and preserves every other top-level and snippet value
- [ ] Every repaired snippet is validated through existing `canonicalSnippetRecord`
- [ ] `byteBound` plus any additional unknown snippet field fails with `steering_manifest_unknown_key`
- [ ] Apply continues through existing `applySteeringRuntime` staged validation and stale-plan checks
- [ ] Legacy Markdown migration behavior is unchanged

### T002: Add regression and documentation contracts

**File(s)**: `scripts/__tests__/sdlc-upgrade.test.mjs`, `README.md`, `scripts/__tests__/steering-contract.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Regression fixtures cover read-only detection, approved repair, preserved registrations and bodies, post-repair runtime loading, repeat detection, and stale-plan rejection
- [ ] A fixture with `byteBound` plus another unknown field fails closed and remains unchanged
- [ ] README directs users to run `/sdlc-upgrade-project` after every install or update
- [ ] README directs users to review and apply relevant approved migrations before other workflows
- [ ] The README instruction is locked by a public contract test

### T003: Verify the focused and repository contracts

**File(s)**: Existing verification commands only
**Type**: Verify
**Depends**: T001, T002
**Acceptance**:
- [ ] Focused `sdlc-upgrade` and `steering-contract` Jest tests pass
- [ ] The complete scripts Jest suite passes
- [ ] `node scripts/verify-plugin-surface.mjs --root . --label repository` passes
- [ ] The BDD scenarios in `feature.gherkin` map one-to-one to AC1–AC5

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #314 | 2026-08-28 | Initial defect report |
