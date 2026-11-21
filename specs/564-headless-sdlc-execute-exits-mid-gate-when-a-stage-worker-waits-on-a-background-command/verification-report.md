# Verification Report: Headless /sdlc-execute exits mid-gate when a stage worker waits on a background command

**Date**: 2026-11-20
**Issue**: #564
**Reviewer**: Claude (nmg-sdlc verify worker, gate phase)
**Scope**: Implementation verification against spec

**Verification head**: c2fdcd9fe1277b628341660decd86f9bc0f6bf23

---

## Executive Summary

The gate ran once at the merge-queue head (`c2fdcd9`, `fix: deliver issue #564`). That head integrates the default branch and prepares the version. The review passed at `32f0767` and covers the implementation. The head commit changes only the version mirrors (`VERSION`, `package.json`, `.claude-plugin/plugin.json`) and `CHANGELOG.md`.

Both applicable pre-merge validations passed. Coverage is complete (4 declared, 4 recorded) and the steering ceiling is `null`. The change selection resolved to `all` (`fallback_path`: `hooks/register.ts`). That ran the full Jest suite and selected every smoke surface. Each interactive surface was driven live, and a headless `/sdlc-execute` delivered the provisioned smoke issue end to end. That headless run is the real path AC1 is about.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 4.3 |

### Implementation Status: Pass
**Total Issues**: 0 blocking, 0 major, 0 minor; 5 info notes carried from the review record

---

## Issue Scope

- Active issue: #564
- Spec: `specs/564-headless-sdlc-execute-exits-mid-gate-when-a-stage-worker-waits-on-a-background-command`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3]; FR [FR1-FR6]; tasks [T001-T006]; scenarios [SCN001, SCN002, SCN003]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":564,"specPath":"specs/564-headless-sdlc-execute-exits-mid-gate-when-a-stage-worker-waits-on-a-background-command","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004","T005","T006"],"scenarios":["SCN001","SCN002","SCN003"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/564.json` (tier `pre-merge`, base `main`)
- Identity: head `c2fdcd9fe1277b628341660decd86f9bc0f6bf23`, tree clean, steering `sha256:dd21875f54cdaa20fc04f9d39e709b8f8941858ee8ead4f9e9af1822c077b34b`, spec `sha256:dcfa28ca3e9d719c9b808ea228530a69261ebeaa2b33e70b82fb2ee167cafdf4`
- Ceiling: `null`
- Coverage: declared 4, recorded 4, complete `true`; no missing, duplicate or unknown results
- Selection: model `haiku`, effort `xhigh`, mode `all`, reason `fallback_path` (`hooks/register.ts`), guidance not supplied, rejection `null`. Surfaces: all 14. Required surfaces: `execute`, `plugin-host`.

---

## Acceptance Criteria Verification

These verdicts come from the passed review record `.nmg-sdlc/verification/564-review.md` (reviewed head `32f0767`, full mode). The gate run confirmed them at the queue head.

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | A headless run survives a worker waiting on a background command | Pass (tests mocked; proven live in this gate) | `hooks/register.ts` registers `classic.Stop`, which returns `{ block: headlessHold(...) }` only for a headless run with a live bridge. `src/execute-host.mjs` provides `headlessHold`/`headlessHoldNotice`. `sdlc-execute.mjs wait --hold` does not return early for a live worker. The `@SCN001` tests check the hooks wiring by source text (**mocked entry point**). This gate's smoke delivery ran `/sdlc-execute #335` headless under `claude -p` to a merged PR. |
| AC2 | A lost session does not leave an orphaned controller | Pass | `scripts/sdlc-execute-supervisor.mjs` `sessionWatchdog` arms after the first fresh heartbeat and cancels through the existing path once the heartbeat goes stale. That path releases the lease, removes the queue entry, and records `supervising_session_lost`. `@SCN002` drives the real `supervise` CLI. |
| AC3 | A gate cut off by a lost session reruns the gate | Pass | `scripts/sdlc-execute.mjs` `currentGateFailure` returns `rerunGate` when every non-passing required result is `incomplete`. In that case it records no gate failure, sets no implement routing, and does not revert the prepared version. A `failed` result still routes to implement. `@SCN003` drives `runExecute`. |

Criteria whose tests mock the path under test: **AC1**. The live headless smoke delivery in this gate covers its real path.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Keep a headless session alive while the run is unfinished | Complete | `hooks/register.ts`, `src/execute-host.mjs`, `scripts/sdlc-execute.mjs` (`wait --hold`) |
| T002 | End the supervisor and controller when the session is lost | Complete | `scripts/sdlc-execute-supervisor.mjs` |
| T003 | Rerun a gate cut off by a lost session | Complete | `scripts/sdlc-execute.mjs` |
| T004 | Document the headless hold contract | Complete | `workflows/execute/WORKFLOW.md` |
| T005 | Add behavioral regression coverage | Complete | Tests landed in `sdlc-execute-supervisor.test.mjs` and `sdlc-execute.test.mjs`, not in the execute-host/execute-goal files T005 named |
| T006 | Add the CHANGELOG entry | Complete | Rolled into the delivery commit at the queue head |

---

## Architecture Assessment

Scores come from the three review lenses (acceptance, failure-paths, test-quality).

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | The hold decision lives in the Node-free `src/execute-host.mjs`. The hooks module only wires `classic.Stop`. The watchdog is a separate supervisor function. |
| Open/Closed | 4 | `--hold` extends `wait` without changing its default behavior, so TUI callers are unchanged |
| Liskov Substitution | 5 | No contract substitutions changed |
| Interface Segregation | 4 | `headlessHold` and `sessionWatchdog` have narrow inputs |
| Dependency Inversion | 4 | The watchdog takes injected file reads and an `onLost` callback |

### Layer Separation

The hooks module imports no Node built-ins. The hold logic sits in `src/execute-host.mjs`, which both the hooks module and the Node scripts share. Cancellation reuses the existing supervisor path.

---

## Security Assessment

- [x] Input validation: `--hold` is parsed only for the `wait` subcommand
- [x] Injection prevention: no new shell interpolation
- [x] Data protection: no new data surfaces
- [x] Authentication/authorization: not applicable

## Performance Assessment

- [x] The watchdog checks every 15 s and reads only `host.json`
- [x] The hold wait is bounded by `MAX_SESSION_WAIT_MS`

## Error Handling Assessment

- [x] The `headlessHold` null branches and the `$.fs.list` catch fail open, so a stop is never blocked without a live bridge
- [x] Queue removal on session loss is best-effort inside try/catch after the lease is released
- [ ] Info F2: a single missing or unparseable `host.json` read counts as a lost session. The same exposure already exists in `fileSupervisor`.

---

## Test Coverage

### Scenario Coverage

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | `@SCN001` | `scripts/__tests__/sdlc-execute-supervisor.test.mjs` | Implemented (hooks wiring by source text; live gate evidence below) |
| AC2 | `@SCN002` | `scripts/__tests__/sdlc-execute-supervisor.test.mjs` | Implemented |
| AC3 | `@SCN003` | `scripts/__tests__/sdlc-execute.test.mjs` | Implemented |

### Test-Layer Findings

Kept test types: `bdd` (`steering/test-layers.json`).

- Duplicate: none
- Non-kept type: none. Every changed test cites its `@SCN` scenario.
- Justified: none
- Spec-text drift (info F4): the `feature.gherkin` `# File:` header names only `sdlc-execute-supervisor.test.mjs`, but `@SCN003` lives in `sdlc-execute.test.mjs`

---

## Test Results

| Validation | Tier | Selection | Status | Evidence |
|------------|------|-----------|--------|----------|
| `repository.tests` (`builtin.command`) | `change` | `{ provider: claude:haiku, reason: fallback_path, fallbackPath: hooks/register.ts, selectedCount: null }` | Passed | `npm test -- --runInBand` exited 0: 78 suites passed (1 skipped), 1928 tests passed, 2 skipped, 905 s. Log `.nmg-sdlc/verification/564/repository.tests.log` |
| `repository.nmg-sdlc-smoke` (`project.nmg-sdlc-smoke`) | `null` | `null` (provider received `mode: all`, all surfaces) | Passed | Exercised draft-issue, write-spec, onboard-project, upgrade-project, steering, run-retro and execute. Delivered smoke #335. |
| `repository.tests.full` | `full` | `null` | Skipped before merge | Runs under `/sdlc-verify-full` |
| `repository.nmg-sdlc-smoke.full` | `full` | `null` | Skipped before merge | Runs under `/sdlc-verify-full` |

Git hygiene: `git diff --check main...HEAD` exited 0.

The first gate run in this phase ended `Incomplete`. `repository.tests` could not start because this worktree had no `scripts/node_modules` (`Cannot find module .../scripts/node_modules/.bin/jest`), and smoke was deferred. That was an environment gap, not a code defect. Running `npm ci` in `scripts/` (git-ignored, no tracked change) fixed it, and the gate run recorded above is the second run at the same head.

---

## Exercise Test Results (Real Smoke Lifecycle)

`repository.nmg-sdlc-smoke` is preserved and passed with real evidence. This worker drove every selected interactive surface live. Each ran in an interactive `claude --plugin-dir <this checkout>` session inside a detached tmux session, against a fresh `--single-branch` clone of `Nunley-Media-Group/nmg-sdlc-smoke`. Each produced a head-bound record and transcript under `.nmg-sdlc/smoke/surfaces/`.

| Surface | Command | Outcome |
|---------|---------|---------|
| draft-issue | `/sdlc-draft-issue <provision.need>` | Interview (type, milestone, capability) and plan approved. Created smoke issue #335 "Add greeting_longest_word library helper". |
| write-spec | `/sdlc-write-spec #335` | Spec plan approved and published. PR #336 `docs: approve spec for #335` MERGED, and #335 carries `spec-created`. Finished at the next-spec prompt. |
| onboard-project | `/sdlc-onboard-project` | Detected an initialized project and delegated to upgrade. No files changed and the tree stayed clean. |
| upgrade-project | `/sdlc-upgrade-project` | Detected `agents-to-claude-md`, `sdlc-models`, `test-layers` and `verification-scope`, then applied all four (kept layers `bdd,unit`). The label backfill found nothing to add. |
| steering | `/sdlc-steering` | Plan to append one sentence to `project.product` approved. Applied and validated in the local clone only. |
| run-retro | `/sdlc-run-retro` | Retrospective plan approved. `steering/retrospective.md` and its state file written in the local clone only. |
| execute | Gate: headless `claude -p --session-id a77d0d96-df39-4d5b-b0b8-616921904559 --plugin-dir <checkout> --model opus "/sdlc-execute #335"` | Issue #335 CLOSED. PR #337 MERGED with `headRefOid` `c84dd42352db9f4cbe11b1709e0c30f7cffc2204`, which matches the invocation's pre-merge delivery proof and is outside the recorded baseline. |

The provisioning record is `.nmg-sdlc/smoke/provisioned.json` (`issue: 335`). Each tmux session was killed and each clone removed after it ran.

Observation (not an nmg-sdlc #564 defect): the upgrade's approved `AGENTS.md` to `CLAUDE.md` rename broke two smoke-project pytest-bdd steps that read `AGENTS.md` by path. That comes from the answer chosen during the exercise. The clone was discarded, and no smoke repository change was pushed.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests (`repository.tests`) | Pass | Full suite ran on the `fallback_path` route: 1928 passed, 2 skipped, exit 0 |
| Live smoke project (`repository.nmg-sdlc-smoke`) | Pass | 6 interactive surface records at `c2fdcd9`, plus the headless `execute` delivery of #335 (PR #337 merged at its exact head) |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |

**Gate Summary**: 3/3 gates passed, 0 failed, 0 incomplete

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | Environment | `scripts/node_modules` (git-ignored) | Worktree had no installed dev dependencies, so the first gate run could not start Jest | `npm ci` in `scripts/`; no tracked file changed | direct |

## Remaining Issues

There are no blocking, major or minor issues. The review recorded these info notes for the owner:

- F1: the AC1 tests check the hooks-module `classic.Stop` wiring by source text, and `daemonAlive` is untested. This gate's headless smoke delivery exercised the real path.
- F2: `sessionWatchdog` treats one missing or unparseable heartbeat read as a lost session, and a sleeping host can be cancelled on wake. This exposure already exists in `fileSupervisor`. Requiring two consecutive stale reads would harden it.
- F3: the hold notice relies on the workflow rule that `wait` runs in the foreground within the Bash timeout.
- F4: the `feature.gherkin` `# File:` header omits `sdlc-execute.test.mjs`, where `@SCN003` lives.
- F5: only the resume path reruns a cut-off gate. An in-run `queue_gate_failed` that is Incomplete still routes to implement, which is in scope per the spec.

---

## Positive Observations

- In this gate, the smoke delivery ran `/sdlc-execute` headless under `claude -p` with this checkout's hooks module loaded, through every stage to a merged PR and a closed issue. That is the run mode #564 fixes.
- The cut-off-gate rerun keeps the failed-check routing unchanged, so real defects still go back to implement.

---

## Recommendation

**Ready for PR**

All delivery acceptance criteria pass. Coverage of the registered pre-merge validations is complete and green at the exact queue head `c2fdcd9fe1277b628341660decd86f9bc0f6bf23`, with real smoke lifecycle evidence.
