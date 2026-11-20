# Verification Report: Scope the pre-merge gate's tests and smoke to the change with a Claude selection checked by coverage and a surface map

**Date**: 2026-11-20
**Issue**: #584
**Reviewer**: Claude (nmg-sdlc verify worker, gate phase)
**Scope**: Implementation verification against spec

**Verification head**: 06cfb180adc5528a3b242132638d6deec12d6f73

---

## Executive Summary

The gate ran once at the merge-queue head (`06cfb18`, `feat: deliver issue #584`, which integrates the default branch and prepares the version). The review that passed at `2b4a88f` covers the implementation. Since then, the head commit changes only the version mirrors (`VERSION`, `package.json`, `.claude-plugin/plugin.json`) and `CHANGELOG.md`.

Both applicable pre-merge validations passed. Coverage is complete (4 declared, 4 recorded) and the steering ceiling is `null`. The change selection resolved to `all` (`fallback_path`: `src/stage-models.d.mts`). That ran the full Jest suite and selected every smoke surface, so each interactive surface was driven live and `/sdlc-execute` delivered the provisioned smoke issue end to end.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 4 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 4.2 |

### Implementation Status: Pass
**Total Issues**: 0 blocking, 0 major, 0 minor; 15 info notes carried from the review record

---

## Issue Scope

- Active issue: #584
- Spec: `specs/584-scope-the-pre-merge-gate-s-tests-and-smoke-to-the-change-with-a-claude-selection-checked-by-coverage-and-a-surface-map`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1-AC12]; FR [FR1-FR14]; tasks [T001-T020]; scenarios [SCN001-SCN013]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":584,"specPath":"specs/584-scope-the-pre-merge-gate-s-tests-and-smoke-to-the-change-with-a-claude-selection-checked-by-coverage-and-a-surface-map","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10","AC11","AC12"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10","FR11","FR12","FR13","FR14"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009","T010","T011","T012","T013","T014","T015","T016","T017","T018","T019","T020"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010","SCN011","SCN012","SCN013"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/584.json` (tier `pre-merge`, base `main`)
- Identity: head `06cfb180adc5528a3b242132638d6deec12d6f73`, tree clean, steering `sha256:dd21875f54cdaa20fc04f9d39e709b8f8941858ee8ead4f9e9af1822c077b34b`, spec `sha256:c7da323747b06043e66f006e353c10a4f6a632221384dcc25e5d85160b69732a`
- Ceiling: `null`
- Coverage: declared 4, recorded 4, complete `true`; no missing, duplicate or unknown results
- Selection: model `haiku`, effort `xhigh`, mode `all`, reason `fallback_path` (`src/stage-models.d.mts`), guidance not supplied, rejection `null`. Surfaces: all 14. Required surfaces: `onboard-project`, `upgrade-project`, `execute`, `shared-references`, `project-steering`.

---

## Acceptance Criteria Verification

These verdicts come from the passed review record `.nmg-sdlc/verification/584-review.md` (reviewed head `2b4a88f`, full mode), confirmed at the queue head by the gate run.

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Claude selects tests and surfaces for a change | Pass | `src/sdlc-verification-runtime.mjs` resolves the selection once and appends the selected tests. Providers receive `changedPaths` and `selection`. `--mode select` CLI run in this gate printed `{ ok: true, selection }`, and the gate reused it. |
| AC2 | Selection model and effort are configurable | Pass | `src/stage-models.mjs` sets the `selection` default `haiku`/`xhigh`. The artifact records `model: haiku`, `effort: xhigh`. |
| AC3 | The command form of `selection` is rejected | Pass | `src/sdlc-steering-runtime.mjs` returns `steering_validation_invalid`, covered by `validation-tiers.test.mjs`. |
| AC4 | Changed code lines must be covered by the selected tests | Pass | Runtime coverage check (`selection_uncovered`, `coverage` record). Readiness and the controller share `SELECTION_CHECKED_REASONS`. |
| AC5 | Changed surfaces must be selected; AC5a surface-bound validations run only when selected | Pass | `selection_surface_missing` fires before any run, and `surface_not_selected` handles unselected surfaces. The opt-in/surface overlap is rejected at load: a deviation recorded in `steering/snippets/project-tech.md` pending owner confirmation (info A12). |
| AC6 | Every changed path must be accounted for | Pass | `unaccountedPaths` in `src/sdlc-test-selection.mjs`, runtime accounting |
| AC7 | A rejected selection escalates to the orchestrator | Pass | `scripts/sdlc-finalize-verification.mjs` escalation (lists capped at 200, plus `truncated`). The controller redispatches with guidance, and `clearGuidance` runs at implement. |
| AC8 | Only a docs-only change may select nothing | Pass | Runtime `selection_empty` / `selection_empty_code_change` |
| AC9 | Full-run fallbacks are kept | Pass | Fallback before any call, and `selection_failed` / `selection_all`. This gate exercised the `fallback_path` route live. |
| AC10 | This repository's smoke runs only the selected surfaces | Pass (tests mocked; proven live in this gate) | `steering/extensions/nmg-sdlc-smoke.mjs` checks head-bound surface records. Its Jest tests inject the gh/git/claude runners (**mocked entry point**). This gate's live smoke checked all six interactive surface records at `06cfb18` and delivered `execute` for real (see Exercise Test Results). |
| AC11 | Onboard and upgrade enforce the configuration | Pass | The `scripts/verification-scope.mjs` item was detected and applied. The live `/sdlc-upgrade-project` exercise in this gate detected `verification-scope` on the smoke clone, proposed `selection` and `surfaces`, applied them, and the detector then reported nothing left to configure. |
| AC12 | This repository adopts scoped verification | Pass | `steering/manifest.json` `selection`/`surfaces`, `steering/test-coverage.json`, `repository-surfaces.test.mjs` |

Criteria whose tests mock the path under test: **AC10**. The live smoke run in this gate covers its real path.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add the selection model entry | Complete | |
| T002 | Replace the command-form selection in the steering schema | Complete | |
| T003 | Bundle the selection prompt | Complete | `workflows/verify-code/references/selection-prompt.md` |
| T004 | Accept executableLines in the coverage report | Complete | |
| T005 | Implement the selection resolver | Complete | |
| T006 | Apply the selection and its checks in the gate | Complete | |
| T007 | Add the select mode to the verify CLI | Complete | Used live in this gate |
| T008 | Report selection escalations from the finalizer | Complete | |
| T009 | Present selection escalations and carry redispatch guidance | Complete | |
| T010 | Scope this repository's smoke to the selected surfaces | Complete | Used live in this gate |
| T011 | Detect and apply verification-scope configuration | Complete | Exercised live through `/sdlc-upgrade-project` |
| T012 | Update the workflows | Complete | |
| T013 | Add the Jest per-test coverage command | Complete | |
| T014 | Adopt scoped verification in this repository's manifest | Complete | |
| T015 | Document the behavior | Complete | |
| T016-T020 | Tests for schema/model/resolver, gate checks, escalation, smoke, onboard/upgrade | Complete | |

---

## Architecture Assessment

Scores come from the three review lenses (acceptance, failure-paths, test-quality).

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | `runSteeringValidations` is about 223 lines. Extracting a `checkSelection` step would help (I9). |
| Open/Closed | 4 | Validations opt in through manifest data (`selection: true`, surfaces). The runtime needs no changes for this. |
| Liskov Substitution | 5 | Provider contract unchanged; providers receive the added `changedPaths`/`selection` fields |
| Interface Segregation | 4 | Selection, coverage and accounting are separate modules (`src/sdlc-test-selection.mjs`, `src/sdlc-glob.mjs`, `src/stage-models.mjs`) |
| Dependency Inversion | 4 | Smoke provider and selection call take injected runners |

### Layer Separation

The runtime libraries (`src/`) own selection and checks. The workflows only invoke the runner, and the scripts (`sdlc-finalize-verification.mjs`, `sdlc-execute.mjs`) consume the artifact. The hooks module is untouched apart from surface mapping.

### Dependency Flow

Readiness and the controller share `SELECTION_CHECKED_REASONS` from `scripts/verification-readiness.mjs`, so neither keeps a duplicate list.

---

## Security Assessment

- [x] Input validation: `--base` leading-dash guard, test ids normalised before they are appended, an 8 MiB cap on untracked files, symlink and hard-link refusal for smoke transcripts
- [x] Injection prevention: argument arrays throughout (`jestArguments`, `gh`/`git`/`claude` invocations)
- [x] Data protection: smoke mutations stay inside `Nunley-Media-Group/nmg-sdlc-smoke` under `NMG_SDLC_SMOKE_OWNED=1`
- [x] Authentication/authorization: not applicable beyond the authenticated `gh` user check in the smoke provider

## Performance Assessment

- [x] Bounded selection: one headless Claude call per gate run, reused while the head, change, steering and prompt are unchanged (confirmed: the gate reused the `--mode select` result)
- [x] Scoped runs: change-tier tests run only the selected ids, and the full tier moves to `/sdlc-verify-full`
- [x] Resource management: heavy validations go through the host pool, and the escalation lists are capped at 200

---

## Test Coverage

### Scenario Coverage

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | `@SCN001` | `scripts/__tests__/test-selection.test.mjs`, `test-selection-gate.test.mjs` | Implemented |
| AC2 | `@SCN002` | `scripts/__tests__/sdlc-models.test.mjs`, `test-selection-gate.test.mjs` | Implemented |
| AC3 | `@SCN003` | `scripts/__tests__/validation-tiers.test.mjs` | Implemented |
| AC4 | `@SCN004` | `scripts/__tests__/test-selection-gate.test.mjs` | Implemented |
| AC5 | `@SCN005` | `scripts/__tests__/test-selection-gate.test.mjs` | Implemented |
| AC5a | `@SCN006` | `scripts/__tests__/test-selection-gate.test.mjs` | Implemented |
| AC6 | `@SCN007` | `scripts/__tests__/test-selection-gate.test.mjs` | Implemented |
| AC7 | `@SCN008` | `scripts/__tests__/sdlc-execute.test.mjs`, `sdlc-finalize-verification.test.mjs` | Implemented |
| AC8 | `@SCN009` | `scripts/__tests__/test-selection-gate.test.mjs` | Implemented |
| AC9 | `@SCN010` | `scripts/__tests__/test-selection.test.mjs`, `test-selection-gate.test.mjs` | Implemented |
| AC10 | `@SCN011` | `scripts/__tests__/nmg-sdlc-smoke.test.mjs` | Implemented (mocked runners; live gate evidence below) |
| AC11 | `@SCN012` | `scripts/__tests__/verification-scope.test.mjs` | Implemented |
| AC12 | `@SCN013` | `scripts/__tests__/repository-surfaces.test.mjs` | Implemented |

### Test-Layer Findings

Kept test types: `bdd` (`steering/test-layers.json`).

- Duplicate: none
- Non-kept type: none. Every changed test file cites its `@SCN` scenario.
- Justified: none

---

## Test Results

| Validation | Tier | Selection | Status | Evidence |
|------------|------|-----------|--------|----------|
| `repository.tests` (`builtin.command`) | `change` | `{ provider: claude:haiku, reason: fallback_path, fallbackPath: src/stage-models.d.mts, selectedCount: null }` | Passed | `npm test -- --runInBand` exited 0: 77 suites passed (1 skipped), 1905 tests passed, 2 skipped, 840 s. Log `.nmg-sdlc/verification/584/repository.tests.log` |
| `repository.nmg-sdlc-smoke` (`project.nmg-sdlc-smoke`) | `null` | `null` (provider received `mode: all`, all surfaces) | Passed | Exercised draft-issue, write-spec, onboard-project, upgrade-project, steering, run-retro and execute. Delivered smoke #332. |
| `repository.tests.full` | `full` | `null` | Skipped before merge | Runs under `/sdlc-verify-full` |
| `repository.nmg-sdlc-smoke.full` | `full` | `null` | Skipped before merge | Runs under `/sdlc-verify-full` |

Git hygiene: `git diff --check main...HEAD` exited 0.

---

## Exercise Test Results (Real Smoke Lifecycle)

`repository.nmg-sdlc-smoke` is preserved and passed with real evidence. Every selected interactive surface was driven live by this worker in an interactive `claude --plugin-dir <this checkout>` session inside a detached tmux session against a fresh `--single-branch` clone of `Nunley-Media-Group/nmg-sdlc-smoke`. Each produced a head-bound record and transcript under `.nmg-sdlc/smoke/surfaces/`.

| Surface | Command | Outcome |
|---------|---------|---------|
| draft-issue | `/sdlc-draft-issue <provision.need>` | Interview (capability, type, milestone) and plan approved. Created smoke issue #332 "Add greeting_word_lengths library helper". |
| write-spec | `/sdlc-write-spec #332` | Spec plan approved and published. PR #333 `docs: approve spec for #332` MERGED, and #332 carries `spec-created`. Finished at the next-spec prompt. |
| onboard-project | `/sdlc-onboard-project` | Detected an initialized project and delegated to upgrade. No files changed and the tree stayed clean. |
| upgrade-project | `/sdlc-upgrade-project` | Detected `agents-to-claude-md`, `sdlc-models`, `test-layers` and `verification-scope`, then applied all four. The first apply attempt stopped cleanly on a transient GitHub read (`dependency_unreadable` on #215); the retry succeeded. The verification-scope detector then reported nothing to configure. |
| steering | `/sdlc-steering` | Plan registering pytest, pytest-bdd and ruff validations approved, applied and validated (local clone only). |
| run-retro | `/sdlc-run-retro` | Retrospective plan approved, and `steering/retrospective.md` and its state file written (local clone only). |
| execute | Gate: headless `claude -p --session-id 8739ecde-... --plugin-dir <checkout> --model opus "/sdlc-execute #332"` | Issue #332 CLOSED. PR #334 MERGED with `headRefOid` `d0ff5438b24094ca009840ebdedc685477e5f4a1`, matching the invocation's pre-merge delivery proof and outside the recorded baseline. |

The provisioning record is `.nmg-sdlc/smoke/provisioned.json` (`issue: 332`). Each tmux session was killed and each clone removed after it ran.

Observation (not an nmg-sdlc #584 defect): the upgrade's approved `AGENTS.md` to `CLAUDE.md` rename broke two smoke-project pytest-bdd steps that read `AGENTS.md` by path. That is a smoke-fixture consequence of the answer chosen during the exercise. The clone was discarded, and no smoke repository change was pushed.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests (`repository.tests`) | Pass | Full suite ran on the `fallback_path` route: 1905 passed, 2 skipped, exit 0 |
| Live smoke project (`repository.nmg-sdlc-smoke`) | Pass | 6 interactive surface records at `06cfb18`, plus the `execute` delivery of #332 (PR #334 merged at its exact head) |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |

**Gate Summary**: 3/3 gates passed, 0 failed, 0 incomplete

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None in the gate phase | — | — |

## Remaining Issues

No blocking, major or minor issues. The review recorded these info notes for the owner:

- A12: the AC5a narrowing (a `selection: true` validation may not be surface-bound) is recorded in `steering/snippets/project-tech.md` as a deviation pending owner confirmation.
- A13: this repository keeps `scripts/jest-per-test-coverage.mjs` under `coveragePaths`, not under `fallbackPaths` as `references/verification-scope.md` suggests.
- T32: the `::`, `.` and directory id forms of the coverage wrapper are defensive and unexercised.
- Persisting info notes F28, F32, I1, I2, I3, I4, I8, T23, I9, I10, I11 and X1 are listed in `.nmg-sdlc/verification/584-review.md`.

---

## Positive Observations

- The gate exercised its own fallback route live (`src/stage-models.d.mts`) and recorded the selection's provenance in full.
- Head-bound surface records stopped stale or forged smoke evidence. Each record was checked against `06cfb18` before delivery ran.
- The live upgrade run showed the new `verification-scope` item proposing, applying and then clearing on a real consumer project.

---

## Recommendation

**Ready for PR**

All delivery acceptance criteria pass. Coverage of the registered pre-merge validations is complete and green at the exact queue head `06cfb180adc5528a3b242132638d6deec12d6f73`, with real smoke lifecycle evidence.
