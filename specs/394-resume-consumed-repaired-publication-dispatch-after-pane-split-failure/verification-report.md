# Verification Report: Resume consumed repaired-publication dispatch after pane split failure

**Issue**: #394
**Date**: 2026-09-17
**Status**: Passed
**Spec**: `specs/394-resume-consumed-repaired-publication-dispatch-after-pane-split-failure/`
**Branch**: `fix/394-consumed-dispatch-resumption`
**Reviewed base**: `5c416541845e6997f9a15df627d5669a35bf728a`
**Pre-report implementation head**: `d0a6ed0e124e4cc812ee190a301c1a89d8869e38`

## Acceptance Results

| Criterion | Result | Evidence |
|---|---|---|
| AC1 | Pass | Standard pane geometry is read from `HERDR_PANE_ID`; split failure leaves recovery and product evidence unchanged. A successful split immediately publishes exact pane, invocation, archive, branch, and HEAD ownership by checkpoint CAS before the second fallible proof. |
| AC2 | Pass | Archive creation and safe-recovery consumption occur only after the prepared ownership CAS and reproof. The post-consumption CAS appends one recovery tuple and marks dispatch pending; the safe-consumed/no-run-tuple gap reconciles one tuple without another consumption. |
| AC3 | Pass | Discovery returns `consumed-dispatch-available` only for the exact invocation. It accepts the complete validated legacy source tuple or the modern tuple, while partial/additional fields, drift, live ownership, missing archive identity, and unsupported dispositions remain blocked. |
| AC4 | Pass | Bare parameter-free execution resumes only `sN-implement`, restores exact archived handoff bytes where required, and never mints another allowance or duplicate recovery. Explicit issue selectors remain ineligible. |
| AC5 | Pass | Supervisor tests cover SIGKILL and SIGTERM at prepared and pending boundaries. Cleanup validates the recorded attempt, closes only its pane, preserves pre-consumption authority, and normalizes consumed losses into admissible fail-closed states. |
| AC6 | Pass | Successful implementation removes only ephemeral `consumedDispatch`; immutable safe-recovery, archive, invocation, and run-recovery evidence remain through later and terminal persistence. |
| AC7 | Pass | Focused tests, full Jest, plugin surface, current-spec validation, skill inventory, syntax checks, and exact diff whitespace checks pass on the reviewed implementation. |

## State Machine

1. `available` — exact repaired-publication proof; no consumed safe record.
2. `prepared` — exact split ownership persisted by checkpoint CAS; `recoveries[]` remains unchanged.
3. Pre-consume loss — supervisor closes only the recorded pane and preserves the original implementation failure and allowance.
4. Post-consume CAS gap — exact safe record/archive exists and run recovery is absent; the next run creates only the missing tuple.
5. `pending` / `stopped` — one exact recovery exists; loss is resumable only with absent matching worker, pane, and agent.
6. `starting` / `started` — durable ownership blocks replay while live; exact controller-loss orphaning is recoverable only after ownership and live handoff disappear.
7. Successful implement — ephemeral dispatch state is removed; durable recovery evidence remains.

## Commands and Outcomes

- `cd scripts && npm test -- sdlc-execute.test.mjs sdlc-execute-supervisor.test.mjs sdlc-safe-recoveries.test.mjs --runInBand` — 3 suites passed; 564 tests passed.
- `cd scripts && npm test -- --runInBand` — 55 suites passed, 1 suite skipped; 1,445 tests passed and 2 skipped (1,447 total).
- `node scripts/verify-plugin-surface.mjs --root . --label repository` — passed.
- `node scripts/verify-current-specs.mjs` — passed: 84 genuine issue specs, 16 required archive specs, 16 rewrite capabilities, 16 active workflow mappings, 1 deprecated stub.
- `node scripts/skill-inventory-audit.mjs --check` — passed: 43 items mapped.
- `node --check scripts/sdlc-execute.mjs` and `node --check scripts/sdlc-execute-supervisor.mjs` — passed.
- `git diff --check origin/main...HEAD` and `git diff --check` — passed.

## Review

Reviewer `ReviewIssue394` (`reviewer`, `openai-codex/gpt-5.6-sol`) reviewed the exact `origin/main` base `5c416541845e6997f9a15df627d5669a35bf728a` through pre-report head `d0a6ed0e124e4cc812ee190a301c1a89d8869e38`.

Scope: all 16 changed source, supervisor, safe-recovery, test, execute command/workflow/selection, #394 spec, and repository documentation paths. Earlier passes identified legacy tuple incompatibility, inconsistent supervisor loss normalization, and an unowned post-split/pre-reproof interval; all were corrected and reverified. Final review: no findings, overall correctness `correct`, confidence `0.98`.

Residual risk: Herdr pane ownership is bounded by the pane and agent identity Herdr exposes, and the controller lease is cooperative. External actors can race after proof; ambiguous state remains blocking rather than replaying consumption or starting a duplicate worker.

## Changed Paths

- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `README.md`
- `commands/sdlc-execute.md`
- `scripts/__tests__/sdlc-execute-supervisor.test.mjs`
- `scripts/__tests__/sdlc-execute.test.mjs`
- `scripts/sdlc-execute-supervisor.mjs`
- `scripts/sdlc-execute.mjs`
- `scripts/sdlc-safe-recoveries.mjs`
- `specs/394-resume-consumed-repaired-publication-dispatch-after-pane-split-failure/design.md`
- `specs/394-resume-consumed-repaired-publication-dispatch-after-pane-split-failure/feature.gherkin`
- `specs/394-resume-consumed-repaired-publication-dispatch-after-pane-split-failure/requirements.md`
- `specs/394-resume-consumed-repaired-publication-dispatch-after-pane-split-failure/tasks.md`
- `specs/394-resume-consumed-repaired-publication-dispatch-after-pane-split-failure/verification-report.md`
- `workflows/execute/WORKFLOW.md`
- `workflows/execute/references/selection.md`
