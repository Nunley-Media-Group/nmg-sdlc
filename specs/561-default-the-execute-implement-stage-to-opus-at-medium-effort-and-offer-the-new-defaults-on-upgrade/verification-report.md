# Verification Report: Default the execute implement stage to Opus at medium effort and offer the new defaults on upgrade

**Date**: 2026-11-16
**Issue**: #561
**Reviewer**: Claude Code (nmg-sdlc verify worker, gate phase)
**Scope**: Pre-merge gate for the reviewed implementation against the Approved spec
**Verification head**: 8afd88337b9d940e144ce9f6b57fb00400421858

---

## Executive Summary

The review of this source passed with no finding above `info`. The review checklist is in `.nmg-sdlc/verification/561-review.md`, reviewed head `4b51e1825a21c829aedbf6bcd6d630e822b8beed`. The commits since then are the integrated default branch and the prepared version. The pre-merge gate then ran once through `scripts/sdlc-verify-steering.mjs` at the verification head, and it did not pass:

- `repository.tests` **failed**. 1 of 1645 tests failed: `nmg-sdlc mutable delivery smoke provider › settles real smoke command descendant cleanup truthfully on denied and retains evidence` in `scripts/__tests__/nmg-sdlc-smoke.test.mjs:663`, with `SyntaxError: Unexpected end of JSON input`. The other 1642 tests passed and 2 were skipped.
- `repository.nmg-sdlc-smoke` is **incomplete** with `deferred until required local validations pass`. Because the local test gate failed, the live smoke for provisioned smoke issue #317 did not run.

The failing test is not part of this change. This branch does not touch `scripts/__tests__/nmg-sdlc-smoke.test.mjs` or `steering/extensions/`, and its last change was `a77a166` on the default branch. The failure looks like a timing race inside the test. The parent test waits only for the marker file to exist (`fs.existsSync`, line 662) and then parses it (line 663). The fixture child writes that file with a non-atomic `writeFileSync` (line 259), so the parent can read it after it is created but before its contents are written. Even so, a required validation failed, so the overall status is **Fail**.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 4 |
| Error Handling | 5 |
| **Overall** | 4.8 |

### Implementation Status: Fail
**Total Issues**: 2 (1 failed required validation outside this change's scope, 1 info note carried over from the review)

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/561.json` (generated 2026-11-16T03:13:20.905Z, base `main`)
- Identity: head `8afd88337b9d940e144ce9f6b57fb00400421858`, tree `clean`, spec hash `sha256:18eb157bdbd333081289008d1a60f83516c65821359f2bcf30966de04cc40ca6`, steering hash `sha256:cc80105a430c7fd1d914c6e253145b44d198660fb624848c166e778d00887aba`
- Coverage: `declared: 2`, `recorded: 2`, `complete: true`, no missing, duplicate or unknown results
- Ceiling reported by the runner: `Incomplete`. The required `failed` result for `repository.tests` sets the overall status to **Fail**.

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

- Local verification: Not complete (`repository.tests` failed; `repository.nmg-sdlc-smoke` deferred)
- PR evidence: Not required

---

## Acceptance Criteria Verification

This table comes from the passed review record, reviewed head `4b51e18`. No criterion's tests mock the path under test.

| AC | Description | Status | Exercised | Evidence |
|----|-------------|--------|-----------|----------|
| AC1 | New plugin defaults | Pass | real_entry_point | `src/stage-models.mjs:18-19` sets implement to opus/medium and verify to opus/high. `scripts/__tests__/sdlc-models.test.mjs:48-60` and the `sdlc-execute.test.mjs` stage-dispatch tests assert the model and effort each stage starts with. |
| AC2 | Onboarding and upgrade write the new defaults | Pass | real_entry_point | `scripts/sdlc-models.mjs` ensure/completeStageModels write `STAGE_MODEL_DEFAULTS`. `sdlc-models.test.mjs:230-239` drives `applyUpgrade` (create) and `completeStageModels`. `workflows/onboard-project/WORKFLOW.md:52` runs ensure. |
| AC3 | Upgrade offers the new defaults to a project on the old ones | Pass | real_entry_point | `detectSdlcModelsDefaults` in `scripts/sdlc-upgrade.mjs:2546-2571` offers a refresh only for stale entries, and its description names the current and the target value. Tests cover approve (`:241-253`), decline with bytes unchanged (`:281-286`), a custom value that is never offered (`:288-299`), and the apply-time invalid and already-current paths (`:261-279`). |
| AC4 | Docs and this repository match | Pass | real_entry_point | `README.md:84,99,105,149`, the onboard/upgrade workflows and references, and `steering/sdlc-models.json` (implement opus/medium) all match. `readme-sdlc-models-contract.test.mjs` and `sdlc-models.test.mjs:276-285` pass. |

Functional requirements FR1 to FR6, design paths DP1 (approved refresh where the file becomes invalid, malformed or absent reports `failed:<diagnostic>` with no write) and DP2 (approved refresh where the file is already current reports `already-current` with no write), and consumers CON1 to CON4 all passed in the review. The review's REPAIR row passed with no new defect.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Change the implement default and record superseded defaults | Complete | `src/stage-models.mjs`, `src/stage-models.d.mts` |
| T002 | Refresh helper | Complete | `scripts/sdlc-models.mjs` `staleStageDefaults`, `refreshStageModelDefaults` |
| T003 | Upgrade offers the refresh | Complete | `scripts/sdlc-upgrade.mjs` `sdlc-models-defaults` item, order 10.81 |
| T004 | Docs and repository file | Complete | README, onboard/upgrade workflow references, `steering/sdlc-models.json` |
| T005 | Regression tests | Complete | `sdlc-models.test.mjs`, `sdlc-execute.test.mjs`, `readme-sdlc-models-contract.test.mjs` |
| T006 | Add the CHANGELOG entry | Complete | `[Unreleased]` bullets end with `(#561)` |

---

## Architecture Assessment

Scores come from the review lens results (acceptance, failure-paths, test-quality).

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID | 5 | The defaults live in one module (`src/stage-models.mjs`). The refresh logic sits in `sdlc-models.mjs`, and upgrade only detects and dispatches. |
| Security | 5 | The refresh checks the file with `lstat` and refuses symlinks and non-regular files. JSON is parsed and validated before any write. No shell interpolation. |
| Performance | 5 | It reads and writes one small file, and only for approved items. |
| Testability | 4 | Tests drive the real `detectUpgrade`/`applyUpgrade` entry points. The suite has an unrelated flaky smoke-provider test (see Remaining Issues). |
| Error Handling | 5 | A file that is invalid, malformed or absent reports `failed:<diagnostic>` and is left unchanged. A file that is already current or customized is never rewritten. |

---

## Test Results

| Validation | Provider | Required | Tier | Selection | Status | Evidence |
|------------|----------|----------|------|-----------|--------|----------|
| `repository.tests` | `builtin.command` (`npm test -- --runInBand`, cwd `scripts`) | yes | null | null | **Failed** | Suites: 1 failed, 1 skipped, 67 passed. Tests: 1 failed, 2 skipped, 1642 passed, 1645 total, 854 s. Failing test: `nmg-sdlc-smoke.test.mjs:663` `settles real smoke command descendant cleanup truthfully on denied and retains evidence` with `SyntaxError: Unexpected end of JSON input`. Log: `.nmg-sdlc/verification/561/repository.tests.log` |
| `repository.nmg-sdlc-smoke` | `project.nmg-sdlc-smoke` | yes | null | null | **Incomplete** | `deferred until required local validations pass`. Smoke issue #317 (OPEN, `spec-created`, spec PR #318 merged) was ready to reuse but was not delivered. |

**Gate Summary**: 0/2 passed, 1 failed, 1 incomplete

### Smoke Lifecycle Evidence

Smoke provisioning reused the recorded issue `Nunley-Media-Group/nmg-sdlc-smoke#317`. It is OPEN, carries `spec-created`, and its PR `docs: approve spec for #317` (#318) was merged on 2026-11-16T02:00:26Z, so no new issue was drafted. The live smoke did not run because the required local tests failed first. There is no delivery proof for this head.

---

## Fixes Applied

None. Under `/sdlc-execute` the gate phase does not edit source.

## Remaining Issues

### High Priority

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Testing |
| **Location** | `scripts/__tests__/nmg-sdlc-smoke.test.mjs:259` (fixture writer) and `:662-663` (reader) |
| **Issue** | The parent test waits only for the marker file to exist and then calls `JSON.parse` on it. The fixture child writes that file with a non-atomic `writeFileSync`, so the parent can read it while it is still empty. The `denied` case failed with `Unexpected end of JSON input`. |
| **Impact** | The required `repository.tests` gate fails intermittently, and the live smoke is deferred. |
| **Reason Not Fixed** | The file is outside this change's scope: the branch does not touch it, and it is unchanged from `main` (`a77a166`). The gate phase does not edit source. The fix is for the poll to wait until the marker parses, or for the child to write a temporary file and rename it into place. After that, the gate needs a fresh run. |

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low (info, carried from review F2) |
| **Category** | Error Handling |
| **Location** | `scripts/sdlc-models.mjs` |
| **Issue** | A valid partial file with implement `{ model: "haiku" }` and no effort now resolves to haiku/medium instead of haiku/xhigh. The refresh never applies to it because only a full model-and-effort pair counts as stale. |
| **Impact** | None. This matches the spec rule that a missing key takes the current default. |
| **Reason Not Fixed** | Intended behaviour. |

---

## Positive Observations

- The refresh replaces only entries that still equal a superseded default, and it keeps every other value and the key order.
- An item that was approved but has since disappeared still reports the outcome at apply time instead of being silently dropped.

## Recommendation

**Needs fixes**

The implementation of #561 is complete and passed review. The merge gate is not green because a required test failed: an intermittent race in `scripts/__tests__/nmg-sdlc-smoke.test.mjs`, which this change does not touch. As a result the live smoke did not run. Fix the race, then rerun the full gate, including the live smoke, at the new head.
