# Tasks: Close contribution-gate evidence gaps in automated delivery

**Issue**: #360
**Date**: 2026-09-04
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/125-add-github-actions-contribution-gates-to-project-setup/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Generate and locally evaluate delivery PR evidence | [ ] |
| T002 | Add contribution-evidence regressions | [ ] |
| T003 | Verify no regressions | [ ] |

---

### T001: Generate and locally evaluate delivery PR evidence

**File(s)**: `scripts/contribution-evidence.mjs`, `scripts/sdlc-deliver.mjs`
**Type**: Create, Modify
**Depends**: None
**Acceptance**:
- [ ] `scripts/contribution-evidence.mjs` exists and exports `evaluateContributionEvidence` and `buildDeliveryPullRequestBody` with the signatures in design.md.
- [ ] `evaluateContributionEvidence` runs the embedded github-script from `references/contribution-gate.md`; it does not copy `classifyChangedPath` / `pathMentioned` / `hasSpecificVerification` into a second implementation.
- [ ] `createPullRequest` writes the evaluated body and no longer embeds `Closes #${issue}\n\nSpec: ${spec.relative}/\n\n## Verification\n\`${spec.relative}/verification-report.md\`\n`.
- [ ] `runDeliverUnlocked` runs local evaluation after version publish and before `gh pr create` or `gh pr edit --body-file`. Failure writes handoff `reasonCode: contribution_evidence_incomplete` and does not mutate the pull request.
- [ ] Body-only remote contribution-gate failures (unchanged head, only failing check name `Validate nmg-sdlc contribution evidence` or `nmg-sdlc contribution gate / Validate nmg-sdlc contribution evidence`, no unresolved bot threads) call `gh pr edit --body-file`, do not `git commit`, do not write `human_review`, and continue the observe loop.
- [ ] Mixed failing checks still emit `NMG_SDLC_REMEDIATION`. Human review and pathless bot threads still `human_review`.
- [ ] `references/contribution-gate.md` and `.github/workflows/nmg-sdlc-contribution-gate.yml` are byte-unchanged.

**Notes**: Follow the fix strategy from design.md. Keep changes minimal.

### T002: Add contribution-evidence regressions

**File(s)**: `scripts/__tests__/contribution-evidence.test.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Create, Modify
**Depends**: T001
**Acceptance**:
- [ ] `contribution-evidence.test.mjs`: a title/body/changed-path set with `scripts/sdlc-deliver.mjs`, `VERSION`, and `package.json` plus a body from `buildDeliveryPullRequestBody` evaluates `ok: true` with empty `errors`. The current three-line body against the same paths evaluates `ok: false` and `errors` include `Missing steering evidence` and `Unmatched changed paths`.
- [ ] `sdlc-deliver.test.mjs` AC1: creating a PR whose fixture diff includes an implementation path plus `VERSION` and `package.json` records a `gh pr create --body-file` whose file contents pass `evaluateContributionEvidence` for those paths.
- [ ] `sdlc-deliver.test.mjs` AC2: force incomplete evidence (stub `buildDeliveryPullRequestBody` or inject a body that omits steering and path names) and assert no `gh pr create` / `gh pr edit`, handoff `reasonCode: contribution_evidence_incomplete`, and summary contains the incomplete categories.
- [ ] `sdlc-deliver.test.mjs` AC3: existing OPEN PR at expected head, unfiltered check `Validate nmg-sdlc contribution evidence` FAILURE, no other failing checks, no human/bot threads; first observation edits the body via `gh pr edit --body-file`; no subsequent `git commit`; `reasonCode` is not `human_review`; after the edit the next snapshot can SUCCESS and continue observing (sleep or merge-ready). `result.stdout` must not contain `NMG_SDLC_REMEDIATION` for that gate-only failure.
- [ ] `sdlc-deliver.test.mjs` AC4: keep covering human threads and pathless automated threads → `human_review` and no merge (existing tests must still pass; add one only if a new intercept could skip them).
- [ ] Scenarios tagged `@regression` in `feature.gherkin` are covered by these tests (this repo uses Jest, not a Gherkin runner).

### T003: Verify no regressions

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`, `scripts/__tests__/exercise-contribution-gate.test.mjs`, `scripts/__tests__/contribution-gate-contract.test.mjs`
**Type**: Verify (no file changes)
**Depends**: T001, T002
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/contribution-evidence.test.mjs __tests__/sdlc-deliver.test.mjs __tests__/exercise-contribution-gate.test.mjs __tests__/contribution-gate-contract.test.mjs` exits 0.
- [ ] Live workflow remains byte-identical to the fenced template plus trailing newline; managed version remains `7`.
- [ ] Human-review, `CHANGES_REQUESTED`, required-check failure, and exact-head merge paths still pass in that focused run.

---

## Validation Checklist

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T002)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #360 | 2026-09-04 | Initial defect report |
