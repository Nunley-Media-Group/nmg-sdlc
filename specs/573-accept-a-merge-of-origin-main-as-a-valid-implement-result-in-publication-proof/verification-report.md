# Verification Report: Accept a merge of origin/main as a valid implement result in publication proof

**Date**: 2026-11-22
**Issue**: #573
**Reviewer**: Claude Code (nmg-sdlc verify worker, gate phase)
**Scope**: Implementation verification against spec
**Verification head**: ab13faf03007bc2b802d198953b211ea8a62005e

---

## Executive Summary

The change teaches `scripts/sdlc-safe-recoveries.mjs` to recognize a merge of the fetched default branch as a valid implement result: `reconcile --step implement` walks only first-parent ahead commits and needs no stage subject on an integration merge, and `bind`/`reconcile` check only the integration change set (paths that differ between the merged-in default-branch commit and the branch tip or working tree) against the publication scope, while deny rules still refuse real out-of-scope paths. `workflows/write-code/WORKFLOW.md` reads the implement subject from the latest first-parent non-merge commit.

The review passed at source head `947df3db26b58140e3da78545d18c692a459f834` with no finding above `info` (full mode, all three lenses complete). The gate ran once at the queue head `ab13faf03007bc2b802d198953b211ea8a62005e` (default branch integrated, version prepared): every pre-merge validation passed, coverage is complete, and the ceiling is clear.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 5 |
| Testability | 4 |
| Error Handling | 5 |
| **Overall** | 4.7 |

### Implementation Status: Pass
**Total Issues**: 4 (all `info`; none blocking, major or minor)

---

## Issue Scope

- Active issue: #573
- Spec: `specs/573-accept-a-merge-of-origin-main-as-a-valid-implement-result-in-publication-proof`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3]; FR [FR1, FR2, FR3, FR4, FR5]; tasks [T001, T002, T003, T004, T005, T006]; scenarios [SCN001, SCN002, SCN003]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":573,"specPath":"specs/573-accept-a-merge-of-origin-main-as-a-valid-implement-result-in-publication-proof","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5"],"tasks":["T001","T002","T003","T004","T005","T006"],"scenarios":["SCN001","SCN002","SCN003"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/573.json` (generated 2026-11-23T02:49:06Z), tier `pre-merge`
- Identity: head `ab13faf03007bc2b802d198953b211ea8a62005e`, tree clean
- Coverage: declared 4, recorded 4, complete `true`; no missing, duplicate or unknown results
- Ceiling: none (`ok: true`)
- Selection: provider `claude:haiku` (effort `xhigh`), prompt `gate:selection` (`plugin.gate.selection` + `project.selection`), mode `all`, reason `selection_all`, no rejection, no guidance supplied. Selected surfaces: every surface (`draft-issue`, `write-spec`, `onboard-project`, `upgrade-project`, `steering`, `run-retro`, `execute`, `status`, `verify-full`, `plugin-host`, `shared-references`, `project-steering`, `script-assets`, `ci`); required surface `execute`.

---

## Acceptance Criteria Verification

Evidence is from the review record `.nmg-sdlc/verification/573-review.json` (review head `947df3d`). Every acceptance criterion is exercised through the real entry point (the `sdlc-safe-recoveries.mjs` bind/reconcile CLI against real Git repositories with a bare origin); no criterion's tests mock the path under test (`mockedEntryPoints: []`).

| AC | Description | Status | Exercised | Evidence |
|----|-------------|--------|-----------|----------|
| AC1 | A merge-of-main tip passes the subject proof | Pass | real entry point | `scripts/sdlc-safe-recoveries.mjs` `reconcileStagePublication` walks `rev-list --first-parent @{u}..HEAD`, treats an integration merge as needing no stage subject, and with no stage commit requires the newest first-parent non-merge commit since the merge base to carry the expected subject; `@SCN001` passes |
| AC2 | Files from the default branch are outside the scope check | Pass | real entry point | `observeDirtyPublicationPaths` (in-progress merge with `MERGE_HEAD`) and `observeCommittedPublicationPaths` (committed merge) use `integrationChangeSet(base, ...)`; `@SCN002` passes for both committed and in-progress merges |
| AC3 | Real out-of-scope changes are still refused | Pass | real entry point | `publicationPathDenied` runs on the integration change set in bind, the clean reconcile path and inside `reconcileStagePublication`; `@SCN003` refuses another issue's spec and this issue's Approved spec input |

### Functional Requirements

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | `integrationParent` (exactly two parents, parent 2 is an ancestor of `refs/remotes/<remote>/<default>`, parent 1 is not); `inProgressIntegration` (single SHA-shaped `MERGE_HEAD` that is an ancestor of the base) |
| FR2 | Pass | `integrationChangeSet`: `git diff --name-only --no-renames -z <base> HEAD` committed; diff against base plus untracked files in progress; runtime paths dropped; unmerged entries refused |
| FR3 | Pass | First-parent walk; left count must be 0; integration merges skip the subject; any other merge fails "Publication merge is not an integration" |
| FR4 | Pass | `workflows/write-code/WORKFLOW.md` step 4 reads `git log -1 --first-parent --no-merges --format=%s HEAD`; `queue_integration_conflict` repair binds during the in-progress merge |
| FR5 | Pass | No-merge branches take the unchanged code path; pre-existing tests and the new no-merge test pass |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Recognize integration merges and their change set | Complete | `integrationBaseRef`, `integrationParent`, `mergeInProgress`, `inProgressIntegration`, `integrationChangeSet` |
| T002 | Use the integration change set in bind and the clean reconcile path | Complete | `observeDirtyPublicationPaths`, `observeCommittedPublicationPaths` |
| T003 | Walk first-parent ahead commits in reconcile | Complete | `reconcileStagePublication` |
| T004 | Take the implement subject from the latest non-merge commit | Complete | `workflows/write-code/WORKFLOW.md` lines 88 and 108 |
| T005 | Add behavioral regression coverage | Complete | `scripts/__tests__/sdlc-safe-recoveries.test.mjs` (+162 lines) |
| T006 | Add the CHANGELOG entry | Complete | `[Unreleased]` bullet ending `(#573)` |

---

## Architecture Assessment

Scores come from the three review lenses (acceptance, failure-paths, test-quality).

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID | 4 | Integration detection, change-set derivation and subject proof are separate helpers in the one module that owns publication proof; seven helpers are exported but used only inside the module (F3) |
| Security | 5 | Remote and branch names validated (regex plus `git check-ref-format --branch`); Git invoked with argument arrays; deny rules apply to the integration change set |
| Performance | 5 | Bounded first-parent walks and single diffs; one fetch of the default ref |
| Testability | 4 | Real-Git CLI scenarios that fail if scope or deny checks regress; refusal side of the merge-tip subject proof has no test (F1); three untagged tests (F2) |
| Error Handling | 5 | Every design error path (DP1-DP8) fails closed with `publication_scope_unproven` or a failed reconcile; crash/retry between bind, commit, push and reconcile converges |
| **Average** | 4.6 | |

Consumers (C1-C7): the implement bind/reconcile CLI, `scripts/sdlc-finalize-verification.mjs` (verify step) and `scripts/sdlc-deliver.mjs` (deliver step) consumers keep their outcomes; `workflows/write-code/WORKFLOW.md` is updated consistently; the controller's `queue_integration_conflict` producer is unchanged and its repair guidance matches; the CHANGELOG bullet cites `(#573)`.

---

## Test Coverage

### Scenario Coverage

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | `@SCN001` | `scripts/__tests__/sdlc-safe-recoveries.test.mjs` | Implemented |
| AC2 | `@SCN002` | `scripts/__tests__/sdlc-safe-recoveries.test.mjs` | Implemented |
| AC3 | `@SCN003` | `scripts/__tests__/sdlc-safe-recoveries.test.mjs` | Implemented |

### Test-Layer Findings

Kept test types: `bdd` (from `steering/test-layers.json`).

- Duplicate: none
- Non-kept type: none (`check-test-layers.mjs` classifies the file as `bdd`). Three tests cite no `@SCN` tag, one of which checks `WORKFLOW.md` text (F2, info).
- Justified: none recorded

- Test execution: Pass

---

## Exercise Test Results

The selection answered `all`, so every smoke surface was exercised live against fresh clones of `Nunley-Media-Group/nmg-sdlc-smoke`, each in an interactive `claude --plugin-dir <this checkout>` session in a detached tmux session, with head-bound records under `.nmg-sdlc/smoke/surfaces/`:

| Surface | Command | Result |
|---------|---------|--------|
| draft-issue | `/sdlc-draft-issue <provision.need>` | Passed: created smoke issue #344 "Add greeting_last_word library helper" (enhancement, v3) |
| write-spec | `/sdlc-write-spec #344` | Passed: spec PR #345 "docs: approve spec for #344" merged; #344 carries `spec-created`; Finished chosen |
| onboard-project | `/sdlc-onboard-project` | Passed: detected already-initialized, delegated to upgrade, no files written |
| upgrade-project | `/sdlc-upgrade-project` | Passed: kept `bdd,unit`, created `steering/sdlc-models.json`, skipped verification scope; the session's auto-mode classifier blocked the approved `apply` argv, so it was run as the person through the workflow's own `!` instruction; apply exited 0 (no new labels), post-apply detection and the smoke suite (1063 passed) were green |
| steering | `/sdlc-steering` | Passed: updated `project-structure.md` layout snippet; apply and validate passed |
| run-retro | `/sdlc-run-retro` | Passed: wrote `steering/retrospective.md` and its state for defect #219 |
| execute | `/sdlc-execute #344` (gate-driven headless) | Passed: PR #346 MERGED at `d38f81fd0cc476a1787e759a80be0d2211c3db8f`, issue #344 CLOSED |

All smoke clones and tmux sessions were removed afterwards; `.nmg-sdlc/smoke/provisioned.json` records issue #344.

---

## Steering Doc Verification Gates

| Gate | Tier | Selection | Status | Evidence |
|------|------|-----------|--------|----------|
| `repository.tests` | change | `claude:haiku`, reason `selection_all`, full suite | Pass | `npm test -- --runInBand` exited 0: 78 suites passed, 1 skipped; 1943 tests passed, 2 skipped (`.nmg-sdlc/verification/573/repository.tests.log`) |
| `repository.nmg-sdlc-smoke` | null | null | Pass | Surfaces draft-issue, write-spec, onboard-project, upgrade-project, steering, run-retro exercised at this head; execute delivered smoke #344 via PR #346 MERGED at `d38f81fd0cc476a1787e759a80be0d2211c3db8f`, issue CLOSED |
| `repository.tests.full` | full | n/a | Skipped before merge | Runs under `/sdlc-verify-full` |
| `repository.nmg-sdlc-smoke.full` | full | n/a | Skipped before merge | Runs under `/sdlc-verify-full` |

**Gate Summary**: 2/2 applicable pre-merge gates passed, 0 failed, 0 incomplete; 2 full-tier gates skipped by tier.

---

## Fixes Applied

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| environment | Gate prerequisite | `scripts/node_modules/` (git-ignored) | The first gate run in this new worktree failed `repository.tests` with `Cannot find module scripts/node_modules/.bin/jest` because dev dependencies were not installed; smoke was deferred | Ran `npm ci` in `scripts/` (no tracked change) and reran the gate once | direct |

No source, spec or steering file was edited.

---

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| info | Testability | `scripts/__tests__/sdlc-safe-recoveries.test.mjs` | F1: no test covers the refusal side of the merge-tip subject proof; review probes P1 and P3 confirm the code refuses | Not an acceptance criterion; info only |
| info | Test layers | `scripts/__tests__/sdlc-safe-recoveries.test.mjs` | F2: three new tests cite no `@SCN` tag; one asserts `WORKFLOW.md` prose | Requested by T005; layer check passes |
| info | Structure | `scripts/sdlc-safe-recoveries.mjs` | F3: seven new helpers are exported but used only in-module | Cosmetic |
| info | Error handling | `workflows/write-code/WORKFLOW.md`, `scripts/sdlc-safe-recoveries.mjs` | F4: with no implement commit after a controller-authored commit, the newest non-merge subject is the controller's (accepted) or its revert (fails closed) | Not reached in the usual repair sequence; same as pre-change behavior |

---

## Recommendation

Ready to merge: the review passed with only `info` notes, and every pre-merge validation passed at the queue head.
