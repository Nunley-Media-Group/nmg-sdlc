# Verification Report: Resolve plugin controllers independently of target project cwd

**Issue**: #252  
**Date**: 2026-08-24  
**Overall Status**: Pass

### Implementation Status: Pass

## Executive Summary

The implementation satisfies all eight acceptance criteria and all eight planned tasks. Public and worker prompt surfaces now use the portable `<plugin-root>` contract; runtime prompts materialize validated, JSON-quoted absolute controller paths; applicable executable controllers use realpath-aware `isCliEntry`; and copied plus linked installation tests preserve the consumer cwd and execute once.

One verification finding was fixed locally: `materializeControllerPaths` previously constructed a path without validating that the named controller existed. It now resolves every matched controller through `resolvePluginController`, producing the required `controller_unresolved` error with exit code metadata before prompt execution. Focused tests, the full Jest suite, repository surface validation, skill inventory validation, and a post-fix disposable-project OMP exercise all pass.

Architecture score: **4.8/5.0**. No remaining blocking findings.

## Issue Scope

- Active issue: #252
- Spec: `specs/252-resolve-plugin-controllers-independently-of-target-project-cwd`
- Manifest: implicit single issue; no `issue-scope.json` present
- Resolver status: `implicit_single_issue` (`singular_defect_scope`)
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8]; FR [FR1, FR2, FR3, FR4, FR5, FR6]; tasks [T001, T002, T003, T004, T005, T006, T007, T008]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":252,"specPath":"specs/252-resolve-plugin-controllers-independently-of-target-project-cwd","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required
- Next step: `/sdlc-open-pr #252`

## Acceptance Criteria

| AC | Verdict | Evidence |
|---|---|---|
| AC1 | Pass | Installed copied-package proof reached `sdlc-execute.mjs` from a consumer with no `scripts/`; the captured controller cwd remained the consumer. `workerPrompt` and extension context materialization retain product cwd. |
| AC2 | Pass | Empty and explicit execute proof captured the same installed `scripts/sdlc-execute.mjs`; `commands/sdlc-execute.md` routes both paths through the same portable controller token. |
| AC3 | Pass | Audit of `commands/` and `workflows/` found zero `node scripts/*.mjs` dispatches. Generated command synchronization tests passed. |
| AC4 | Pass | `plugin-controller-path.test.mjs` proves copied and Unix-symlink execution exactly once and inert module import; the platform-gated Windows junction case is present and skipped only off Windows. |
| AC5 | Pass | Invalid roots and missing controllers produce `controller_unresolved` with `exitCode: 2`; post-fix materialization validates each named controller before emitting a command. Decoy consumer scripts are ignored. |
| AC6 | Pass | Disposable copied and linked topology tests preserve consumer cwd and single execution. Unix symlink and Windows junction semantics are platform-gated. |
| AC7 | Pass | The recorded packaged proof built a candidate tarball, installed its copied package through `omp plugin install`, and invoked `/sdlc-status`, empty `/sdlc-execute`, and explicit `/sdlc-execute #1` from a disposable consumer without `--plugin-dir` or `--add-dir`. |
| AC8 | Pass | Existing execute/start/review/apply-review contracts remain green in the full suite; no worker naming, handoff schema, pane-retention, cwd, or main-pane ownership behavior changed. |

## Task Completion

| Task | Verdict | Evidence |
|---|---|---|
| T001 | Pass | `scripts/plugin-controller-path.mjs` exports all four specified functions and has resolver/materialization tests. |
| T002 | Pass | All ten applicable controllers call `isCliEntry(import.meta.url)`; import inertness and link behavior are tested. |
| T003 | Pass | `src/extension.ts` publishes `NMG_SDLC_PLUGIN_ROOT`; interactive, automated-context, and worker prompts materialize from `packageRoot`; automated names remain file commands. |
| T004 | Pass | Listed command/workflow surfaces use `<plugin-root>`; status inference prose is removed; command generation remains byte-identical. |
| T005 | Pass | Spawn-string contracts and prompt ceilings are updated; synchronization and byte-ceiling tests pass. |
| T006 | Pass | New topology suite covers invalid roots, decoy cwd scripts, copied install, Unix symlink, Windows junction, inert import, quoted spaces, and missing-controller failure. |
| T007 | Pass | Focused suite, full suite, and plugin-surface validator pass. |
| T008 | Pass | Installed copied-package OMP proof is recorded, plus a post-fix disposable-project RPC exercise reached `/sdlc-status --json` with the disposable project root. |

## Regression Obligations

The deterministic scope resolver returned no adopted or regression identifiers. Existing orchestration coverage still passed in the full suite: **471 passed**, **2 platform/fixture skips**, **0 failures**.

## Architecture Review

| Area | Score | Findings |
|---|---:|---|
| SOLID Principles | 5/5 | Controller resolution is isolated in one focused module; existing orchestration remains unchanged; consumers depend on four small exported functions. |
| Security | 5/5 | Script basenames are allowlisted, plugin roots must be absolute and identify package `nmg-sdlc`, paths are JSON-quoted, consumer cwd is never searched, and no shell-string execution was introduced. |
| Performance | 5/5 | Resolution performs bounded synchronous filesystem checks only while materializing short command/workflow prompts; no repeated search, unbounded traversal, or new dependency exists. |
| Testability | 5/5 | Filesystem and environment inputs are injectable; path logic is deterministic; copied/link/import behaviors use disposable isolated fixtures. |
| Error Handling | 4/5 | Resolver failures carry stable `reasonCode` and `exitCode`, preserve non-mutation, and now cover missing controllers at materialization. A custom Error subclass is unnecessary for this narrow internal boundary. |

**Average**: 4.8/5.0

## Test and Exercise Results

| Verification | Result | Evidence |
|---|---|---|
| Focused task command | Pass | 4 suites; 27 passed; 1 non-applicable platform skip. |
| Post-fix focused regression | Pass | 4 suites; 33 passed; 1 non-applicable platform skip. |
| Full Jest suite after fix | Pass | 41 suites passed, 1 fixture suite skipped; 471 tests passed, 2 expected skips. |
| Plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository` reported validation passed. |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check` reported 43 items mapped and clean. |
| Disposable OMP exercise | Pass | `node scripts/exercise-omp.mjs --cwd <disposable> --timeout-ms 300000 -- /sdlc-status --json` returned status JSON whose `project.root` was the disposable consumer and whose branch was `main`. |
| Installed topology proof | Pass | Copied package installed through OMP; public status and execute dispatches reached installed controllers without project-local scripts or source visibility flags. |

BDD coverage: **8/8 scenarios** have direct contract, topology, audit, or live-exercise evidence. This repository uses Jest behavioral contracts rather than executable Gherkin step definitions.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|---|---|---|
| Contract tests | Pass | Full Jest suite: 471 passed, 2 expected platform/fixture skips. |
| Skill inventory | Pass | Inventory audit clean; 43 items mapped. |
| OMP plugin surface | Pass | Repository plugin surface validation passed. |
| Skill creator validation | Pass | `skill://skill-creator` was read. Changed workflow bundles are not standalone `SKILL.md` directories, so its SKILL validator is not applicable; native inventory, surface, synchronization, and prompt tests pass. |
| Skill exercise | Pass | Updated `exercise-omp.mjs` harness reached `/sdlc-status --json` from a disposable project after the local fix. |
| Prompt quality | Pass | Public prompts use one deterministic token, preserve argv, contain no cwd-relative dispatch, and fail closed through validated runtime materialization. |

**Gate Summary**: 6/6 passed, 0 failed, 0 incomplete.

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|---|---|---|---|---|---|
| High | Error handling | `scripts/plugin-controller-path.mjs` | Runtime materialization joined controller paths without verifying the controller existed, so a corrupt installation could defer to Node's generic `MODULE_NOT_FOUND` instead of the specified resolver failure. | Resolve every matched basename through `resolvePluginController`; added a missing-controller regression test. | direct |
| High | CI portability | `scripts/__tests__/extension-commands.test.mjs` | The extension materialization test spawned Bun even though the repository and CI contract require only Node.js 20, causing the GitHub contract job to terminate the probe without a status. | Exercise the exported prompt materializers directly under Jest and retain static assertions that `src/extension.ts` wires both helpers; the focused suite passes under Node.js. | delivery |

## Remaining Issues

None.

## Positive Observations

- One package-root contract now serves commands, interactive workflows, worker prompts, and executable guards.
- Tests cover lexical copies, realpath links, consumer-cwd isolation, inert imports, and failure non-fallback.
- The implementation does not reopen controller orchestration or Herdr ownership behavior.

## Files Reviewed

All 40 issue-branch files were reviewed, with detailed focus on `scripts/plugin-controller-path.mjs`, the ten executable controllers, `src/extension.ts`, `src/sdlc-commands.mjs`, command/workflow surfaces, prompt ceilings, controller-path tests, and the synchronized `VERSION`, `package.json`, and `CHANGELOG.md` release artifacts.

## Recommendation

**Ready for PR.** Local acceptance, architecture, test, exercise, and steering gates pass. No PR-only evidence is required.
