# Tasks: Regenerate Failed Verification After Repair

**Issue**: #433
**Status**: Approved
**Date**: 2026-09-24
**Author**: NMG

## Reproduction and contract
- [ ] Add a deterministic before-fix A→B Fail/Partial reproduction in `scripts/__tests__/sdlc-recover-verification.test.mjs` and unsafe negative variants.
- [ ] Bind the existing owner, original report/artifact, exact issue/spec/branch/manifest, clean distinct published B and one-use consumption in `scripts/sdlc-recover-verification.mjs`.
- [ ] Archive exact A evidence with digests and durable receipt before allowing a new B gate; do not clear or rewrite controller/owner state.
- [ ] Update `workflows/verify-code/WORKFLOW.md` to distinguish changed-head failed reports, including mixed local failure, from same-head external-only Incomplete and genuine publication-only recovery.
- [ ] Preserve `scripts/sdlc-finalize-verification.mjs` as the sole report/handoff publisher; change it only if needed to prove B identity and safe publication.
- [ ] Checkpoint prior failure heads, changed paths, report/gate digests and attempted approaches in `scripts/sdlc-execute.mjs`; permit additional verify remediations only on distinct issue-owned progress and stop unchanged/repeated evidence.
- [ ] Allow a truthful B Fail report with exact head and new gate evidence to drive a further distinct repair without granting delivery; preserve incomplete/unsafe intervention.
- [ ] Apply the evidence-driven progress/no-progress policy to each remediable stage using its existing publication, review, verification or delivery proof adapter; retain start/external one-use gates.
- [ ] Test at least three progressful attempts and identical-evidence stops across implement, review/fix, verify and deliver; preserve exact PR/provider/broker side-effect boundaries.

## Proof and delivery
- [ ] Cover passing B, failing B, mixed Incomplete local failure, unchanged head, dirty/foreign/unsafe evidence, consumed recheck, server-side legacy chronology, registered required-result integrity and exact-head report replacement in focused tests.
- [ ] Read skill-creator guidance; validate the plugin's `WORKFLOW.md` with plugin-surface/skill-inventory checks and disposable Pi exercise, plus full Jest and current-spec validation on the final clean head.
- [ ] Run registered `repository.tests` and real `repository.nmg-sdlc-smoke`; preserve failed clones and stop if the smoke attempt policy blocks a fresh fixture.
- [ ] Update README, CHANGELOG and lockstep VERSION/package metadata; deliver separate issue-linked spec-only and implementation PRs with exact-head checks and review.
- [ ] Install only the exact merged plugin head from a clean pin, then resume the same PennyScan #204 checkpoint with no manual edits or unchanged retry.
