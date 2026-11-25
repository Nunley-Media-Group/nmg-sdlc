# Verification Report: Create the spec directory in publish-approved-spec prepare

**Date**: 2026-11-25
**Issue**: #619
**Reviewer**: Claude (nmg-sdlc verify worker, gate phase)
**Scope**: Implementation verification against spec
**Verification head**: 79f0af9b1c1ca77dbcbf14c9ce744c15847af1be

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | 4.8 |

### Implementation Status: Pass
**Total Issues**: 0 blocking, 0 major, 0 minor, 1 info

`publish-approved-spec.mjs prepare` now creates `specDir` with a recursive `mkdirSync` before it returns, leaves its JSON output unchanged, and the write-spec workflow and publish reference state that `specDir` exists after `prepare`. The review passed at the implementation head 2e0166a (full mode, no finding above `info`). The pre-merge gate at the queue head 79f0af9 (version prepared, default branch integrated) passed with complete coverage, 4 of 4 validations recorded.

---

## Issue Scope

- Active issue: #619
- Spec: `specs/619-create-the-spec-directory-in-publish-approved-spec-prepare`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3]; FR [FR1, FR2, FR3]; tasks [T001, T002, T003]; scenarios [SCN001, SCN002, SCN003]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":619,"specPath":"specs/619-create-the-spec-directory-in-publish-approved-spec-prepare","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3"],"functionalRequirements":["FR1","FR2","FR3"],"tasks":["T001","T002","T003"],"scenarios":["SCN001","SCN002","SCN003"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact

- Artifact: `.nmg-sdlc/verification/619.json` (tier `pre-merge`, head `79f0af9b1c1ca77dbcbf14c9ce744c15847af1be`, clean tree)
- Ceiling: none
- Coverage: declared 4, recorded 4, complete `true`; no missing, duplicate or unknown results
- Selection: mode `selected` (haiku, xhigh), reason `selected`, no rejection; tests `publish-approved-spec`, `spec-created-label`, `interactive-gates-contract`, `spec-context-contract`, `changelog-citation-contract`; surfaces `write-spec` (required surfaces `write-spec`)

---

## Acceptance Criteria Verification

| AC | Description | Status | Exercised | Evidence |
|----|-------------|--------|-----------|----------|
| AC1 | `prepare` creates the spec directory | Pass | real entry point | `scripts/publish-approved-spec.mjs:285-286` recursive `mkdirSync(specDir)` before `ok()`; @SCN001 spawns the real CLI on a fresh repo and asserts the directory exists; mutation probe (fix removed) makes @SCN001 fail |
| AC2 | Reuse leaves existing spec files untouched | Pass | real entry point | @SCN002 writes the four Approved files, reruns real `prepare`, asserts identical JSON (`created:false`) and byte-identical files |
| AC3 | The workflow states that `specDir` exists | Pass | real entry point | `workflows/write-spec/WORKFLOW.md:130` and `workflows/write-spec/references/publish.md:87`; @SCN003 reads the shipped files and fails when the sentence is removed |

Criteria whose tests mock the path under test: none.

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | Recursive `mkdirSync` before return; harmless on reuse (@SCN002) |
| FR2 | Pass | `ok()` payload still `{branch, worktree, specDir, created}`; @SCN001/@SCN002 assert exact JSON |
| FR3 | Pass | One sentence added to each of the two workflow files |

Design paths DP1 (fresh directory), DP2 (existing directory) and DP3 (empty directory not tracked by Git; `mkdirSync` failure surfaces as JSON `publication_failed`, exit 1) pass. Consumers CN1 (WORKFLOW.md), CN2 (publish.md) and CN3 (CHANGELOG `[Unreleased]` bullet ending `(#619)`) pass.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Create specDir in prepare | Complete | `scripts/publish-approved-spec.mjs` |
| T002 | State that specDir exists in the write-spec workflow | Complete | WORKFLOW.md and references/publish.md |
| T003 | Implement the Regression Scenarios | Complete | `scripts/__tests__/publish-approved-spec.test.mjs` @SCN001-@SCN003 |

---

## Architecture Assessment

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID | 5 | Two-line change inside the existing `prepare` responsibility; no new module or dependency |
| Security | 5 | `specDir` is derived from the existing worktree path and validated spec name; no new input surface |
| Performance | 5 | One bounded `mkdirSync` per prepare |
| Testability | 5 | Scenarios drive the real CLI and shipped files; mutation probe confirms they fail without the fix |
| Error Handling | 4 | A `mkdirSync` failure is caught as generic `publication_failed` (fail-closed JSON); see F1 |

Test layers: the branch adds only `bdd` scenario implementations (@SCN001-@SCN003 in `scripts/__tests__/publish-approved-spec.test.mjs`); no test restates an AC outside its scenario and no non-kept test type was added.

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | @SCN001 | `scripts/__tests__/publish-approved-spec.test.mjs` | Implemented |
| AC2 | @SCN002 | `scripts/__tests__/publish-approved-spec.test.mjs` | Implemented |
| AC3 | @SCN003 | `scripts/__tests__/publish-approved-spec.test.mjs` | Implemented |

---

## Test Results (Steering Verification Gates)

| Validation | Tier | Selection | Status | Evidence |
|------------|------|-----------|--------|----------|
| `repository.tests` | change | claude:haiku, reason `selected`, 5 tests | Passed | `npm test -- --runInBand` on the 5 selected suites exited 0: 5 suites, 160 tests passed; changed-line coverage: 0 changed executable lines reported, 0 uncovered |
| `repository.nmg-sdlc-smoke` | null | null (surface `write-spec` selected) | Passed | `nmg-sdlc-smoke exercised write-spec`: issue #377 OPEN with `spec-created`, spec PR #378 merged; surface record `.nmg-sdlc/smoke/surfaces/write-spec.json` bound to this head |
| `repository.tests.full` | full | null | Skipped before merge | Run by `/sdlc-verify-full` |
| `repository.nmg-sdlc-smoke.full` | full | null | Skipped before merge | Run by `/sdlc-verify-full` |

## Live Smoke Exercise Evidence

- Surface selected: `write-spec` (`execute` not selected, so no delivery ran).
- Provisioning: fresh clone of `Nunley-Media-Group/nmg-sdlc-smoke`; interactive `claude --plugin-dir <this checkout>` in tmux session `nmg-smoke-79f0af9b`.
- `/sdlc-draft-issue <provision.need>` created issue #377 "Add greeting_non_ascii_count library helper" (enhancement, milestone v3).
- `/sdlc-write-spec #377` produced and published the spec through `publish-approved-spec.mjs` (prepare, commit-push, merge) using this branch's code: PR #378 "docs: approve spec for #377" merged, issue labeled `spec-created`; Finished chosen at the next-spec gate.
- Transcript: `.nmg-sdlc/smoke/surfaces/write-spec.log` (contains the sent command); provisioning record `.nmg-sdlc/smoke/provisioned.json` (issue 377). Tmux session killed and clone removed.

---

## Fixes Applied

None in this phase (gate phase does not edit source).

## Remaining Issues

- **F1** (info, failure-paths): a filesystem error from the new `mkdirSync` surfaces as the generic `publication_failed` reasonCode, which the Prepare failure list in `workflows/write-spec/references/publish.md` does not name. Behaviour is fail-closed JSON; no repair required.

## Recommendations

None required for merge.

## Overall Status: Pass
