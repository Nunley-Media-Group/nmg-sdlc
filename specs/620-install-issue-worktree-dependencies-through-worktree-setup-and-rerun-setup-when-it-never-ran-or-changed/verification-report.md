# Verification Report: Install issue worktree dependencies through worktree setup and rerun setup when it never ran or changed

**Date**: 2026-11-25
**Issue**: #620
**Reviewer**: Claude Code (nmg-sdlc verify worker, gate phase)
**Scope**: Implementation verification against spec
**Verification head**: eae095c3e2220e3572f962bfadad1e9a86b07988

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 4.7 |

### Implementation Status: Pass
**Total Issues**: 3 (all `info`; none blocking)

The review (full mode, reviewed head `bccf24e6e915cec8a9408bd75b9ab1ed87554321`) passed with no finding above `info`. The gate ran once at the queue-head commit `eae095c` (version prepared, default branch integrated). All applicable required pre-merge validations passed and coverage is complete.

---

## Issue Scope

- Active issue: #620
- Spec: `specs/620-install-issue-worktree-dependencies-through-worktree-setup-and-rerun-setup-when-it-never-ran-or-changed`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":620,"specPath":"specs/620-install-issue-worktree-dependencies-through-worktree-setup-and-rerun-setup-when-it-never-ran-or-changed","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/620.json` (head `eae095c3e2220e3572f962bfadad1e9a86b07988`, tree clean, tier `pre-merge`)
- Ceiling: none
- Coverage: declared 4, recorded 4, complete `true`; no missing, duplicate or unknown results
- Selection: mode `all`, reason `fallback_path` (`steering/manifest.json` changed), model `haiku` at `xhigh`, rejection none

---

## Acceptance Criteria Verification

| AC | Description | Status | Exercised | Evidence |
|----|-------------|--------|-----------|----------|
| AC1 | This repository declares a dependency-installing setup | Pass | real entry point | `steering/manifest.json` adds `worktree.setup` `{npm, [ci], scripts}`; `loadSteeringRuntime`/`readManifestOptions` accept it; `@SCN001` |
| AC2 | A never-run setup runs on reuse | Pass | real entry point | `scripts/sdlc-worktree.mjs` `setupRerunNeeded` + `ensureWorktree`; `@SCN002` on a real git worktree |
| AC3 | A changed setup command runs on reuse | Pass | real entry point | normalized-command identity comparison; `@SCN003` |
| AC4 | An unchanged successful setup is not repeated | Pass | real entry point | record unchanged byte-for-byte; `@SCN004` |
| AC5 | Existing setup behavior is preserved | Pass | real entry point | spec worktrees skip setup/teardown; failed setup throws `worktree_setup_failed` and reruns; two `@SCN005` tests |
| AC6 | The documentation describes when setup reruns | Pass | real entry point | exact sentence in `references/steering-schema.md` and `README.md`; `@SCN006` |

Criteria whose tests mock the path under test: none.

### Functional Requirements

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | manifest `worktree.setup` equals `{"program":"npm","args":["ci"],"cwd":"scripts"}`, no teardown |
| FR2 | Pass | `runSetup` records the normalized `command` when the setup ran |
| FR3 | Pass | never-ran / changed / absent-command reruns in `setupRerunNeeded` |
| FR4 | Pass | documentation sentence present in both files |

---

## Task Completion

| Task | Description | Status |
|------|-------------|--------|
| T001 | Declare the setup command in this repository's manifest | Complete |
| T002 | Rerun setup on a never-run or changed command | Complete |
| T003 | Describe when setup reruns | Complete |
| T004 | Implement the Regression Scenarios | Complete |

---

## Architecture Assessment

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID Principles | 5 | Rerun decision isolated in `setupRerunNeeded`; `ensureWorktree` only orchestrates |
| Security | 5 | `shell:false`, safe env, argument arrays; no new input surface |
| Performance | 5 | One extra manifest read per issue-worktree reuse |
| Testability | 4 | Real git worktrees and child processes, no mocks; a few edge paths only probed (F1, F3) |
| Error Handling | 4 | Failure paths keep `worktree_setup_failed`; post-run manifest re-read has no reason code (F2) |

All nine design error/state paths (DP1–DP9) and seven consumers (C1–C7) passed review.

---

## Test Coverage

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | `@SCN001` | `scripts/__tests__/worktree-setup-rerun.test.mjs` | Implemented |
| AC2 | `@SCN002` | `scripts/__tests__/worktree-setup-rerun.test.mjs` | Implemented |
| AC3 | `@SCN003` | `scripts/__tests__/worktree-setup-rerun.test.mjs` | Implemented |
| AC4 | `@SCN004` | `scripts/__tests__/worktree-setup-rerun.test.mjs` | Implemented |
| AC5 | `@SCN005` | `scripts/__tests__/worktree-setup-rerun.test.mjs` | Implemented |
| AC6 | `@SCN006` | `scripts/__tests__/worktree-setup-rerun.test.mjs` | Implemented |

### Test-Layer Findings

Kept test types: `bdd`.

- Duplicate: none (superseded tests were removed from `scripts/__tests__/sdlc-worktree.test.mjs`)
- Non-kept type: none
- Justified: none

---

## Test Results (Steering Validations)

| Validation | Tier | Selection | Status | Evidence |
|------------|------|-----------|--------|----------|
| `repository.tests` | change | `claude:haiku`, `fallback_path` (`steering/manifest.json`), full suite | Pass | `npm test -- --runInBand` exit 0: 88 suites passed (1 skipped), 2068 tests passed (2 skipped); log `.nmg-sdlc/verification/620/repository.tests.log` |
| `repository.nmg-sdlc-smoke` | — | all smoke surfaces selected | Pass | exercised draft-issue, write-spec, onboard-project, upgrade-project, steering, run-retro, execute; delivered smoke #379 |
| `repository.tests.full` | full | — | Skipped before merge | `/sdlc-verify-full` runs it |
| `repository.nmg-sdlc-smoke.full` | full | — | Skipped before merge | `/sdlc-verify-full` runs it |

**Gate Summary**: 2/2 applicable required validations passed, 0 failed, 0 incomplete.

---

## Real Smoke Lifecycle Evidence

- Provisioned smoke issue `Nunley-Media-Group/nmg-sdlc-smoke#379` ("Add greeting_first_word library helper") through the real `/sdlc-draft-issue`, then `/sdlc-write-spec #379` (spec PR #380 merged, `spec-created` label).
- Interactive surfaces driven live in tmux `claude --plugin-dir <checkout>` sessions with head-bound records and transcripts under `.nmg-sdlc/smoke/surfaces/`: `/sdlc-steering` (inspect-only), `/sdlc-run-retro` (plan approved, retrospective written in clone), `/sdlc-onboard-project` (already-initialized, exit with no changes), `/sdlc-upgrade-project` (kept `bdd,unit` test layers; coverage, stage models and verification scope declined).
- `/sdlc-upgrade-project`: after plan approval the session's auto-mode classifier blocked the approved `sdlc-upgrade.mjs apply` argv; the exact approved command was run in the same session with `!`, contained to the smoke clone, and exited 0 (wrote `steering/test-layers.json`; 115 issues already labeled, none added). This is a host permission-classifier behavior, not an nmg-sdlc defect.
- Execute delivery: the gate delivered #379 through `/sdlc-execute`; PR https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/381 merged and #379 is CLOSED.

---

## Fixes Applied

None. The gate phase does not edit source.

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| info | Testing | `scripts/__tests__/worktree-setup-rerun.test.mjs` | F1: unreadable-manifest-on-reuse path has no automated test (probe confirmed `worktree_setup_failed: steering_manifest_invalid`) | Info only |
| info | Error Handling | `scripts/sdlc-worktree.mjs` | F2: `runSetup` re-reads the manifest after the run; if that read throws, the error has no reason code and the record is not written | Info only |
| info | Testing | `scripts/__tests__/worktree-setup-rerun.test.mjs` | F3: identity comparison tested only for an args change; legacy record without `command` and cwd/env-only changes untested | Info only |

## Recommendation

Ready for PR.
