# Verification Report: Resume execute from branch evidence and deliver only full-green verification

**Issue**: #436
**Date**: 2026-09-25

## Implementation Status: Pass

## Registered Steering Gate

`NMG_SDLC_PLUGIN_ROOT="$PWD" NMG_SDLC_SMOKE_ISSUES=158 node scripts/sdlc-verify-steering.mjs --project . --issue 7 --spec specs/7-verify-code-skill --base main` — passed (`ok: true`, `ceiling: null`, coverage 2/2 complete).

- `repository.tests` — passed (`npm test -- --runInBand` exited 0).
- `repository.nmg-sdlc-smoke` — passed ("nmg-sdlc-smoke delivered #158"). The candidate's nested `/sdlc-execute #158` ran start → verify → deliver; Nunley-Media-Group/nmg-sdlc-smoke PR #160 merged at exact head `5d3367079d653258787f551e8299a7b9a3409539` with an invocation-bound pre-merge receipt, and issue #158 is CLOSED.

Earlier live attempts found and fixed plugin defects before the green run: large dirty-diff identity (`ENOBUFS`), real Herdr pane-layout parsing, receipt-less failed smoke state blocking a changed candidate, Fail reports routed as interventions, delivery missing `NMG_SDLC_SMOKE_RECOVERY`, and open baseline PRs treated as prior proof. Each has a regression test.

## Local Verification

- `npm test -- --runInBand` from `scripts/` — passed (49 suites; 793 passed, 2 skipped).
- `node scripts/verify-plugin-surface.mjs --root . --label repository` — passed.
- `node scripts/verify-current-specs.mjs` — passed.
- `node scripts/skill-inventory-audit.mjs --check` — passed (90 items mapped).

## Acceptance Criteria

- AC1: passed — `scripts/__tests__/sdlc-execute.test.mjs` resumes a clean branch with corrupt `run.json`/`safe-recoveries.json` straight to verify, preserves dirty partial work, and rejects a conflicting explicit issue.
- AC2: passed — `scripts/__tests__/sdlc-execute.test.mjs` repairs more than two distinct failures without a cap and diagnoses repeated identical evidence; `scripts/__tests__/sdlc-safe-recoveries.test.mjs` acknowledges an already-published exact head without a second push.
- AC3: passed — `scripts/__tests__/sdlc-finalize-verification.test.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`, and `scripts/__tests__/sdlc-verification-runtime.test.mjs` require complete exact-head registered results, keep PR-only evidence in a draft, and merge only at the exact head; live smoke PR #160 confirms it.
- AC4: passed — `scripts/__tests__/nmg-sdlc-smoke.test.mjs` rejects runId-only and foreign-invocation receipts and accepts a resumed open PR only with this invocation's receipt; live smoke receipt verified.
- AC5: passed — `scripts/__tests__/sdlc-execute-supervisor.test.mjs` closes only owned panes, honors `--retain-worker`, and preserves foreign panes and a replacement lease.

## Remaining Issues

None.
