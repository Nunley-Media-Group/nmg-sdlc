# Verification Report: Default the execute implement stage to Opus at medium effort and offer the new defaults on upgrade

**Date**: 2026-11-16
**Issue**: #561
**Reviewer**: Claude Code (nmg-sdlc verify worker, gate phase)
**Scope**: Pre-merge gate for the reviewed implementation against the Approved spec
**Verification head**: baacc9dc1b3d20196a36e2621e57875786ff27f5

---

## Executive Summary

The review of this source passed with no finding above `info`. The review checklist is in `.nmg-sdlc/verification/561-review.md`, reviewed head `4bcf094c81c967f47af3c3cc6ceeb18b1a8ad158`. Since then the branch has only integrated the default branch (`ba9bd38`) and prepared the version (`baacc9d`, 4.16.0). The pre-merge gate ran once through `scripts/sdlc-verify-steering.mjs` at the verification head, and both required validations passed:

- `repository.tests` **passed**: 69 suites passed and 1 was skipped; 1663 tests passed and 2 were skipped, out of 1665.
- `repository.nmg-sdlc-smoke` **passed**: `/sdlc-execute #317` delivered the provisioned smoke issue. Issue #317 is CLOSED, and PR #322 is MERGED at head `e25b2312487511cb1076ed86d0629c812cd51573`.

The intermittent marker race in `scripts/__tests__/nmg-sdlc-smoke.test.mjs` that failed the earlier gate is fixed: commit `4bcf094` writes the marker to a temporary file and renames it into place. The full suite passed at this head.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | 5.0 |

### Implementation Status: Pass
**Total Issues**: 0 blocking, major or minor (5 `info` notes carried over from the review)

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/561.json` (generated 2026-11-16T04:07:04.321Z, base `main`, 20 changed paths)
- Identity: head `baacc9dc1b3d20196a36e2621e57875786ff27f5`, tree `clean`, spec hash `sha256:18eb157bdbd333081289008d1a60f83516c65821359f2bcf30966de04cc40ca6`, steering hash `sha256:cc80105a430c7fd1d914c6e253145b44d198660fb624848c166e778d00887aba`
- Coverage: `declared: 2`, `recorded: 2`, `complete: true`, with no missing, duplicate or unknown results
- Ceiling: none (`ceiling: null`). Every required validation has a terminal `passed` result.

---

## Issue Scope

- Active issue: #561
- Spec: `specs/561-default-the-execute-implement-stage-to-opus-at-medium-effort-and-offer-the-new-defaults-on-upgrade`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3, FR4, FR5, FR6]; tasks [T001, T002, T003, T004, T005, T006]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":561,"specPath":"specs/561-default-the-execute-implement-stage-to-opus-at-medium-effort-and-offer-the-new-defaults-on-upgrade","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004","T005","T006"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Acceptance Criteria Verification

This table comes from the passed review record (reviewed head `4bcf094`). No criterion's tests mock the path under test.

| AC | Description | Status | Exercised | Evidence |
|----|-------------|--------|-----------|----------|
| AC1 | New plugin defaults | Pass | real_entry_point | `src/stage-models.mjs:15-22` sets implement to opus/medium and verify to opus/high, and leaves start, deliver and repair unchanged. `sdlc-models.test.mjs` "plugin defaults" and the `sdlc-execute.test.mjs` stage-dispatch tests check the model and effort each stage starts with. |
| AC2 | Onboarding and upgrade write the new defaults | Pass | real_entry_point | `sdlc-models.mjs ensure` → `completeStageModels` → `defaultsCopy()` writes `STAGE_MODEL_DEFAULTS` (`scripts/sdlc-models.mjs:31-33,88-125`). Tests drive `applyUpgrade([sdlc-models])` and `completeStageModels`. A review probe showed that a partial file gets the new defaults and keeps its custom values. |
| AC3 | Upgrade offers the new defaults to a project on the old ones | Pass | real_entry_point | `detectSdlcModelsDefaults` and `applySdlcModelsDefaults` (`scripts/sdlc-upgrade.mjs:2545-2578`), through `refreshStageModelDefaults` (`sdlc-models.mjs:159-188`), replace only the stale entries and keep key order. Tests cover an approved offer, a declined offer that leaves the bytes unchanged, a custom value that is never offered, and an invalid file that is never rewritten. |
| AC4 | Docs and this repository match | Pass | real_entry_point | `README.md:84,99,105,149`, `workflows/onboard-project/WORKFLOW.md:52`, the upgrade workflow and its three references, and `steering/sdlc-models.json` (implement opus/medium) all match. `readme-sdlc-models-contract.test.mjs` and the "checked-in repository stage models file" test pass. |

FR1 to FR6 passed in the review. So did the design paths DP1 (an approved refresh against a file that has become invalid reports `failed:<diagnostic>` and writes nothing) and DP2 (an approved refresh against an entry since set to a custom value reports `already-current` and writes nothing), the CONSUMERS row, and consumer rows C1 to C9.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Change the implement default and record superseded defaults | Complete | `src/stage-models.mjs`, `src/stage-models.d.mts` |
| T002 | Refresh helper | Complete | `scripts/sdlc-models.mjs` `staleStageDefaults`, `refreshStageModelDefaults` |
| T003 | Upgrade offers the refresh | Complete | `scripts/sdlc-upgrade.mjs` `sdlc-models-defaults` item, order 10.81 |
| T004 | Docs and repository file | Complete | README, onboard and upgrade workflows and references, `steering/sdlc-models.json` |
| T005 | Regression tests | Complete | `sdlc-models.test.mjs`, `sdlc-execute.test.mjs`, `readme-sdlc-models-contract.test.mjs` |
| T006 | Add the CHANGELOG entry | Complete | `[Unreleased]` bullets end with `(#561)` |

---

## Architecture Assessment

Scores come from the review's three lens results (acceptance, failure-paths, test-quality).

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID | 5 | The defaults and the superseded defaults live in one module (`src/stage-models.mjs`). The refresh logic is in `sdlc-models.mjs`; upgrade only detects the item and dispatches it. |
| Security | 5 | The refresh checks the file with `lstat` and refuses symlinks and non-regular files. It parses and validates the JSON before any write, and it uses no shell interpolation. Review note F2 records the existing lstat-then-write window, a local-only gap. |
| Performance | 5 | It reads and writes one small file, and only for approved items. |
| Testability | 5 | Tests drive the real `detectUpgrade` and `applyUpgrade` entry points on temporary files and assert at byte level that nothing was written. The smoke test's marker race is fixed, and the full suite is green. |
| Error Handling | 5 | A file that is invalid, malformed or absent reports `failed:<diagnostic>` and stays unchanged. A file that is already current or customized is never rewritten. |

---

## Test Results

| Validation | Provider | Required | Tier | Selection | Status | Evidence |
|------------|----------|----------|------|-----------|--------|----------|
| `repository.tests` | `builtin.command` (`npm test -- --runInBand`, cwd `scripts`) | yes | null | null | **Passed** | `npm test -- --runInBand exited 0`. Test Suites: 1 skipped, 69 passed, 69 of 70 total. Tests: 2 skipped, 1663 passed, 1665 total; 733.8 s. Log: `.nmg-sdlc/verification/561/repository.tests.log` |
| `repository.nmg-sdlc-smoke` | `project.nmg-sdlc-smoke` | yes | null | null | **Passed** | `nmg-sdlc-smoke delivered #317`. Headless `claude /sdlc-execute #317` (session `3e16f7d4-b2c9-4fbd-b990-09aa2c22ed5d`). Closing-PR proof: issue #317 CLOSED, PR #322 MERGED at `e25b2312487511cb1076ed86d0629c812cd51573`, outside the pre-run baseline. |

**Gate Summary**: 2/2 passed, 0 failed, 0 incomplete

### Smoke Lifecycle Evidence

Smoke provisioning reused the recorded issue `Nunley-Media-Group/nmg-sdlc-smoke#317`. Before the run it was OPEN and carried `spec-created`, and its spec PR #318 (`docs: approve spec for #317`) had merged on 2026-11-16T02:00:26Z, so no new issue was drafted. The provider cloned the smoke repository with `--single-branch` and recorded the closing-PR baseline for #317. It then ran this checkout's `/sdlc-execute #317` headlessly. The resulting proof:

- https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/317 is CLOSED.
- https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/322 is MERGED at `e25b2312487511cb1076ed86d0629c812cd51573`.

Issue #317 is now delivered and must not be reused. The next verification will provision a fresh smoke issue.

---

## Fixes Applied

None in the gate phase. Under `/sdlc-execute`, the gate does not edit source. The smoke-test marker race reported by the earlier gate was repaired in `4bcf094` by the implement stage, and the review covered that repair (note F5).

## Remaining Issues

No blocking, major or minor issues. These `info` notes are carried over from the review and need no change:

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Info (F1) | Error Handling | `scripts/sdlc-models.mjs` | A valid partial file with implement `{ model: "haiku" }` and no effort now resolves to haiku/medium instead of haiku/xhigh. | Intended: a missing key takes the current default. |
| Info (F2) | Security | `scripts/sdlc-models.mjs` | `lstat` is checked before `writeFileSync`, which leaves a local-only window in which a symlink could be swapped in. | Same pattern as the existing `completeStageModels`; no change requested. |
| Info (F3) | Error Handling | `scripts/sdlc-upgrade.mjs` | A project that keeps implement haiku/xhigh on purpose is offered the refresh again on every upgrade run. | Matches the spec's Alternatives decision. |
| Info (F4) | Testability | `workflows/upgrade-project/WORKFLOW.md` | The interactive question for the category group was not exercised live. | It runs only in the TUI. The detect and apply helper it drives is covered through `applyUpgrade`. |
| Info (F5) | Testing | `scripts/__tests__/nmg-sdlc-smoke.test.mjs` | An out-of-spec, test-only repair: the marker is now written with a temporary file and rename. | It is correct, and the suite passed at this head. |

---

## Positive Observations

- The refresh replaces only the entries that still equal a superseded default, and it keeps every other value and the key order.
- If an approved item has disappeared by apply time, upgrade still reports the outcome instead of dropping it silently.
- The live smoke proved this checkout delivering a real issue end to end, with the implement stage on the new defaults.

## Recommendation

**Ready for PR**

The implementation of #561 passed review against the Approved spec. Every required pre-merge validation passed at `baacc9dc1b3d20196a36e2621e57875786ff27f5`, with complete coverage and no ceiling.
