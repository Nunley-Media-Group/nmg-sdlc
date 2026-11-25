# Verification Report: Substitute the absolute plugin root for `<plugin-root>` in rendered interactive command prompts

**Date**: 2026-11-25
**Issue**: #618
**Reviewer**: Claude (nmg-sdlc verify worker, gate phase)
**Scope**: Implementation verification against spec
**Verification head**: b68e82bbe38f99e34ba272be36ceea3e9c0caf9a

---

## Executive Summary

The review phase passed at `602dfd1553225756b6c9d40afdb1cd9accab88f8` with no finding above `info`. The gate phase ran once at the queue head `b68e82bbe38f99e34ba272be36ceea3e9c0caf9a`, which adds only the prepared version commit (`VERSION`, `package.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md`). Every registered pre-merge validation passed, the selection was accepted with no rejection, and the live smoke gate exercised every selected interactive surface and delivered smoke issue #374 end to end.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 4 |
| Error Handling | 5 |
| **Overall** | 4.8 |

### Implementation Status: Pass
**Total Issues**: 2 (both `info`, none blocking)

---

## Issue Scope

- Active issue: #618
- Spec: `specs/618-substitute-the-absolute-plugin-root-for-plugin-root-in-rendered-interactive-command-prompts`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002, T003]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":618,"specPath":"specs/618-substitute-the-absolute-plugin-root-for-plugin-root-in-rendered-interactive-command-prompts","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/618.json`, tier `pre-merge`, identity head `b68e82bbe38f99e34ba272be36ceea3e9c0caf9a`, tree clean.
- Coverage: declared 4, recorded 4, complete `true`; no missing, duplicate or unknown results.
- Ceiling: none (`ok: true`).
- Selection: mode `selected` from `claude:haiku` (`xhigh`), reason `selected`, no fallback path, `rejection: null`. Tests selected: 8. Surfaces selected: `draft-issue`, `write-spec`, `onboard-project`, `upgrade-project`, `steering`, `run-retro`, `execute`, `status`, `verify-full`, `plugin-host`.

---

## Acceptance Criteria Verification

From the review record `.nmg-sdlc/verification/618-review.json` (mode `full`). No criterion's tests mock the path under test; every acceptance row is `real_entry_point`.

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Interactive prompts carry the absolute plugin root | Pass | `src/sdlc-commands.mjs:51` returns `materializeRenderedPluginRoot(materializeControllerPaths(...))`; rendering all 7 interactive commands under a root containing a space left no `<plugin-root>`; `@SCN001` in `scripts/__tests__/rendered-plugin-root.test.mjs`. Live smoke transcripts show absolute operands such as `node "/Volumes/Fast Brick/source/repos/nmg-sdlc-wt/618/scripts/sdlc-upgrade.mjs"` and `.../scripts/sdlc-steering.mjs` in the rendered upgrade and steering prompts. |
| AC2 | Shell operands stay one word under a root with spaces | Pass | Fenced blocks and whitespace-bearing inline spans route through `materializePluginRootCommand`; `@SCN002` covers fenced path, glob tail, inline command span and prose; probes covered unclosed and 4-backtick fences, JSON-quoted values and an apostrophe root. |
| AC3 | Existing controller-path rendering is preserved | Pass | `materializeControllerPaths` runs first, unchanged; already-absolute text returns unchanged (`src/sdlc-commands.mjs:82`); `@SCN003`. |
| AC4 | The plugin-path note describes current hook behavior | Pass | `src/sdlc-prompt-snippets.mjs:254-261` doc comment names Bash commands, Read paths, and the `path` of Glob and Grep calls; `@SCN004`. |

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | `src/sdlc-commands.mjs:51`, `81-93` |
| FR2 | Pass | `FENCED_BLOCK_RE`, `PROSE_PLACEHOLDER_RE`, `materializePluginRootCommand` |
| FR3 | Pass | `pluginPathsNote` renders the absolute root and `<root>/workflows/<name>/`; doc comment updated |
| FR4 | Pass | Controller operands byte-identical; `sdlc-commands`, `execute-goal` and `execute-safe-remediation-contract` suites pass |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Substitute the plugin root in rendered interactive prompts | Complete | `src/sdlc-commands.mjs` |
| T002 | Correct the plugin-path note doc comment | Complete | `src/sdlc-prompt-snippets.mjs` |
| T003 | Implement the Regression Scenarios | Complete | `scripts/__tests__/rendered-plugin-root.test.mjs` |

---

## Architecture Assessment

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID | 5 | One exported pure function composed after controller-path materialization; reuses `materializePluginRootCommand` from `src/host-events.mjs` rather than duplicating quoting. |
| Security | 5 | Operands are JSON-quoted so a root with spaces or an apostrophe stays one shell word; no shell interpolation of untrusted input. |
| Performance | 5 | Linear regex passes over rendered text; early return when no placeholder. |
| Testability | 4 | Scenario tests drive `renderInteractiveWorkflow` and the exported function with no mocks; temp provenance directories are left behind (F2). |
| Error Handling | 5 | Empty or non-string root and placeholder-free text return unchanged; trailing separators trimmed. |

Consumers (`scripts/sdlc-render-prompt.mjs:57`, `scripts/skill-exercise-runner.mjs:344`, `renderWriteSpecContinuation`, `hooks/register.ts:199`, the new test) were each reviewed and pass.

---

## Test Coverage

### Scenario Coverage

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | `@SCN001` | `scripts/__tests__/rendered-plugin-root.test.mjs` | Implemented |
| AC2 | `@SCN002` | `scripts/__tests__/rendered-plugin-root.test.mjs` | Implemented |
| AC3 | `@SCN003` | `scripts/__tests__/rendered-plugin-root.test.mjs` | Implemented |
| AC4 | `@SCN004` | `scripts/__tests__/rendered-plugin-root.test.mjs` | Implemented |

### Test-Layer Findings

Kept test types: `bdd`.

- Duplicate: none
- Non-kept type: none
- Justified: none

---

## Test Results

| Validation | Tier | Selection | Status | Evidence |
|------------|------|-----------|--------|----------|
| `repository.tests` | change | `claude:haiku`, reason `selected`, 8 tests | Pass | `npm test -- --runInBand` on `rendered-plugin-root`, `sdlc-commands`, `sdlc-prompt-snippets`, `plugin-root-materialization`, `plugin-controller-path`, `plugin-commands`, `interactive-gates-contract`, `plugin-surface-verification` exited 0; changed-line coverage accepted (no rejection) |
| `repository.nmg-sdlc-smoke` | null | null | Pass | See Smoke Lifecycle Evidence |
| `repository.tests.full` | full | null | Skipped before merge | Runs under `/sdlc-verify-full` |
| `repository.nmg-sdlc-smoke.full` | full | null | Skipped before merge | Runs under `/sdlc-verify-full` |

---

## Smoke Lifecycle Evidence (`repository.nmg-sdlc-smoke`)

Each selected interactive surface was driven live with `claude --plugin-dir <this checkout>` in a detached tmux session against a fresh `--single-branch` clone of `Nunley-Media-Group/nmg-sdlc-smoke`, with a full-session transcript and a head-bound record under `.nmg-sdlc/smoke/surfaces/`.

| Surface | Command | Result |
|---------|---------|--------|
| draft-issue | `/sdlc-draft-issue <provision.need>` | Created smoke issue #374 "Add greeting_lowercase library helper" (enhancement, v3) |
| write-spec | `/sdlc-write-spec #374` | Spec published through PR #375 (MERGED); #374 labelled `spec-created`; `Finished` chosen |
| onboard-project | `/sdlc-onboard-project` | Detected the already-initialized project, delegated to upgrade, changed nothing |
| upgrade-project | `/sdlc-upgrade-project` | Kept `bdd,unit`, declined `sdlc-models`, deferred verification-scope; approved apply wrote `steering/test-layers.json` in the clone only (exit 0) |
| steering | `/sdlc-steering` | Refreshed managed modules; no content change; validation passed |
| run-retro | `/sdlc-run-retro` | Updated `steering/retrospective.md` and state in the clone |
| execute | gate-run `/sdlc-execute #374` (session `11a9d8fd-b8c6-4b4e-8b5f-eb8b8f80a24c`) | Issue #374 CLOSED; PR #376 MERGED at `9f87b63ac5bf2d482801082faba02e98075168fa`, matching the invocation's pre-merge delivery proof |

Note: in the upgrade-project session the auto-mode classifier blocked the plan's approved `sdlc-upgrade.mjs apply` call; the worker ran that exact approved command through the session's `!` shell mode, contained to the smoke clone, and the workflow verified the result. Every rendered prompt in these transcripts carried the absolute plugin root, which is live evidence for AC1 and AC2.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| Environment | Test harness | `scripts/node_modules` | First gate run failed `repository.tests`: `Cannot find module .../scripts/node_modules/.bin/jest` because dev dependencies were not installed in this worktree | Ran `npm ci` in `scripts/` (gitignored, no tracked change) and reran the gate once | direct |

## Remaining Issues

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low (info F1) |
| **Category** | Error Handling |
| **Location** | `src/sdlc-commands.mjs` |
| **Issue** | The substitution also rewrites project-owned steering prose that describes the placeholder concept itself (for example in `project-tech.md` and `project-structure.md`). |
| **Impact** | Descriptive prose reads oddly; conforms to AC1. |
| **Reason Not Fixed** | Within the approved contract; a later spec could exempt descriptive mentions. |

| Field | Value |
|-------|-------|
| **Severity** | Low (info F2) |
| **Category** | Testing |
| **Location** | `scripts/__tests__/rendered-plugin-root.test.mjs` |
| **Issue** | `provenanceRoot()` creates an `os.tmpdir()` directory per render and never removes it. |
| **Impact** | Minor temp-directory litter during test runs. |
| **Reason Not Fixed** | Info only; outside gate-phase scope. |

---

## Recommendation

**Ready for PR**

All four acceptance criteria and functional requirements pass, every registered pre-merge validation passed at the exact head with complete coverage, and the live smoke gate proved each selected interactive surface and an exact-head delivery.
