# Verification Report: Close the known gaps left by parallel delivery (#551) and the controller wait fix (#550)

**Date**: 2026-11-15
**Issue**: #556
**Reviewer**: nmg-sdlc verify worker (architecture-reviewer)
**Scope**: Pre-merge gate at the merge-queue head, after a passed full review
**Verification head**: 89f28930665f490ceeca691afd28149da5684a8d

---

## Executive Summary

The review of source head `8ab65afc605bdb6c86781eaaacb2e9731dd37196` passed with no finding above `info`. The only change since then is the queue-head version preparation (`VERSION`, `package.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md`; 5 insertions, 3 deletions). The pre-merge gate ran once at `89f28930665f490ceeca691afd28149da5684a8d` through the steering verification runner. Both registered required validations passed and coverage is complete.

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

**Total Issues**: 5 (all `info`; none block)

---

## Issue Scope

- Active issue: #556
- Spec: `specs/556-close-the-known-gaps-left-by-parallel-delivery-551-and-the-controller-wait-fix-550`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7]; tasks [T001, T002, T003, T004, T005, T006, T007, T008]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":556,"specPath":"specs/556-close-the-known-gaps-left-by-parallel-delivery-551-and-the-controller-wait-fix-550","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/556.json`
- Identity: head `89f28930665f490ceeca691afd28149da5684a8d`, steering `sha256:cc80105a430c7fd1d914c6e253145b44d198660fb624848c166e778d00887aba`, spec `sha256:497bd611b23eaad14b8f50b254a745dfe5cc04eaa5ca0e5befc5b4ca010a4572`, tree clean
- Ceiling: none
- Coverage: declared 2, recorded 2, complete `true`; missing, duplicate and unknown all empty

---

## Acceptance Criteria Verification

The evidence comes from the passed review record (`.nmg-sdlc/verification/556-review.json`, full mode, three lenses complete). AC5 and AC6 are tested through the simulated host and supervisor harness, which mocks the path these criteria cover (`mockedEntryPoints: ["AC5","AC6"]`). The live smoke delivery below also exercised the real controller wait path.

| AC | Description | Status | Exercised | Evidence |
|----|-------------|--------|-----------|----------|
| AC1 | A spec published on the remote default branch is found from a stale checkout | Pass | real entry point | `scripts/sdlc-execute.mjs:1092-1109` fetches the remote default branch and adopts `specStatusOnRef` (`scripts/issue-spec-scope.mjs:152-161`); five #556 execute tests |
| AC2 | Spec worktrees run no setup or teardown | Pass | real entry point | `scripts/sdlc-worktree.mjs:156`, `:179`; `sdlc-worktree.test.mjs:254-274` uses real worktrees |
| AC3 | A live lock holder's lock is never broken on age | Pass | real entry point | `scripts/sdlc-shared-state.mjs:57-95` holder record and `lockBreakable`; race test plus an 8-process stress probe with 0 violations |
| AC4 | A changelog-only queue conflict keeps the branch's own entries | Pass | real entry point | `scripts/sdlc-execute.mjs:404-416` `keepBranchChangelogEntries` with `mergeUnreleasedEntries` (`scripts/sdlc-deliver.mjs:449-469`); real git integration-conflict test |
| AC5 | A stopped worker behind its waiting marker is noticed at once | Pass | mocked | `scripts/sdlc-execute.mjs:534-539,552`; `STOPPED` at `:56`; `execute-host.test.mjs` |
| AC6 | Check-ins continue while a settled worker waits behind its marker | Pass | mocked | Regression test `sdlc-execute.test.mjs:1534-1563`: at least 3 check-in reports over 5 resume waits |
| AC7 | Only one process takes a reclaimed heavy-job slot | Pass | real entry point | `src/heavy-pool.mjs:58-131` `reclaimUnderGuard`; `sdlc-heavy-pool.test.mjs:139-170` |

Functional requirements FR1 to FR7, design paths DP1 to DP11, and consumers C1 to C11 all have `pass` verdicts in the review record.

---

## Task Completion

| Task | Description | Status |
|------|-------------|--------|
| T001 | Read an approved spec from the remote default branch | Complete |
| T002 | Skip setup and teardown for spec worktrees | Complete |
| T003 | Break a shared-state lock only when its holder is gone | Complete |
| T004 | Keep the branch's changelog entries in a version-only queue conflict | Complete |
| T005 | End the marker wait when the worker stops | Complete |
| T006 | Reclaim a dead heavy-job slot under a guard | Complete |
| T007 | Regression tests | Complete |
| T008 | Add the CHANGELOG entry | Complete |

---

## Architecture Assessment

| Area | Score | Basis (lens results) |
|------|-------|----------------------|
| SOLID | 4 | `underReclaimGuard` is shared by the heavy pool and the shared-state lock, so the two don't duplicate it. Spec-on-ref lookup lives in `issue-spec-scope.mjs`. Changelog merge reuses the delivery helper. |
| Security | 5 | Git and `gh` calls use argument arrays. Lock and guard deletion uses exact paths. No new shell interpolation. |
| Performance | 4 | Bounded polling with the existing 60 s lock deadline. One extra fetch, made only when the local spec check fails. |
| Testability | 4 | Every AC has a #556-tagged test that fails on the old behaviour. AC5 and AC6 run through a simulated harness. DP11 has no dedicated test (I3). |
| Error Handling | 4 | Fetch failure, spec ambiguity and `git show` failure follow the design table. Two edge notes remain (I1, I2). |

---

## Test Results

| Validation | Provider | Required | Tier | Selection | Status | Evidence |
|------------|----------|----------|------|-----------|--------|----------|
| `repository.tests` | `builtin.command` | yes | null | null | passed | `npm test -- --runInBand` exited 0: 68 suites passed, 1 skipped (opt-in `RUN_EXERCISE` live exercise); 1635 tests passed, 2 skipped. Log `.nmg-sdlc/verification/556/repository.tests.log` |
| `repository.nmg-sdlc-smoke` | `project.nmg-sdlc-smoke` | yes | null | null | passed | `nmg-sdlc-smoke delivered #314` (see below) |

The project declares no tiers, so every required validation ran.

### Real Smoke Lifecycle Evidence

- Provisioning: no record existed in this checkout, so a fresh issue was provisioned. A tmux-driven interactive `claude --plugin-dir <this checkout>` session in a fresh clone ran the real `/sdlc-draft-issue` and created [nmg-sdlc-smoke#314](https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/314), "Add greeting_codepoints library helper", labelled `enhancement`, milestone v3. The same session then ran `/sdlc-write-spec #314`: spec PR [#315](https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/315) merged and the issue got `spec-created`. The record `.nmg-sdlc/smoke/provisioned.json` names #314. The tmux session and clone were removed afterwards.
- Delivery: the provider cloned the smoke repository, recorded the closing-PR baseline for #314, and ran `/sdlc-execute #314` headlessly (session `72561a38-35f4-44fd-a3a1-8d0ca134313f`).
- Proof: PR [#316](https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/316) is `MERGED` at `4865f629e6a098c9f3c3dece206a23ec42bb4d51`, matching the invocation's pre-merge delivery proof, and issue #314 is `CLOSED`.

---

## Fixes Applied

None. The gate phase makes no source edits.

## Remaining Issues

All remaining items are `info` notes from the review. None blocks the merge.

| ID | Severity | Location | Note |
|----|----------|----------|------|
| I1 | info | `scripts/sdlc-shared-state.mjs` | Suppose a same-host holder crashes and its pid is later reused by a live process. That lock is never broken, because the `at` time is not consulted, so merge-queue enter and leave fail `shared_state_locked` until someone removes the lock by hand. This matches AC3 as written. |
| I2 | info | `src/heavy-pool.mjs` | On POSIX, the rename-back in `breakStaleGuard` (`:82`) can replace a third process's fresh empty guard directory. That needs a crashed guard plus three concurrent reclaimers inside a narrow window, and the holder re-read under the guard still prevents a double take. |
| I3 | info | `scripts/__tests__/sdlc-execute.test.mjs` | No test covers a failed `git show :2:/:3:` during a CHANGELOG-only conflict. The abort-to-conflict path was checked by reading the code. |
| I4 | info | `scripts/issue-spec-scope.mjs` | If the remote default branch has no `specs/` directory at all, the start error reads `spec_status_unreadable` rather than naming an absent spec. It still fails `approved_spec_missing`. |
| I5 | info | `workflows/execute/WORKFLOW.md`, `references/steering-schema.md` | The documentation edits are one line each. The live execute evidence is the smoke delivery above. |

---

## Overall Status

**Pass**. Both registered validations pass, coverage is complete, there is no ceiling, and every acceptance criterion passed review at a source head whose only later change is the version preparation.

## Recommendation

**Ready to merge**
