# Verification Report: Close the gaps left open after #556

**Date**: 2026-11-16
**Issue**: #560
**Reviewer**: nmg-sdlc verify worker (gate phase)
**Scope**: Pre-merge gate against the Approved spec, queue-head branch with default branch integrated and version prepared
**Verification head**: d5e14870dddb6a9bb8974cc339b0dba291c342d8

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
**Total Issues**: 0 above info (2 carried info notes: F2, F3)

The review passed (scoped re-check at c1e440db5d1e1479132b6a030d01333e83a036a4, mode scoped, no finding above info). Since that review the branch moved only by delivery version preparation (VERSION, package.json, .claude-plugin/plugin.json, CHANGELOG.md). Both registered pre-merge validations passed at d5e14870dddb6a9bb8974cc339b0dba291c342d8 with complete coverage (declared 2, recorded 2, complete true, ceiling none).

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/560.json` (generatedAt 2026-11-16T03:40:03Z)
- Identity: headSha d5e14870dddb6a9bb8974cc339b0dba291c342d8; steeringHash sha256:cc80105a430c7fd1d914c6e253145b44d198660fb624848c166e778d00887aba; specHash sha256:26b3379254adc8b7df2aaa1399ff5ee029c1b1abafe2f3b6d7f5805ff6221306; tree clean
- Coverage: declared 2, recorded 2, complete true; missing/duplicate/unknown none
- Ceiling: none

---

## Issue Scope

- Active issue: #560
- Spec: `specs/560-close-the-gaps-left-open-after-556-lock-pid-reuse-reclaim-guard-put-back-spec-revision-publishing-and-untested-paths`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5]; FR [FR1–FR7]; tasks [T001–T007]; scenarios [SCN001–SCN005]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":560,"specPath":"specs/560-close-the-gaps-left-open-after-556-lock-pid-reuse-reclaim-guard-put-back-spec-revision-publishing-and-untested-paths","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7"],"tasks":["T001","T002","T003","T004","T005","T006","T007"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Acceptance Criteria Verification

| AC | Description | Status | Exercised | Evidence |
|----|-------------|--------|-----------|----------|
| AC1 | A lock whose holder pid was reused is broken | Pass | mocked | src/heavy-pool.mjs:65-84 processStartToken/holderAlive with fixed PS_ENV; scripts/sdlc-shared-state.mjs:59-66,:96; tests sdlc-shared-state.test.mjs:254, sdlc-heavy-pool.test.mjs:181-204,:243 (real ps across TZ/locale); cross-TZ probe. The reused-pid path is driven with an injected start token. |
| AC2 | A reclaim guard is never put back over another process's guard | Pass | real_entry_point | src/heavy-pool.mjs:119-199 (wx owner-recording guard, no-replace linkSync restore, aside sweep); tests sdlc-heavy-pool.test.mjs:207,:221,:261, sdlc-heavy-pool-guard-race.test.mjs:28 |
| AC3 | A revised spec publishes after an earlier spec PR merged | Pass | real_entry_point | scripts/publish-approved-spec.mjs:487-548; real CLI with stub gh and real git origin: publish-approved-spec.test.mjs:1058,:1070,:1088,:1107 |
| AC4 | A remote default branch with no specs directory reads as absent | Pass | real_entry_point | scripts/issue-spec-scope.mjs:151-158 specStatusOnRef; sdlc-execute.test.mjs:893 (real execute start), :905 (readable vs unreadable ref) |
| AC5 | The #556 paths have regression tests | Pass | real_entry_point | sdlc-execute.test.mjs:2278,:905,:857; sdlc-deliver.test.mjs:425,:954 |

Criteria whose tests mock the path under test: **AC1** (process start token injected for the pid-reuse case; the token reader itself is exercised against real `ps` in sdlc-heavy-pool.test.mjs:243).

## Task Completion

| Task | Description | Status |
|------|-------------|--------|
| T001 | Process start tokens for lock and slot holders | Complete |
| T002 | Owner-recording reclaim guard with no-replace restore | Complete |
| T003 | Publish a revised spec after an earlier merged spec PR | Complete |
| T004 | Absent remote specs directory reads as absent | Complete |
| T005 | Normalize bullet markers when inserting changelog entries | Complete |
| T006 | Regression tests | Complete |
| T007 | Add the CHANGELOG entry | Complete (five `### Fixed` bullets each ending `(#560).`) |

---

## Architecture Assessment

| Area | Score (1-5) | Notes (from review lenses) |
|------|-------------|-------|
| SOLID | 5 | Start-token liveness lives in src/heavy-pool.mjs and is consumed by sdlc-shared-state.mjs, sdlc-status.mjs and sdlc-heavy-pool.mjs (C1–C3) without signature breaks; withLock takes an injectable startToken. |
| Security | 5 | Argument-array spawns; fixed locale env for `ps`; no shell interpolation; guard paths resolved exactly. |
| Performance | 5 | Start tokens cached 5 s per pid with expired entries pruned (FR2), so polling waiters do not spawn per poll. |
| Testability | 4 | Real git/CLI drives AC2–AC5; AC1's reuse case relies on an injected token (inherent: pid reuse cannot be forced deterministically). |
| Error Handling | 4 | Unreadable tokens fall back to pid-only; unreadable refs keep `spec_status_unreadable`; fetch failure yields `pr_readiness_failed`. Carried info F2/F3 residue below. |
| **Average** | 4.6 | |

---

## Test Results (pre-merge validations)

| Validation | Provider | Required | Tier | Selection | Status | Evidence |
|------------|----------|----------|------|-----------|--------|----------|
| repository.tests | builtin.command | yes | null | null | Pass | `npm test -- --runInBand` in scripts/ exited 0: 69 suites passed (1 skipped), 1655 tests passed, 2 skipped, 785 s. Log `.nmg-sdlc/verification/560/repository.tests.log` |
| repository.nmg-sdlc-smoke | project.nmg-sdlc-smoke | yes | null | null | Pass | "nmg-sdlc-smoke delivered #319" (see below) |

The project declares no tiers, so every required validation ran and records `tier: null`, `selection: null`.

**Gate Summary**: 2/2 passed, 0 failed, 0 incomplete

### Real smoke lifecycle evidence

- Provisioning: reused recorded issue Nunley-Media-Group/nmg-sdlc-smoke#319 (OPEN, `spec-created`, spec PR #320 `docs: approve spec for #319` MERGED); `NMG_SDLC_SMOKE_ISSUES` unset. No new issue drafted.
- Baseline: #319 had no closing PRs before the run.
- Run: `/sdlc-execute #319` headless with this checkout's plugin (session 90cc0717-4d03-4546-b51b-13f2db607cfa).
- Proof: #319 CLOSED; closing PR #321 MERGED with headRefOid 99ceb4a80c88d30e8de952f847850bf76afa577c, outside the baseline and matching the invocation's pre-merge delivery proof.

---

## Fixes Applied

None in the gate phase (review findings were repaired by implement before the passed review).

## Remaining Issues

None above info. Carried info notes (as designed, no repair required):

- **F2** (info, src/heavy-pool.mjs): if a breaker moves a fresh guard by mistake and a third process takes the free path before the linkSync restore, two processes briefly hold the guard; guarded actions re-read and compare before removing.
- **F3** (info, src/heavy-pool.mjs): during a mixed-version upgrade a new breaker removes an older version's directory guard it cannot re-link; an older breaker's `.stale` file is swept after 10 s. Transient only.

---

## Recommendation

**Ready for PR**

Review passed with no finding above info, and both registered pre-merge validations (contract suite and live smoke delivery) passed at the exact verification head with complete coverage.
