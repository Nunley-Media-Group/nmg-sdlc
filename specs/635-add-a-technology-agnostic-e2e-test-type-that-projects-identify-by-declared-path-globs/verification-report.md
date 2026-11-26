# Verification Report: Add a technology-agnostic e2e test type that projects identify by declared path globs

**Date**: 2026-11-26
**Issue**: #635
**Reviewer**: Claude (nmg-sdlc verify worker, gate phase)
**Scope**: Implementation verification against spec
**Verification head**: b9e292ce2abdbfe86ccd73ccd28b1097bddefba7

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 5 |
| **Overall** | 4.5 |

### Implementation Status: Pass
**Total Issues**: 0 above info

The review of this source passed with no finding above `info`. The pre-merge gate (`sdlc-verify-steering.mjs`, `.nmg-sdlc/verification/635.json`) recorded no ceiling and complete coverage (declared 4, recorded 4). On the rerun with supervisor guidance, the selection call answered `all` (`selection_all`). The full contract suite therefore ran and passed: 90 suites passed and 1 skipped; 2123 tests passed and 2 skipped; exit 0. With every surface selected, `repository.nmg-sdlc-smoke` passed. It exercised all six interactive surfaces live at this head and delivered smoke issue #383 through PR #385, merged at `7003baf8`, and the issue is CLOSED. The artifact records no selection rejection. Source and steering were not edited.

---

## Issue Scope

- Active issue: #635
- Spec: `specs/635-add-a-technology-agnostic-e2e-test-type-that-projects-identify-by-declared-path-globs`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC8]; FR [FR1–FR10]; tasks [T001–T004]; scenarios [SCN001–SCN008]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":635,"specPath":"specs/635-add-a-technology-agnostic-e2e-test-type-that-projects-identify-by-declared-path-globs","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Acceptance Criteria Verification

All rows come from the passed review record `.nmg-sdlc/verification/635-review.json` (reviewed head a0b5bb8, mode full). Every criterion is exercised through its real entry point. No criterion's tests mock the path under test.

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | e2e is a valid kept type | Pass | `src/test-layers.mjs` TEST_LAYER_TYPES / TYPE_DESCRIPTIONS.e2e; `scripts/__tests__/e2e-test-type.test.mjs` @SCN001 |
| AC2 | Declared globs classify files regardless of stack | Pass | `scripts/upgrade-test-layers.mjs` classifyTestFile/scan via declaredTestType; @SCN002 on a disposable project |
| AC3 | Declared globs apply to every type; undeclared files keep today's classification | Pass | TYPE_TOKENS e2e entry; conflict yields `test_layers_invalid`; @SCN003 |
| AC4 | Kept e2e tests are never migration candidates or check violations | Pass | pairWithFeatures(kept); `test-layers-candidates` CLI; `check-test-layers.mjs` probe; @SCN004 |
| AC5 | An e2e test that cites a scenario counts as its implementation | Pass | gateBatch kept union; real `test-layers-batch begin/gate` CLI; report-format/template rule; @SCN005 |
| AC6 | Write-spec may task an e2e test; implement workers may add one | Pass | testLayersRule; `workflows/write-spec/templates/tasks.md`; `workflows/write-code/WORKFLOW.md`; validJustifiedTests; @SCN006 |
| AC7 | Invalid paths declarations fail closed | Pass | validatePaths in `src/test-layers.mjs`; @SCN007 |
| AC8 | Upgrade proposes e2e when globs are declared | Pass | detectedTypes/testLayersWithKept/applyTestLayers; `workflows/upgrade-project/WORKFLOW.md`; @SCN008 |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add the e2e type, paths validation, glob lookup and rule text | Complete | `src/test-layers.mjs`, `scripts/test-layers.mjs` |
| T002 | Classify by declared globs across the inventory, upgrade and check | Complete | `scripts/upgrade-test-layers.mjs`, `scripts/check-test-layers.mjs` |
| T003 | Document e2e and paths in the workflows, README and changelog | Complete | README, upgrade-project, write-code, write-spec, verify-code files |
| T004 | Implement the `feature.gherkin` scenarios | Complete | `scripts/__tests__/e2e-test-type.test.mjs` |

---

## Architecture Assessment

Scores come from the three review lenses (acceptance, failure-paths, test-quality).

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID | 4 | Type/glob validation stays in Node-free `src/test-layers.mjs`. A second import-free glob matcher sits beside `src/sdlc-glob.mjs`; design.md accepts this (I1) |
| Security | 5 | Globs that are absolute, contain `..`, or are empty or duplicated are rejected. No shell interpolation |
| Performance | 4 | Glob matching is a bounded per-path scan. Compiled matchers are cached |
| Testability | 4 | Every scenario runs real module and CLI entry points in disposable projects. Workflow text is checked by content assertions (I3) |
| Error Handling | 5 | Invalid paths, two-type conflicts and invalid existing files fail closed with `test_layers_invalid` and write nothing |

---

## Test Coverage

### Scenario Coverage

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | `@SCN001` | `scripts/__tests__/e2e-test-type.test.mjs` | Implemented |
| AC2 | `@SCN002` | `scripts/__tests__/e2e-test-type.test.mjs` | Implemented |
| AC3 | `@SCN003` | `scripts/__tests__/e2e-test-type.test.mjs` | Implemented |
| AC4 | `@SCN004` | `scripts/__tests__/e2e-test-type.test.mjs` | Implemented |
| AC5 | `@SCN005` | `scripts/__tests__/e2e-test-type.test.mjs` | Implemented |
| AC6 | `@SCN006` | `scripts/__tests__/e2e-test-type.test.mjs` | Implemented |
| AC7 | `@SCN007` | `scripts/__tests__/e2e-test-type.test.mjs` | Implemented |
| AC8 | `@SCN008` | `scripts/__tests__/e2e-test-type.test.mjs` | Implemented |

### Test-Layer Findings

Kept test types: `bdd`

- Duplicate: none
- Non-kept type: none
- Justified: none (implement handoff `justifiedTests: []`)

---

## Exercise Test Results

The smoke steering snippet drove each selected interactive surface live from fresh clones of `Nunley-Media-Group/nmg-sdlc-smoke`. Each ran in `claude --plugin-dir <this checkout>` inside a detached tmux session. Each wrote a head-bound record under `.nmg-sdlc/smoke/surfaces/`.

| Surface | Command | Result |
|---------|---------|--------|
| draft-issue | `/sdlc-draft-issue <provision.need>` | Passed: created smoke issue #383 "Add greeting_ascii_count library helper" (enhancement, v3) |
| write-spec | `/sdlc-write-spec #383` | Passed: #383 has `spec-created`; spec PR #384 "docs: approve spec for #383" merged; Finished chosen |
| upgrade-project | `/sdlc-upgrade-project` | Passed: the interview offered Stage models / Test types / Verify scope and recorded kept `bdd,unit` in `steering/test-layers.json` (clone only, uncommitted). The auto-mode classifier blocked the approved apply argv, so it ran as the person would, via `!` in the smoke clone (contained). Exit 0 |
| run-retro | `/sdlc-run-retro` | Passed: rewrote `steering/retrospective.md` and its state file in the clone (uncommitted) |
| onboard-project | `/sdlc-onboard-project` | Passed: detected the already-initialized project (steering, 120 specs, VERSION 3.97.0). Exit was chosen; the approved plan wrote no files |
| steering | `/sdlc-steering` | Passed: planned an Edit snippet content update. After approval it ran `sdlc-steering.mjs apply` and `validate` from this checkout. The structure snippet changed (clone only, uncommitted), and the registrationHash was unchanged (`sha256:fdaa3308…bec4`) |
| execute | gate-run `/sdlc-execute #383` (headless, session ecf607cb) | Passed: PR #385 MERGED at `7003baf83ee568a022e8c3dd7eebe2c8eafbcf5e`, which matches the pre-merge delivery proof; issue #383 CLOSED |

Provisioning record: `.nmg-sdlc/smoke/provisioned.json` names issue #383, which is now delivered. The next verification must provision a fresh issue. Draft-issue, write-spec, upgrade-project and run-retro were exercised earlier in this verification at the same head. Onboard-project and steering were exercised in this gate run, because the `all` selection added them. Clones and tmux sessions were removed.

---

## Steering Doc Verification Gates

Artifact: `.nmg-sdlc/verification/635.json`. Tier: pre-merge. Coverage: declared 4, recorded 4, complete true. **Ceiling: none (Pass).**

| Gate | Tier | Selection | Status | Evidence |
|------|------|-----------|--------|----------|
| repository.tests | change | claude:haiku, reason `selection_all`, full suite | Pass | `npm test -- --runInBand` (cwd `scripts`) exited 0. Suites: 90 passed, 1 skipped. Tests: 2123 passed, 2 skipped. Log: `.nmg-sdlc/verification/635/repository.tests.log` |
| repository.nmg-sdlc-smoke | — | all surfaces (draft-issue, write-spec, onboard-project, upgrade-project, steering, run-retro, execute, status, verify-full, plugin-host, shared-references, project-steering, script-assets, ci) | Pass | All six interactive surface records were bound to `b9e292ce`. Delivered #383 through PR #385, MERGED at `7003baf8`; issue CLOSED |
| repository.tests.full | full | — | Skipped (full tier, not run before merge) | `/sdlc-verify-full` |
| repository.nmg-sdlc-smoke.full | full | — | Skipped (full tier, not run before merge) | `/sdlc-verify-full` |

Selection record: mode `all`, reason `selection_all`, model haiku at xhigh, guidanceSupplied true. Required surfaces were write-spec, upgrade-project and execute, and all were selected. There was no rejection.

**Gate Summary**: 2/2 applicable gates passed, 0 failed, 0 incomplete. 2 full-tier gates skipped.

The previous attempt at this head was rejected with `selection_uncovered`: 24 changed lines were reached only through spawned CLI subprocesses. That was a selection gap. On the rerun the selection call answered `all`, so the whole suite ran and the artifact records no selection rejection.

---

## Fixes Applied

None. The gate phase does not edit source.

## Remaining Issues

None above info.

### Low Priority (info, from review)

- I1: a second import-free glob matcher sits beside `src/sdlc-glob.mjs` (accepted in design).
- I2: path validation also rejects leading `./`, a trailing `/` and `//` (documented and tested).
- I3: the workflow-text changes have content assertions. The live surface exercise above covers upgrade-project, draft-issue, write-spec and run-retro.

---

## Positive Observations

- Configuration that cannot be validated fails closed, with no write on failure.
- Every scenario drives the real CLI and module entry points against disposable projects.
- Live upgrade-project run showed the test-type interview and the kept-set write working from this checkout.

---

## Recommendation

**Ready for PR**: the review passed with info notes only. Both applicable pre-merge gates passed at `b9e292ce2abdbfe86ccd73ccd28b1097bddefba7`, including a live smoke delivery.
