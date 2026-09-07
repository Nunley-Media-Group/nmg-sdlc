# Tasks: Recover bounded automatic delivery stops without loops

**Issue**: #374
**Date**: 2026-09-07
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/372-restore-bounded-operator-authorized-recovery-of-stopped-delivery/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Review empty/missing, snapshot isolation, one-step slice replacement | [ ] |
| T002 | Publication reconcile, mergeability inspect, bot/post-merge, safe-recoveries owner | [ ] |
| T003 | Behavioral regressions for AC1–AC10 | [ ] |
| T004 | Full registered gates, workflow exercise, fresh smoke | [ ] |

---

### T001: Review isolation, empty/missing, one replacement

**File(s)**: `scripts/sdlc-review-main.mjs`, `scripts/sdlc-execute.mjs`, `scripts/sdlc-safe-recoveries.mjs`, `workflows/review-main/` (after `skill://skill-creator`)
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Empty artifact → `review_empty` without writing `No findings.\n`
- [ ] Missing artifact → `review_artifact_missing` without creating the file
- [ ] `--result review_failed` unchanged
- [ ] Each slice pane cwd is a temp snapshot of that slice's allowedPaths only; assignment is per-slice not union
- [ ] Original review artifact/handoff bytes are never unlinked or rewritten; invalidation sidecar + attempt-2 files on first replacement
- [ ] Second contamination fails `invalid_review_slice`; `#369` `completedAttempts` and `#372` `recoveries[]` unchanged
- [ ] Missing snapshot cwd proof → `review_scope_unproven`, not a pass

**Notes**: `paneSplit({ cwd: snapshotDir })` is the host isolation contract. Do not scrape findings or tool argv as compliance.

### T002: Publication, mergeability, bots, post-merge, standalone owner

**File(s)**: `scripts/sdlc-finalize-verification.mjs`, `scripts/sdlc-apply-review.mjs`, `scripts/sdlc-deliver.mjs`, `scripts/pr-delivery-state.mjs`, `scripts/sdlc-execute.mjs`, `scripts/sdlc-safe-recoveries.mjs`, `workflows/write-code/`, `workflows/verify-code/`, `workflows/open-pr/`, `workflows/execute/` (workflows after `skill://skill-creator`)
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Implement/fix/verify clean-ahead known commit pushes without new commit/force; exact upstream acks
- [ ] Fail/Partial/Incomplete never become Pass
- [ ] BEHIND/DIRTY/CONFLICTING inspect real base/head/conflicts; in-scope auto-mergeable trees reconcile once; leftover/out-of-scope conflicts stop with evidence
- [ ] Content/base change invalidates review+verify completions and re-runs those gates; no new `#374` keys; no `#369` deliver increment
- [ ] Bot `CHANGES_REQUESTED` is not `human_review`; pathless automation is `automatic_review_unactionable`; human review unchanged
- [ ] Post-merge ≤3 read-only observes; no merge replay; merged+open issue closes only with proven linkage or `merged_pr_child_still_open`
- [ ] Standalone finalize/deliver persist `safe-recoveries.json` under lease runId and do not create `run.json`
- [ ] `#372` `recoveries[]` is never appended by these paths

### T003: AC1–AC10 behavioral tests

**File(s)**: `scripts/__tests__/sdlc-review-main.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-finalize-verification.test.mjs`, `scripts/__tests__/sdlc-apply-review.test.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`, `scripts/__tests__/pr-delivery-state.test.mjs`, plus new `scripts/__tests__/sdlc-safe-recoveries.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] SCN001–SCN010 map to AC1–AC10
- [ ] Empty-rewrite test is deleted, not re-pinned
- [ ] Observable reasonCodes, git argv, `safe-recoveries.json` key tuples, `recoveries[]` length, `completedAttempts`
- [ ] Injected `run`/`fs`/`sleep`/`herdr`; no live GitHub in these unit tests

**Notes**: Unit tests are necessary but not T004 delivery proof.

### T004: Registered gates, workflow exercise, fresh smoke

**File(s)**: changed workflows as exercised; no smoke `#96` queue
**Type**: Verify
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] `cd scripts && npm test` (full scripts suite) exits 0
- [ ] Applicable `node scripts/verify-plugin-surface.mjs --root . --label repository` and `node scripts/skill-inventory-audit.mjs --check` if workflow/agent surface changed
- [ ] Actual changed-workflow exercise: `node scripts/skill-exercise-runner.mjs --skill review-main` and `--skill verify-code` and `--skill open-pr` when those fixtures exist; otherwise `omp --print --no-session` loading this checkout's extension against a disposable project covering the changed review/publish/deliver paths
- [ ] Fresh authorized invocation-bound live smoke: provision new smoke issues with approved specs through normal ownership; set `NMG_SDLC_SMOKE_ISSUES` to those numbers only; do not replay stopped smoke `#96`; run `node scripts/sdlc-execute.mjs run` with `NMG_SDLC_SMOKE_OWNED=1` against a non-shallow clone of `Nunley-Media-Group/nmg-sdlc-smoke`; pass only with exact-head MERGED PR + CLOSED issue proof for this invocation
- [ ] `#369` loop stop, `#372` bare `recoveries[]` one-shot, pending-CI wait, unchanged contribution-gate body, exact-head CAS mismatch still fail-closed in the suite

---

## Validation Checklist

- [x] Tasks focused on the fix
- [x] Regression tests included
- [x] Verifiable acceptance
- [x] Paths match `structure.md`
- [x] T004 is full delivery proof, not mocked argv alone
