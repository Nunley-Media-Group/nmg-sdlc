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
| T001 | Host review isolation, empty/missing, one-step slice replacement | [ ] |
| T002 | Publication reconcile, mergeability inspect, bot/post-merge, safe-recoveries owner | [ ] |
| T003 | Behavioral regressions for AC1–AC11 | [ ] |
| T004 | Full registered gates, workflow exercise, live bypass, fresh smoke | [ ] |

---

### T001: Review isolation, empty/missing, one replacement

**File(s)**: `src/sdlc-review-isolation.mjs` (create), `src/extension.ts`, `scripts/sdlc-review-main.mjs`, `scripts/sdlc-execute.mjs`, `scripts/sdlc-safe-recoveries.mjs`, `workflows/review-main/` (after `skill://skill-creator`)
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Empty artifact → `review_empty` without writing `No findings.\n`
- [ ] Missing artifact → `review_artifact_missing` without creating the file
- [ ] `--result review_failed` unchanged
- [ ] Each slice pane receives `NMG_SDLC_REVIEW_SLICE=1`, absolute assignment JSON, and absolute receipt JSONL; assignment is per-slice not union
- [ ] Extension registers deny-all `tool_call`/`user_bash`/`user_python` synchronously at factory load before any `await`; then `setActiveTools(["read"])` (or proven empty fallback); receipts append-only
- [ ] Original review artifact/handoff/receipt bytes are never unlinked or rewritten; invalidation sidecar + attempt-2 files on first **proven** contamination
- [ ] Second contamination fails `invalid_review_slice`; `#369` `completedAttempts` and `#372` `recoveries[]` unchanged
- [ ] Missing hook/`setActiveTools`/receipt proof → `review_scope_unproven`, not a pass and not a replacement; cwd is ignored
- [ ] Ordinary sessions without the env at factory load do not call `setActiveTools` and keep existing tools
- [ ] `isAllowedSnapshotRead` denies scheme URIs, archive members, and unsupported selectors; allows exact snapshot files plus supported `raw`/line-range tails

**Notes**: Host receipts are the isolation contract. Do not scrape findings, tool argv, or pane cwd as compliance.

### T002: Publication, mergeability, bots, post-merge, standalone owner

**File(s)**: `scripts/sdlc-finalize-verification.mjs`, `scripts/sdlc-apply-review.mjs`, `scripts/sdlc-deliver.mjs`, `scripts/pr-delivery-state.mjs`, `scripts/sdlc-execute.mjs`, `scripts/sdlc-safe-recoveries.mjs`, `scripts/sdlc-status.mjs`, `commands/sdlc-execute.md`, `README.md`, `CHANGELOG.md`, `workflows/write-code/`, `workflows/verify-code/`, `workflows/open-pr/`, `workflows/execute/` (workflows after `skill://skill-creator`)
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Implement/fix/verify clean-ahead known commit pushes without new commit/force; exact upstream acks
- [ ] Fail/Partial/Incomplete never become Pass
- [ ] BEHIND/DIRTY/CONFLICTING inspect real base/head/conflicts; in-scope auto-mergeable trees reconcile once; leftover/out-of-scope conflicts stop with evidence
- [ ] Content/base change invalidates review+verify completions and re-runs those gates; no new `#374` keys; no `#369` deliver increment
- [ ] Bot `CHANGES_REQUESTED` is not `human_review`; pathless automation is `automatic_review_unactionable`; human review unchanged
- [ ] Post-merge ≤3 read-only observes; no merge replay; merged+open issue closes only with proven linkage or `merged_pr_child_still_open`
- [ ] Standalone finalize/deliver persist `safe-recoveries.json` under `resolveRecoveryOwner` `ownerId`, never under a fresh lease UUID, and do not create `.omp/sdlc/run.json`
- [ ] `#372` `recoveries[]` is never appended by these paths
- [ ] A second standalone invoke with a new lease UUID/`session-init` token for the same incomplete project/issue/branch/stage reuses the consumed owner and performs no second push or merge

**Coordinator clarification (AC10)**: Preserve the complete predecessor public
discovery/status contract in the source paths above, not only the execute
implementation. Preserve predecessor spec ownership and failed evidence; do not
claim predecessor delivery or issue closure.

### T003: AC1–AC11 behavioral tests

**File(s)**: `scripts/__tests__/sdlc-review-isolation.test.mjs` (create), `scripts/__tests__/extension-review-isolation.test.mjs` (create), `scripts/__tests__/sdlc-review-main.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-finalize-verification.test.mjs`, `scripts/__tests__/sdlc-apply-review.test.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`, `scripts/__tests__/pr-delivery-state.test.mjs`, `scripts/__tests__/sdlc-status.test.mjs`, `scripts/__tests__/interactive-plan-contract.test.mjs`, plus new `scripts/__tests__/sdlc-safe-recoveries.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] SCN001–SCN011 map to AC1–AC11
- [ ] Empty-rewrite test is deleted, not re-pinned
- [ ] Path allow denies absolute checkout paths, `../`, symlink escape, URLs, `skill://`/`artifact://`/`local://`/`ssh://`, archive members, and unknown selectors; allows exact snapshot `allowedPaths` and supported `file:50-100` / `:raw` tails on those files
- [ ] Fake `ExtensionAPI`: review env registers deny-all before any async `setActiveTools`; blocks bash/eval/python/task/write/edit/grep/glob/user_bash/user_python and records append-only receipts; env unset leaves `setActiveTools` uncalled
- [ ] Restart/reinvoke: consume `stage_publication` once; second `finalizeVerification`/`runDeliver` with a new `enterControllerLease` UUID observes the original `records[]` tuple and no second `git push`
- [ ] Observable reasonCodes, git argv, `safe-recoveries.json` ownerId+class+issue+step tuples, `recoveries[]` length, `completedAttempts`
- [ ] Injected `run`/`fs`/`sleep`/`herdr`; no live GitHub in these unit tests

**Notes**: Unit tests are necessary but not T004 delivery proof.

### T004: Registered gates, workflow exercise, live bypass, fresh smoke

**File(s)**: `workflows/review-main/`, `workflows/verify-code/`, `workflows/open-pr/`, `commands/sdlc-verify-code.md`, `commands/sdlc-open-pr.md`, `scripts/skill-inventory.baseline.json`, `steering/extensions/nmg-sdlc-smoke.mjs`, `scripts/__tests__/nmg-sdlc-smoke.test.mjs`
**Type**: Verify
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] `cd scripts && npm test` (full scripts suite) exits 0
- [ ] Applicable `node scripts/verify-plugin-surface.mjs --root . --label repository` and `node scripts/skill-inventory-audit.mjs --check` if workflow/agent surface changed
- [ ] Actual changed-workflow exercise: `node scripts/skill-exercise-runner.mjs --skill review-main` and `--skill verify-code` and `--skill open-pr` when those fixtures exist; otherwise `omp --print --no-session` loading this checkout's extension against a disposable project covering the changed review/publish/deliver paths
- [ ] Live isolation bypass against this checkout's extension with `NMG_SDLC_REVIEW_SLICE=1` and a real assignment/receipt: attempts of absolute original-checkout `read`, `../` traversal, `bash`, eval/python, `task`, network/`http` read, `skill://`/`artifact://`, and archive-member paths are blocked before execution and appear as `decision=block` receipts; a control `read` of an allowed snapshot file is `decision=allow`; a second disposable session without the env still has ordinary tools
- [ ] Fresh authorized invocation-bound live smoke: provision new smoke issues with approved specs through normal ownership; set `NMG_SDLC_SMOKE_ISSUES` to those numbers only; do not replay stopped smoke `#96`; run `node scripts/sdlc-execute.mjs run` with `NMG_SDLC_SMOKE_OWNED=1` against a non-shallow clone of `Nunley-Media-Group/nmg-sdlc-smoke`; pass only with exact-head MERGED PR + CLOSED issue proof for this invocation
- [ ] Coordinator staging: reserve fresh smoke #98 for the standard downstream final verification after manager-based immutable candidate installation; implementation runs source-local proof and does not consume that queue or claim the live gate passed.
- [ ] `#369` loop stop, `#372` bare `recoveries[]` one-shot, pending-CI wait, unchanged contribution-gate body, exact-head CAS mismatch still fail-closed in the suite

**Coordinator implementation clarification (AC10/AC11, verification repair)**:
Resolve the smoke provider's controller with the existing
`scripts/plugin-controller-path.mjs` resolver conventions and propagate the
selected `NMG_SDLC_PLUGIN_ROOT` into execution in the smoke clone. An explicit
candidate root must win over the source project root so candidate review receipts
are inspected by the same isolation module identity. Fail unresolved controllers
before remote execution. Prove selection with real isolated source/candidate
locations and compatible receipt inspection, not only mocked command arguments.
Preserve exact isolation-module URL validation, receipt bytes, source-native
proof hashes, and the canonical failed Incomplete report. This clarifies existing
T004 parity behavior; it grants no scope bypass, custom allowlist, remote replay,
replacement queue, installed-candidate edit, or publication authority.

The command Markdown files are generated mirrors of the approved workflows.
Regenerate them with the existing command renderer; do not author independent
behavior in those mirrors.

**Implementation finalization evidence (2026-09-07)**: The retained
`.omp/sdlc/evidence/374-implement-final-suite.log` records 1048 passed tests,
zero failures, and two expected skips. Main supplied genuine native-tool proof
at `.omp/sdlc/evidence/native-builtin-proof/`: original/copy byte parity and both
source-module SHA256 hashes verified. Existing native `bash`, `eval` (the host's
code tool), and `task` calls were blocked by source hooks; assigned `read` passed,
direct `user_bash` was blocked, and host final-result capture was valid and
uncontaminated. No custom tools were registered, and the one-use proof was not
rerun. Original failed/intervention evidence remains immutable in
`.omp/sdlc/evidence/374-before-native-builtin-proof/`.

The first finalization stopped before publication when the required
`sdlc-safe-recoveries.mjs bind` exited 1, `recovery_owner_missing`: newly acquired
leases store their validated identity in `lease.record`, unlike joined leases.
That failed handoff and evidence are preserved in
`.omp/sdlc/evidence/374-before-lease-shape-repair/`. Main authorized the narrow
T002/AC8 repair: publication CLI, verification finalization, and apply-review
now select the validated record using the existing `owned` distinction.
No lease API redesign, ownership bypass, or controller checkpoint edit occurred.
Real isolated CLI tests cover fresh/joined bind and rejected checkpoint/live-lease
identities; finalization tests prove exact remote publication for fresh/joined
leases. The targeted three-suite run passed 88 tests, and the actual source
`bind` now passes with original owner `d89d8ee2-1964-467f-a325-d2dec8f8acb6`.
Smoke #98 remains unconsumed for standard final verification after review and
candidate installation; T004 overall delivery proof is not passed.
The final source suite after the lease repair passed 1054 tests with zero failures
and the same two expected skips (`NMG_SDLC_PLUGIN_ROOT` explicitly selected this
checkout; timeout 0). Full output is retained at
`.omp/sdlc/evidence/374-lease-repair-final-suite.log`. Both native-proof source
module hashes remain unchanged; no RPC/isolation proof or smoke was rerun.

---

## Validation Checklist

- [x] Tasks focused on the fix
- [x] Regression tests included
- [x] Verifiable acceptance
- [x] Paths match `structure.md`
- [x] T004 is full delivery proof, not mocked argv alone
