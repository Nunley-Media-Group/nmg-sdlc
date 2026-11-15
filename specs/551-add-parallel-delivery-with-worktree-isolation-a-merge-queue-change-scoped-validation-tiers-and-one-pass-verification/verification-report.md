# Verification Report: Add parallel delivery with worktree isolation, a merge queue, change-scoped validation tiers, and one-pass verification

**Date**: 2026-11-15
**Issue**: #551
**Reviewer**: Claude Code
**Scope**: Implementation verification against spec, branch `551-parallel-delivery-and-550-controller-busy-wait` merged with `main` after #550 (PR #554)

**Verification head**: 6b0a2ae223603af60a17e4d3ff15f69b0ab1661e

---

## Executive Summary

### Implementation Status: Pass

All sixteen acceptance criteria are implemented and each has a passing test. The full registered gate passed at the verification head: `repository.tests` and the live `repository.nmg-sdlc-smoke` delivery, which ran `/sdlc-execute` with this plugin build (per-issue worktree, review-first verify, merge queue) against smoke issue #311 and merged it. The implementation meets the requirements but differs from `design.md` in the places listed under Design Deviations.

## Issue Scope

- Active issue: #551
- Spec: `specs/551-add-parallel-delivery-with-worktree-isolation-a-merge-queue-change-scoped-validation-tiers-and-one-pass-verification`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12, AC13, AC14, AC15, AC16]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27]; tasks [T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020]

<!-- nmg-sdlc-issue-scope: {"issueNumber":551,"specPath":"specs/551-add-parallel-delivery-with-worktree-isolation-a-merge-queue-change-scoped-validation-tiers-and-one-pass-verification","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10","AC11","AC12","AC13","AC14","AC15","AC16"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10","FR11","FR12","FR13","FR14","FR15","FR16","FR17","FR18","FR19","FR20","FR21","FR22","FR23","FR24","FR25","FR26","FR27"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009","T010","T011","T012","T013","T014","T015","T016","T017","T018","T019","T020"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010","SCN011","SCN012","SCN013","SCN014","SCN015","SCN016"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Complete (2/2 required validations passed)
- PR evidence: Not required

## Deterministic Steering Artifact and Ceiling

- Runner: `node scripts/sdlc-verify-steering.mjs --project . --issue 551 --spec specs/551-… --base main` (standalone); exit 0, `ok: true`.
- Artifact: `.nmg-sdlc/verification/551.json`, generated 2026-11-15T01:02:34.486Z.
- Identity: head `6b0a2ae223603af60a17e4d3ff15f69b0ab1661e`, tree clean, steering `sha256:cc80105a430c7fd1d914c6e253145b44d198660fb624848c166e778d00887aba`, spec `sha256:c8e6b4a336bc3a0cccb0f655e41709ba2a9cd588f5c842a3a194d61373cd96a3`.
- Coverage: declared 2, recorded 2, complete `true`.
- Ceiling: none.

## Validation Results

| Validation | Result |
|------------|--------|
| `repository.tests` (required) | Pass: `npm test -- --runInBand` exited 0; Test Suites: 68 passed, 1 skipped; Tests: 1613 passed, 2 skipped; 770 s |
| `repository.nmg-sdlc-smoke` (required) | Pass: `nmg-sdlc-smoke delivered #311`; smoke PR https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/313 merged at `91a990a2`, #311 CLOSED |
| `node scripts/verify-plugin-surface.mjs --root . --label repository --claude-validate` | Pass |
| `node scripts/verify-current-specs.mjs` | Pass, 127 genuine issue specs |
| `node scripts/skill-inventory-audit.mjs --check` | Pass, 90 items mapped |

**Gate Summary**: 2/2 passed, 0 failed, 0 incomplete

## Fixes Applied

Earlier gate runs on this branch found these defects, fixed before the passing run:

| Severity | Location | Original Issue | Fix Applied |
|----------|----------|----------------|-------------|
| High | `scripts/sdlc-deliver.mjs` | Delivery from an issue worktree wrote the smoke delivery receipt inside that worktree, which is removed after merge, so the smoke gate failed with `missing invocation delivery proof` although smoke #308 merged | The receipt is written to the primary checkout; regression test in `sdlc-deliver.test.mjs` |
| Medium | `workflows/open-pr/WORKFLOW.md` | The deliver worker was not told to pass the controller run id, so its first delivery hit `controller_lease_held` on the worktree lease | The workflow passes `--controller-run-id R` from the worker header; command file regenerated |
| Low | `src/heavy-pool.mjs` | A slot taken on the first attempt could report `waitedMs: 1` under load | `waitedMs` is 0 unless the job slept |
| Low | `scripts/__tests__/validation-tiers.test.mjs` | The AC7 test compared lists sorted in two different orders and failed when temp names differed in case | Both sides use one order |

## Acceptance Criteria Verification

| AC | Status | Evidence |
|----|--------|----------|
| AC1: pass | Pass | `scripts/sdlc-worktree.mjs`, `scripts/start-issue.mjs`, `scripts/publish-approved-spec.mjs`; `sdlc-worktree.test.mjs`, `start-issue-controller.test.mjs`, `sdlc-execute.test.mjs` "works the issue in its own worktree and leaves a dirty primary checkout untouched (AC1)" |
| AC2: pass | Pass | `spec/{N}-{slug}` publication and `pr_scope_invalid`; `publish-approved-spec.test.mjs` (131 tests) |
| AC3: pass | Pass | `scripts/sdlc-shared-state.mjs` queue and the controller's queue-head handling; `sdlc-execute.test.mjs` "waits behind the queue head and runs no gate or version preparation until it is the head (AC3)" |
| AC4: pass | Pass | Version preparation at the queue head and fragments in `scripts/sdlc-deliver.mjs`; `sdlc-deliver.test.mjs` "changelog fragments (#551 AC4)" |
| AC5: pass | Pass | `sdlc-finalize-verification.mjs --queue-gate` and `revertPreparedVersion`; `sdlc-finalize-verification.test.mjs`, `sdlc-execute.test.mjs` "leaves the queue and gives up its version when the gate fails at the queue head (AC5, FR9)" |
| AC6: pass | Pass | `inFlightOverlaps`; `sdlc-shared-state.test.mjs`, `sdlc-execute.test.mjs` overlap test |
| AC7: pass | Pass | `src/heavy-pool.mjs`, `scripts/sdlc-heavy-pool.mjs`; `sdlc-heavy-pool.test.mjs` runs two real child processes from different project roots |
| AC8: pass | Pass | `collectParallelState` in `scripts/sdlc-status.mjs`; `sdlc-status.test.mjs` through the real CLI |
| AC9: pass | Pass | `resolveSelection` in `src/sdlc-verification-runtime.mjs`; `validation-tiers.test.mjs` |
| AC10: pass | Pass | `validation-tiers.test.mjs` fallback, stale and missing cases |
| AC11: pass | Pass | `scripts/sdlc-verify-full.mjs run`; `sdlc-verify-full.test.mjs` |
| AC12: pass | Pass | `sdlc-verify-full.mjs check` exit 0, 1 and 2 through the real CLI; `sdlc-verify-full.test.mjs` |
| AC13: pass | Pass | Untiered projects record `tier: null`, `selection: null`; `validation-tiers.test.mjs`, unchanged `sdlc-verification-runtime.test.mjs` |
| AC14: pass | Pass | `scripts/sdlc-review.mjs finalize`; `sdlc-review.test.mjs`, `sdlc-execute.test.mjs` "hands every review finding back in one handoff and runs no validation or version preparation (AC14)" |
| AC15: pass | Pass | `review_checklist_incomplete` names every unevaluated row; `sdlc-review.test.mjs` |
| AC16: pass | Pass | `scripts/sdlc-review-scope.mjs`; `sdlc-review-scope.test.mjs` |

## Design Deviations

The requirements are met; these points differ from `design.md`:

| Design | Implementation |
|--------|----------------|
| `scripts/sdlc-merge-queue.mjs` holds the queue and `processQueueHead` | The queue lives in `scripts/sdlc-shared-state.mjs`; `scripts/sdlc-merge-queue.mjs` is its command line. Queue-head processing is in the controller (`scripts/sdlc-execute.mjs`) |
| The controller runs the pre-merge gate at the queue head; verify never runs `sdlc-verify-steering.mjs` | Verify has two phases. The review phase runs no validation. At the queue head the controller dispatches the verify worker's gate phase, which runs the validations once and finalizes with `--queue-gate`. Standalone `/sdlc-verify-code` runs the review and then the gate |
| A passed review handoff has `next: "queue"`; finalization is `sdlc-finalize-verification.mjs --review` | The review is finalized by `scripts/sdlc-review.mjs finalize`, and its passed handoff has `phase: "review"`, `next: "verify"` |
| `prepare` returns a `draftDir` under `.nmg-sdlc/spec-drafts/` | `prepare` returns `specDir` inside the spec worktree; files are written there directly |
| Full runs use `<worktreeRoot>/full-<sha12>` | Full runs use a temporary detached worktree under the OS temp directory |
| An empty selection gives `effectiveStatus: 'skipped'` | It records `passed` with reason `selection_empty`; a required skipped result would cap the ceiling at Fail |
| Version-artifact conflicts include mirrors and the fragment directory | Only `VERSION` and `CHANGELOG.md` conflicts take the default branch's content; other conflicts return `queue_integration_conflict` |
| `queue_gate_failed` for every failed queue-head gate | A report that claims Pass over a failing artifact still yields `verification_recheck_invalid` |
| Heavy-pool functions `slotCount`, `acquireSlot`, `listHolders` in `scripts/sdlc-heavy-pool.mjs` | `heavyPoolSize`, `acquireHeavySlot`, `heavyPoolHolders` in `src/heavy-pool.mjs`; behavior as designed |
| Test files `sdlc-review-scope.test.mjs`, `verify-review-first-contract.test.mjs`, `sdlc-steering-runtime.test.mjs` | Tier and schema tests are in `validation-tiers.test.mjs`; review tests in `sdlc-review.test.mjs` and `sdlc-review-scope.test.mjs`; there is no `verify-review-first-contract.test.mjs` |

## Steering Alignment

The change follows `steering/manifest.json` and the registered steering snippets (`steering/snippets/project-tech.md`, `steering/snippets/project-structure.md`, both updated): deterministic logic in `scripts/` and `src/`, workflows in `workflows/{name}/WORKFLOW.md`, generated command files, version mirrors kept in sync at 4.13.0.

## Remaining Issues

- A stale primary checkout can hide a spec that is already published on the default branch, because spec status reads the local tree.
- The worktree `setup` command also runs for spec worktrees.
- The shared-state lock is broken on age (30 s) without checking its holder; current critical sections are short.
- A queue-head merge that conflicts only in `CHANGELOG.md` drops the branch's own `[Unreleased]` bullet; version preparation then writes the generated title line.

## Files Reviewed

- `.claude-plugin/plugin.json`
- `agents/architecture-reviewer.md`
- `agents/starter.md`
- `CHANGELOG.md`
- `CLAUDE.md`
- `commands/sdlc-open-pr.md`
- `commands/sdlc-verify-code.md`
- `commands/sdlc-verify-full.md`
- `package.json`
- `README.md`
- `references/steering-schema.md`
- `scripts/__tests__/execute-host.test.mjs`
- `scripts/__tests__/plugin-commands.test.mjs`
- `scripts/__tests__/publish-approved-spec.test.mjs`
- `scripts/__tests__/sdlc-deliver.test.mjs`
- `scripts/__tests__/sdlc-execute.test.mjs`
- `scripts/__tests__/sdlc-finalize-verification.test.mjs`
- `scripts/__tests__/sdlc-heavy-pool.test.mjs`
- `scripts/__tests__/sdlc-merge-queue.test.mjs`
- `scripts/__tests__/sdlc-review-scope.test.mjs`
- `scripts/__tests__/sdlc-review.test.mjs`
- `scripts/__tests__/sdlc-shared-state.test.mjs`
- `scripts/__tests__/sdlc-status.test.mjs`
- `scripts/__tests__/sdlc-verify-full.test.mjs`
- `scripts/__tests__/sdlc-worktree.test.mjs`
- `scripts/__tests__/start-issue-controller.test.mjs`
- `scripts/__tests__/validation-tiers.test.mjs`
- `scripts/publish-approved-spec.mjs`
- `scripts/sdlc-controller-lease.mjs`
- `scripts/sdlc-deliver.mjs`
- `scripts/sdlc-execute-host.mjs`
- `scripts/sdlc-execute-supervisor.mjs`
- `scripts/sdlc-execute.mjs`
- `scripts/sdlc-finalize-verification.mjs`
- `scripts/sdlc-heavy-pool.mjs`
- `scripts/sdlc-merge-queue.mjs`
- `scripts/sdlc-review-scope.mjs`
- `scripts/sdlc-review.mjs`
- `scripts/sdlc-shared-state.mjs`
- `scripts/sdlc-status.mjs`
- `scripts/sdlc-upgrade.mjs`
- `scripts/sdlc-verify-full.mjs`
- `scripts/sdlc-verify-steering.mjs`
- `scripts/sdlc-worktree.mjs`
- `scripts/skill-inventory.baseline.json`
- `scripts/start-issue.mjs`
- `scripts/verify-current-specs.mjs`
- `src/heavy-pool.mjs`
- `src/host-events.mjs`
- `src/sdlc-commands.mjs`
- `src/sdlc-prompt-snippets.mjs`
- `src/sdlc-steering-runtime.mjs`
- `src/sdlc-verification-runtime.mjs`
- `steering/snippets/project-structure.md`
- `steering/snippets/project-tech.md`
- `VERSION`
- `workflows/execute/WORKFLOW.md`
- `workflows/open-pr/WORKFLOW.md`
- `workflows/start-issue/WORKFLOW.md`
- `workflows/verify-code/WORKFLOW.md`
- `workflows/verify-full/WORKFLOW.md`
- `workflows/write-code/WORKFLOW.md`
- `workflows/write-spec/references/publish.md`
- `workflows/write-spec/WORKFLOW.md`
- `specs/551-add-parallel-delivery-with-worktree-isolation-a-merge-queue-change-scoped-validation-tiers-and-one-pass-verification/verification-report.md`
