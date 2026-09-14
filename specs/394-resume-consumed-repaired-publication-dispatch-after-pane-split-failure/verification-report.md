# Verification Report: Resume consumed repaired-publication dispatch after pane split failure

**Issue**: #394
**Date**: 2026-09-14
**Status**: Passed
**Spec**: `specs/394-resume-consumed-repaired-publication-dispatch-after-pane-split-failure/`
**Branch**: `fix/394-consumed-dispatch-resumption`
**Base**: `38ba70d4d07ac52112b28198e7684c282dc3ecbd`
**Verified implementation head**: `43efcc809c7fedbad9114dd4f66b3bec9245cabf`

## Acceptance Results

| Criterion | Result | Evidence |
|---|---|---|
| AC1 | Pass | Standard pane geometry is read from `HERDR_PANE_ID`; split occurs before archive, safe consumption, pending state, or recovery tuple. The controlled split-failure fixture leaves run, safe recovery, handoff, task, product, and workflow evidence unchanged. |
| AC2 | Pass | After successful split and revalidation, checkpoint CAS persists only the exact `prepared` dispatch. Archive creation and `consumeSafeRecovery()` follow. The post-consumption CAS appends one consumed run recovery and marks dispatch `pending`; the exact no-run-tuple crash gap reconciles one tuple without another safe consumption or duplicate. |
| AC3 | Pass | Revision-14 issue-108 fixture returns `consumed-dispatch-available` only for the exact consumed invocation/archive/run/head/branch/owner/handoff/task state. Recorded or identity-matching `s108-implement`/`r108-implement` panes and agents block; unrelated sibling/user panes remain admissible. |
| AC4 | Pass | Bare parameter-free execution resumes the same invocation, starts only `s108-implement`, does not call safe consumption again, and does not append a duplicate run recovery. Explicit selectors return `consumed_dispatch_requires_parameter_free` before lease, dependency, pane, or state mutation. Durable start makes repeat discovery unavailable. |
| AC5 | Pass | Tests cover split failure, split-success/pre-consume process loss with exact prepared pane/invocation reuse, safe-consumed/no-run-tuple loss, pending resumption, agent-start failure, successful start, validated implement success, next-step persistence, and terminal schema persistence. Only attempt-owned or exact prepared unused panes are closed/reused. |
| AC6 | Pass | Adversarial coverage blocks non-pane stops, missing/mutated consumed archives, noncanonical prepared archive paths even when absent, run/HEAD/actual or dispatch branch drift, mismatched safe-record evidence, wrong/complete owner, changed handoff/task/product/worktree, existing worker/recorded pane/matching agent, wrong invocation, missing or duplicate incompatible recovery, a `passed` recovery paired with pending dispatch, ambiguous `starting`, controller lock, and explicit selector without mutation. |
| AC7 | Pass | Focused execute/safe-recovery and full Jest suites pass, including every existing #392 fixture and recovery class. Command, plugin, current-spec, inventory, contribution, version, and diff checks pass. |

## State Machine

1. `available` — exact #392 repaired-publication proof; no consumed safe record.
2. `prepared` — standard pane allocated/revalidated and exact invocation/pane/archive identity persisted; `recoveries[]` unchanged.
3. Pre-consume crash — no safe record and no run recovery: ordinary repaired-publication recovery reuses the exact prepared pane/invocation once.
4. Post-consume CAS gap — exact safe record/archive exists and run recovery is absent: discovery returns `consumed-dispatch-available`; the next CAS creates exactly one matching run recovery and marks `pending`.
5. `pending` — exact safe record and one run recovery exist; no worker/agent or recorded dispatch pane is live.
6. `starting` — worker ownership and non-offerable start disposition persisted before `agentStart`.
7. `stopped` — `agent_start_failed`, `process_lost`, or compatible `pane_split_failed` remains resumable only when every exact proof still holds and matching ownership is absent.
8. `started` — immediately non-offerable; repeat discovery cannot duplicate dispatch.
9. Successful implement handoff — ephemeral `consumedDispatch` is removed before next-step/terminal persistence; immutable safe-recovery record, run recovery, archive, and invocation remain.

## Commands and Outcomes

- Focused execute and safe recovery: 2 suites passed; 497 tests passed.
- Full Jest: 55 suites passed, 1 suite skipped; 1,397 tests passed and 2 skipped (1,399 total).
- Focused archive crash states: pre-consume prepared recovery, post-consume missing archive, and canonical first consumption — 3 tests passed.
- Command synchronization: `scripts/__tests__/extension-commands.test.mjs` — 6 tests passed.
- Contribution contracts: `scripts/__tests__/contribution-gate-contract.test.mjs` and `scripts/__tests__/exercise-contribution-gate.test.mjs` — 35 tests passed.
- `node scripts/verify-plugin-surface.mjs --root . --label repository` — passed.
- `node scripts/verify-current-specs.mjs` — passed: 81 genuine issue specs, 16 required archive specs, 16 rewrite capabilities, 16 active workflow mappings, 1 deprecated stub.
- `node scripts/skill-inventory-audit.mjs --check` — passed: 43 items mapped.
- `VERSION` and `package.json` — synchronized at `3.21.3`; no version bump.
- `node --check scripts/sdlc-execute.mjs` and `node --check scripts/__tests__/sdlc-execute.test.mjs` — passed.
- `git diff --check 38ba70d4d07ac52112b28198e7684c282dc3ecbd` and `git diff --check` — passed.
- Task declaration comparison — every changed implementation, test, documentation, workflow, command, and verification-report path is declared; no undeclared path.

The repository had no local `scripts/node_modules`; verification used the already-installed Jest 29 dependency tree from the adjacent read-only nmg-sdlc checkout with the candidate repository supplied as Jest `rootDir`. No install or other-checkout mutation occurred.

## Changed Paths

- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `README.md`
- `commands/sdlc-execute.md`
- `scripts/__tests__/sdlc-execute.test.mjs`
- `scripts/sdlc-execute.mjs`
- `scripts/sdlc-safe-recoveries.mjs`
- `specs/394-resume-consumed-repaired-publication-dispatch-after-pane-split-failure/design.md`
- `specs/394-resume-consumed-repaired-publication-dispatch-after-pane-split-failure/feature.gherkin`
- `specs/394-resume-consumed-repaired-publication-dispatch-after-pane-split-failure/requirements.md`
- `specs/394-resume-consumed-repaired-publication-dispatch-after-pane-split-failure/tasks.md`
- `specs/394-resume-consumed-repaired-publication-dispatch-after-pane-split-failure/verification-report.md`
- `workflows/execute/WORKFLOW.md`
- `workflows/execute/references/selection.md`

## Commits

- `454bb4cb99bcb1ca9734b71aa181578bc827d1dd` — `docs: approve spec for #394`
- `86a6fbd556cf0466fd9ae2814b5438ca128e7a24` — `fix: resume consumed dispatch for #394`
- `fba4f238a68212a69e05b5e2ecec0e94a0863676` — `docs: record verification for #394`
- `5aaea63285e6359febafbf8cc65fdb099e7e6f50` — `fix: harden consumed dispatch admission for #394`

- `43efcc809c7fedbad9114dd4f66b3bec9245cabf` — `refactor: simplify consumed dispatch validation`

## Residual Risk

Herdr pane association is limited to the exact persisted pane id and standard/remediation agent identity exposed by Herdr. Unrelated sibling/user panes are intentionally tolerated and never treated as dispatch ownership. The controller lease remains cooperative: an external process that ignores it can race repository or Herdr state after validation. Every persisted transition uses checkpoint CAS, and ambiguity remains blocking rather than replaying consumption or starting a duplicate worker.
