# Verification Report: Run Sonnet steps on Haiku at xhigh effort and prepare the version before verify in /sdlc-execute

**Date**: 2026-10-24
**Issue**: #482
**Reviewer**: Claude Code (manual delivery following CONTRIBUTING.md)
**Scope**: Implementation verification against spec

**Verification head**: c2b40a4a70f3a496263202111da83dbbcf7b7eac

---

## Executive Summary

### Implementation Status: Pass
**Total Issues**: 0

Both registered validations passed at the verification head: `repository.tests` and `repository.nmg-sdlc-smoke`. Coverage is 2/2 complete, with no ceiling.

The first gate run, at `dec02c7`, also passed, but its live smoke delivery (smoke #230) exposed a defect. The controller skipped `prepare-version` because status evidence reported the merged spec PR, which `/sdlc-write-spec` publishes from the same branch name. The delivery backstop refused the unprepared version, so a repair loop made the bump. `c2b40a4` makes only an open PR stop preparation and adds a regression test that fails on the old guard. On the rerun, smoke #233 went implement → controller version commit (3.46.0 → 3.47.0) → one verify → deliver, with no repair.

---

## Issue Scope

- Active issue: #482
- Spec: `specs/482-run-sonnet-steps-on-haiku-at-xhigh-effort-and-prepare-the-version-before-verify-in-sdlc-execute`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC7]; FR [FR1–FR4]; tasks [T001–T007]; scenarios [SCN001–SCN008]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":482,"specPath":"specs/482-run-sonnet-steps-on-haiku-at-xhigh-effort-and-prepare-the-version-before-verify-in-sdlc-execute","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003","T004","T005","T006","T007"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

---

## Acceptance Criteria

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Sonnet steps move to Haiku at xhigh | Pass | `src/host-events.mjs`: `SDLC_MODELS` maps implement, deliver, and `sdlc-open-pr` to `haiku`. `SDLC_EFFORTS` maps exactly those to `xhigh`. Covered by `sdlc-execute.test.mjs` and `plugin-commands.test.mjs` |
| AC2 | Stage workers start with their effort | Pass | `stageEffort`, `workerAgentArgs`, and `defaultHerdr().agentStart` in `scripts/sdlc-execute.mjs`. Tests assert efforts `[undefined, 'xhigh', undefined, 'xhigh']`, `--effort xhigh` argv, and no effort on repair. Smoke #233 sessions record `claude-haiku-5-5` for start, implement, and deliver and `claude-opus-5-5` for verify |
| AC3 | `/sdlc-open-pr` declares its effort | Pass | `renderAutomatedCommandMarkdown` writes `effort: xhigh` for `sdlc-open-pr` only. `commands/sdlc-open-pr.md` equals the renderer's output. Claude Code's frontmatter key list includes `effort` |
| AC4 | Agents declare Haiku at xhigh | Pass | `agents/spec-implementer.md` and `agents/deliverer.md` declare `model: haiku` and `effort: xhigh`. `steering-contract.test.mjs` checks each against `SDLC_MODELS` and `SDLC_EFFORTS` and the Agent Files table |
| AC5 | The controller prepares the version before verification | Pass | `prepareVersion` in `scripts/sdlc-execute.mjs`. Tests cover four cases: preparation before the first verify, a version commit verified before deliver, no second commit, and a merged spec PR sharing the branch name. A failing preparation stops the run with `version_preparation_failed: major_bump_required` and starts no worker. Live: smoke #233 commit order is implement → `feat: deliver issue #233` → verification → merge, and `VERSION` is 3.47.0 |
| AC6 | Delivery refuses an unprepared version | Pass | `scripts/sdlc-deliver.mjs` returns `version_not_prepared` with `next: verify` before creating a PR, with no create or merge calls, in `sdlc-deliver.test.mjs`. Live: smoke #230's first deliver was refused before the merge |
| AC7 | Documentation matches | Pass | README model table with an effort column and the version-order note. Also updated: `CONTRIBUTING.md`, the steering `project-tech.md` and `project-structure.md` snippets, `workflows/open-pr/WORKFLOW.md`, `references/execute-implementable-requirements.md`, and the #464 spec model table |

## Functional Requirements

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | `SDLC_EFFORTS` is the only effort source for workers, the command renderer, and the steering contract test |
| FR2 | Pass | `stageEffort` shares `repairDispatch` with `stageModel` |
| FR3 | Pass | Guard: clean, published, and not an open PR. `prepare-version` stays idempotent through `hasSynchronizedDeliveryState` |
| FR4 | Pass | A changed head re-enters the loop and is verified before deliver (smoke #233) |

## Validation Results

| Check | Status | Evidence |
|-------|--------|----------|
| Contract tests (`repository.tests`) | Pass | `npm test -- --runInBand`: 51 suites passed, 1 skipped. Tests: 1091 passed, 2 skipped |
| Live smoke (`repository.nmg-sdlc-smoke`) | Pass | `nmg-sdlc-smoke delivered #233`, PR #235 merged |
| Hooks tests | Pass | `claude plugin test .`: 20 passed |
| Claude Code plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository --claude-validate`: exit 0 |
| Current specs | Pass | `node scripts/verify-current-specs.mjs`: exit 0 |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: clean (90 items mapped), with the baseline regenerated for the reworded `references/execute-implementable-requirements.md` line |
| Skill creator | Pass | `skill-creator` invoked before editing `agents/`, `workflows/open-pr/WORKFLOW.md`, and `references/execute-implementable-requirements.md` |
| Git hygiene | Pass | `git diff --check`: exit 0 |
