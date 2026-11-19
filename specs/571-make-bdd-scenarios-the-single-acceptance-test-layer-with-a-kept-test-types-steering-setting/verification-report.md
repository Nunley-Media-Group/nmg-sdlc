# Verification Report: Make BDD scenarios the single acceptance test layer with a kept-test-types steering setting

**Date**: 2026-11-19
**Issue**: #571
**Reviewer**: nmg-sdlc verify worker (gate phase)
**Scope**: Pre-merge verification of the merge-queue head against the Approved spec

**Verification head**: 13d4c680c451bf704af532b4bc7ce0d210f3bf3a

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
**Total Issues**: 0 blocking, 0 major, 0 minor; 6 info notes

The review phase (full mode, three lenses) passed with no finding above `info` at the reviewed source head `3607d74836a7e60be973c29fa6a50700288bd79e`. The only change since then is the delivery version preparation (`13d4c68 feat: deliver issue #571`: `VERSION`, `package.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md`). The pre-merge gate ran at `13d4c680c451bf704af532b4bc7ce0d210f3bf3a` with complete coverage and both required validations passing.

---

## Issue Scope

- Active issue: #571
- Spec: `specs/571-make-bdd-scenarios-the-single-acceptance-test-layer-with-a-kept-test-types-steering-setting`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6]; FR [FR1–FR7]; tasks [T001–T008]; scenarios [SCN001–SCN006]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":571,"specPath":"specs/571-make-bdd-scenarios-the-single-acceptance-test-layer-with-a-kept-test-types-steering-setting","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/571.json` (generated 2026-11-19T22:42:59Z)
- Identity: head `13d4c680c451bf704af532b4bc7ce0d210f3bf3a`, steering `sha256:cc80105a430c7fd1d914c6e253145b44d198660fb624848c166e778d00887aba`, spec `sha256:d4460881fc13dd77f838cd7db62d16e2a6e1fe6e5509d02802b9ee185e816803`
- Coverage: declared 2, recorded 2, complete true; no missing, duplicate or unknown results
- Ceiling: none

---

## Acceptance Criteria Verification

From the passed review record `.nmg-sdlc/verification/571-review.json`. No criterion's tests mock the path under test (`mockedEntryPoints` is empty).

| AC | Description | Status | Exercised | Evidence |
|----|-------------|--------|-----------|----------|
| AC1 | New specs task only scenarios and step definitions under the default | Pass | not exercisable (template text) | `workflows/write-spec/templates/tasks.md`: feature and defect T002 implement `feature.gherkin` scenarios by `@SCN` tag; never task a separate test restating an AC |
| AC2 | Kept-test-types setting is read and validated | Pass | real entry point | `src/test-layers.mjs` `validateTestLayers`; `scripts/test-layers.mjs` `loadTestLayers` (missing → `bdd` only; JSON/symlink/non-file rejected); render-prompt CLI on `{"kept":["bdd","e2e"]}` exits 2 with `test_layers_invalid` |
| AC3 | Implement workers justify any non-scenario test | Pass | real entry point | `workflows/write-code/WORKFLOW.md` Test Layers section and `justifiedTests` handoff contract; `scripts/sdlc-execute.mjs` `validJustifiedTests`; validate-handoff CLI rejects a `bdd` entry with `handoff_invalid` |
| AC4 | Verify judges scenario coverage and flags duplicates | Pass | not exercisable (report template text) | `workflows/verify-code/checklists/report-template.md` Scenario Coverage table and Test-Layer Findings; per-layer counts removed; `references/report-format.md` matches |
| AC5 | Testability checklist no longer rewards a second layer | Pass | real entry point | `workflows/verify-code/checklists/testability.md` Seam Readiness keeps DI and injectable-clock checks for step definitions and production seams; scoring no longer rewards unit tests or coverage |
| AC6 | Setting is documented | Pass | real entry point | `README.md` surface-table row, "Kept test layers" section and troubleshooting entry; contract test @SCN006 reads the real README |

All seven functional requirements (FR1–FR7) and the eight design paths (DP1–DP8: missing file default, invalid content, unreadable/symlink/non-file, render failure, execute pre-check, mid-run worktree invalidation, malformed `justifiedTests`, non-consumer prompts unaffected) passed in the review. Consumers C1–C9 were found and checked.

---

## Task Completion

| Task | Description | Status |
|------|-------------|--------|
| T001 | Add the test-layers reader | Complete |
| T002 | Render the kept-types rule into stage prompts | Complete |
| T003 | Make spec templates task only scenario implementations | Complete |
| T004 | Limit implement test work to scenarios and justified kept-type tests | Complete |
| T005 | Report scenario coverage and test-layer findings in verify | Complete |
| T006 | Document the setting | Complete |
| T007 | Implement the feature.gherkin scenarios | Complete |
| T008 | Add the CHANGELOG entry | Complete |

---

## Architecture Assessment

Scores come from the three review lenses.

| Area | Score | Notes |
|------|-------|-------|
| SOLID | 5 | Validation (`src/test-layers.mjs`) is separate from file I/O (`scripts/test-layers.mjs`); the rule is one fragment registered through the existing prompt registry, gated by consumer |
| Security | 5 | Symlinks and non-files rejected, never defaulted; no shell interpolation; values reported as data |
| Performance | 5 | One bounded file read per render or execute pre-check |
| Testability | 4 | Tests drive `validateTestLayers`, `loadTestLayers`, the render CLI, `runExecute`, the goal CLI and the hooks render path without mocks; I5 notes the spec `# File:` header names only one of the files implementing @SCN002 |
| Error Handling | 4 | Every design path fails closed with a file/field diagnostic and stable `test_layers_invalid` / `handoff_invalid` codes; I7 notes `justifiedTests` echo can be incomplete after a repair pass |

### Scenario Coverage

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | SCN001 | `scripts/__tests__/test-layers-contract.test.mjs` | Passes |
| AC2 | SCN002 | `scripts/__tests__/test-layers-contract.test.mjs`, `test-layers.test.mjs`, `sdlc-execute.test.mjs`, `hooks/register.test.ts` | Passes |
| AC3 | SCN003 | `scripts/__tests__/test-layers-contract.test.mjs` | Passes |
| AC4 | SCN004 | `scripts/__tests__/test-layers-contract.test.mjs` | Passes |
| AC5 | SCN005 | `scripts/__tests__/test-layers-contract.test.mjs` | Passes |
| AC6 | SCN006 | `scripts/__tests__/test-layers-contract.test.mjs` | Passes |

---

## Test Results

| Validation | Provider | Required | Tier | Selection | Status | Evidence |
|------------|----------|----------|------|-----------|--------|----------|
| `repository.tests` | `builtin.command` | yes | none (untiered) | none | Pass | `npm test -- --runInBand` exited 0: 71 suites passed, 1 skipped; 1715 tests passed, 2 skipped (1372 s). Log `.nmg-sdlc/verification/571/repository.tests.log` |
| `repository.nmg-sdlc-smoke` | `project.nmg-sdlc-smoke` | yes | none (untiered) | none | Pass | Delivered provisioned smoke issue #326: closing PR #328 MERGED at `4146b6e0a52244d86ec3e5a3719b229e7bf3aa96`, issue CLOSED, PR outside the pre-run baseline (empty) |

**Gate Summary**: 2/2 passed, 0 failed, 0 incomplete.

Note on the first gate attempt: the first run at the same head recorded `repository.tests` failed with `Cannot find module .../scripts/node_modules/.bin/jest` (the fresh issue worktree had no installed dev dependencies; no test ran), so the smoke result was deferred. `npm ci` in `scripts/` installed the lockfile dependencies (git-ignored, tree stayed clean) and the gate ran once more with the results above.

### Real Smoke Lifecycle Evidence

- Provisioning (worker, per `steering/snippets/project-smoke.md`): the recorded issue #311 was closed, so a fresh issue was drafted with the real `/sdlc-draft-issue` (issue #326, "Add greeting_slug library helper") and specified with the real `/sdlc-write-spec #326` in an interactive `claude --plugin-dir <this checkout>` session in tmux; spec PR #327 merged and #326 labeled `spec-created`. Record: `.nmg-sdlc/smoke/provisioned.json` = `{ "schemaVersion": 1, "repo": "Nunley-Media-Group/nmg-sdlc-smoke", "issue": 326 }`. Tmux session and scratch clone removed.
- Delivery (provider): fresh clone, closing-PR baseline recorded (none), headless `/sdlc-execute #326` (session `77ac186d-89c3-46ba-85a8-a6ff603aba07`) with this checkout's plugin, then proof: PR #328 `MERGED`, `headRefOid` `4146b6e0a52244d86ec3e5a3719b229e7bf3aa96`, issue #326 `CLOSED`.

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `/sdlc-draft-issue`, `/sdlc-write-spec`, `/sdlc-execute` loaded from this checkout |
| **Exercise Method** | Interactive `claude --plugin-dir <checkout>` (provisioning) and headless `claude -p --plugin-dir <checkout> "/sdlc-execute #326"` (smoke provider) |
| **Result** | The changed write-spec templates produced an approved spec package for #326, and the full execute pipeline (start, implement, verify, deliver) delivered it to exact-head merge |

---

## Fixes Applied

None. The gate phase does not modify source.

## Remaining Issues

No blocking, major or minor issues. Info notes carried from the review:

| ID | Location | Note |
|----|----------|------|
| I1 | `src/sdlc-commands.mjs` | Standalone `/sdlc-verify-code` is generated without a project root, so it carries no per-project rule; README documents that its report reads `steering/test-layers.json` directly |
| I5 | spec `feature.gherkin` | The `# File:` header names only `test-layers-contract.test.mjs`; @SCN002 is also implemented in three other test files |
| I6 | `README.md` | A project snippet with id `project.test-layers` collides with the builtin fragment (documented) |
| I7 | `workflows/write-code/WORKFLOW.md`, report template, `scripts/sdlc-execute.mjs` | `justifiedTests` lives only in the latest implement handoff; a repair pass can overwrite earlier entries, so the report's Justified echo can be incomplete. Duplicate and non-kept-type flags come from the diff and are unaffected |
| I8 | `scripts/__fixtures__/skill-exercise/write-spec/artifacts/write-spec-pass.json` | The pass fixture still models an old-style AC test task; rubric does not check it |
| I9 | `README.md` | "Only the four prompts below read the file" sits beside the statement that `/sdlc-execute` also exits 2 on an invalid file; wording only |

---

## Recommendation

**Ready for merge.** The review passed with info notes only, and the pre-merge gate is complete and green at `13d4c680c451bf704af532b4bc7ce0d210f3bf3a`.
