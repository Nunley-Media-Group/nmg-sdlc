# Verification Report: Durable review receipt collection

**Issue**: #420
**Date**: 2026-09-24
**Candidate head at registered gate**: `6b4858f88c0a1365a2e5bbc510957139e2d6c6b0`

### Implementation Status: Fail

The focused collector regression is fixed locally, but the required registered smoke gate still fails. No review result was forged, no verification gate was marked passed, and this issue is not ready to merge or install as a merged head.

<!-- nmg-sdlc-issue-scope: {"issueNumber":420,"specPath":"specs/420-wait-for-durable-review-receipts-before-closing-sibling-panes","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3"],"functionalRequirements":["FR1","FR2","FR3"],"tasks":["T001","T002","T003"],"scenarios":["SCN001","SCN002","SCN003"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Retained #129 evidence and reproduction

- Original smoke clone: `/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-smoke-2hBS7G`, run `e3386db6-a416-4245-900d-96620bc6b853`, stopped review1 `review_scope_unproven`. Reviewer 1's final host receipt was recorded at 00:54:37.208Z; reviewers 2/3 lacked final receipts and were aborted after the controller closed review panes at 00:54:37.672–37.793Z. Retained assignments and receipt prefixes validate read-only now. The instantaneous invalid read causing the original stop was not recorded.
- Before source change, a deterministic fixture in `scripts/__tests__/sdlc-execute.test.mjs` failed: the collector attempted to close the first pane before all sibling workers had been waited for (`pane_close_failed` under an explicit ordering guard). After the source change, that fixture and a partial-JSONL host-receipt completion fixture pass; persistent malformed/foreign/missing receipts continue to fail. This proves an early-close behavior, **not** that it was the sole cause of the original live stop.
- `discoverRecovery` on retained #129 after the change remains `blocked`, `review_scope_unproven`, `missing_handoff`, with only inspect-or-keep-stopped actions. No unchanged replay was attempted.

## Verification commands

| Command | Outcome |
|---|---|
| `npm test -- --runInBand __tests__/sdlc-execute.test.mjs __tests__/sdlc-review-isolation.test.mjs` | 467 tests passed |
| `npm test -- --runInBand` | 56 suites passed, 1 skipped; 1,561 tests passed, 2 skipped |
| `node scripts/verify-plugin-surface.mjs --root . --label candidate-420` | passed |
| `node scripts/verify-current-specs.mjs` | passed, 91 genuine issue specs |
| Candidate `omp plugin doctor` | 5 OK, 0 warnings/errors; version 3.24.6 |
| `NMG_SDLC_SMOKE_ISSUES=131 node scripts/sdlc-verify-steering.mjs --project . --issue 420 --spec specs/420-wait-for-durable-review-receipts-before-closing-sibling-panes --base origin/main` | **Fail**: complete coverage 2/2; `repository.tests` passed, `repository.nmg-sdlc-smoke` failed with nested review1 `review_scope_unproven` |

## Changed-hypothesis smoke evidence

Fresh smoke issue [#131](https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/131) is open with `spec-created`; four-file approved spec-only [PR #132](https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/132) passed contribution/Python CI and merged at exact head `06f83810f60a3e08ba8c35634fab45f286333f96`. This issue/spec was prepared manually, **not** through native `/sdlc-draft-issue` or `/sdlc-write-spec` approval. The registered provider cloned it and the implementation worker committed `894b4ab3af6386cc6e0818602eac4ec258b3a0e7` before review1.

The retained clone is `/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-smoke-aSaqsd`, nested run `b87dafcd-f72e-45d8-8129-2d420944f5fe`. Reviewer 1 recorded a valid final host result at 01:51:32.726Z; reviewer 2 had read receipts but no final result; reviewer 3 had only startup. Herdr server logs show the controller closing their panes at 01:51:33.191–33.315Z, causing SIGHUP/aborted model requests for reviewers 2/3. The candidate's wait-all/recheck change was insufficient on the live path. The exact throw site is not recorded; do not assert a transient JSONL read was the live root cause.

## Disposition

Stop under the no-progress rule: no second unchanged #131 attempt, no replacement issue, no edited success evidence, and no new Herdr workspace/tab. The global plugin link was restored to clean #415 merged head `c408365bdea3c9ace3ebd6914d4f82fd01fa8885` (v3.24.5), `omp plugin doctor` 5 OK. Keep #420 and #417 draft/unmerged and their issues open. #418 must not merge on its own incomplete registered smoke. Before another authorized smoke, determine the precise review collection/worker-state failure using bounded diagnostic evidence rather than guessing from retained receipts; coordinate the shared `scripts/sdlc-execute.mjs` and global install boundary with #418.
