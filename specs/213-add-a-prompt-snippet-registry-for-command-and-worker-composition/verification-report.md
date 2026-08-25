# Verification Report: Prompt-snippet registry for command and worker composition

**Date**: 2026-08-24
**Issue**: #213
**Reviewer**: Codex
**Scope**: Implementation verification against the approved specification

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 4 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **4.7** |

### Implementation Status: Fail

**Total Issues**: 1 release-blocking verification gap. Registry, provenance, fail-closed composition, native-plan input rewriting, byte ceilings, full Jest, plugin-surface, and git-hygiene checks pass. The authoritative live convergence gate remains incomplete because the three manual TUI attempts combined `--no-extensions` with no explicit `--extension <repo>/src/extension.ts`; they exercised plugin resources without loading the extension factory. No two distinct issues, specs, execute queue, or delivery PRs were produced. This report does not infer live lifecycle success from the corrected native-plan reproduction, Jest, or fixtures.

## Issue Scope

- Active issue: #213
- Spec: `specs/213-add-a-prompt-snippet-registry-for-command-and-worker-composition`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3, FR4, FR5, FR6]; tasks [T001, T002, T003, T004, T005, T006, T007]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: AC [AC5]; FR [FR7, FR8]; scenarios [SCN005]

<!-- nmg-sdlc-issue-scope: {"issueNumber":213,"specPath":"specs/213-add-a-prompt-snippet-registry-for-command-and-worker-composition","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004","T005","T006","T007"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":["AC5"],"functionalRequirements":["FR7","FR8"],"scenarios":["SCN005"]}} -->

## Delivery Validation

- Local verification: Not complete
- PR evidence: Not required; the blocker is live pre-PR lifecycle behavior, not an allowlisted PR-only check

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Existing interactive, automated, and worker surfaces render through named registry fragments without observable prompt loss | Pass | Registry wiring is present in `src/sdlc-commands.mjs:62-85,128-132`, `src/extension.ts:44-74`, and `scripts/sdlc-execute.mjs:379-394`; byte/content tests pass. A corrected TUI diagnostic explicitly loaded `src/extension.ts`, observed the input rewrite from `/sdlc-draft-issue ...` to `/plan\n\n# Draft Issue...`, and recorded the resulting `mode_change: plan` plus `plan-mode-context`. |
| AC2 | Fragments compose in stable order with machine-readable provenance | Pass | `src/sdlc-prompt-snippets.mjs:132-169` sorts by order/id and records provider, source, hash, byte count, slot, and order; `scripts/__tests__/sdlc-prompt-snippets.test.mjs:106-125` passed. Provenance writers are wired at `src/sdlc-commands.mjs:80-83` and `scripts/sdlc-execute.mjs:392`. |
| AC3 | Invalid composition fails closed with named errors and no partial success | Pass | Shape, root, provider, consumer, slot, source, placeholder, byte, and duplicate checks are implemented in `src/sdlc-prompt-snippets.mjs:76-148`; named-error coverage passed at `scripts/__tests__/sdlc-prompt-snippets.test.mjs:127-176`. |
| AC4 | Project fragments remain inactive and built-in byte ceilings remain enforced | Pass | The frozen 16-entry plugin catalog uses only `workflows/` and `builtin:` sources at `src/sdlc-prompt-snippets.mjs:194-240`; catalog and ceiling tests passed. |
| AC5 | Every composer is cut over and existing behavior survives full tests and smoke | Fail | Production search found `workflowBody(` only in `src/sdlc-workflows.mjs` and the registry loader; full Jest passed. The required two-issue live draft→write-spec→execute smoke did not complete and produced no issue/PR identifiers. |

## Regression Obligations

- [x] FR7: `workflowBody` remains the file-reader adapter and production composition callsites no longer concatenate it directly.
- [x] Existing automated command Markdown and worker headings/byte ceilings remain covered by passing tests.
- [x] `/sdlc-status` supplemental `exercise-omp` invocation exited 0.
- [x] Headless `/sdlc-write-spec` printed `Run /sdlc-write-spec in the TUI.` before its bounded harness timeout.
- [ ] AC5 / FR8 / SCN005: full live two-issue lifecycle did not complete; local unit/fixture evidence cannot substitute for it.

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add prompt-snippet registry module | Complete | Required exports, exact error strings, and workflow-root boundary are present. |
| T002 | Ship built-in plugin catalog | Complete | Exactly 16 entries; frozen records; measured bounds and exact worker header are covered. |
| T003 | Compose interactive and automated commands through registry | Complete | Static wiring/tests pass, and the corrected explicit-extension TUI diagnostic entered native plan mode with the rendered registry prompt. |
| T004 | Compose worker prompts through registry | Complete | All production callsites pass `cwd`; provenance is written; arbitrary skill substitution is rejected. |
| T005 | Cover registry contracts | Complete | Consumer synchronization, catalog, order, provenance, errors, and sidecar behavior are covered. |
| T006 | Keep existing composition tests green | Complete | Full suite passed with unchanged prompt ceilings. |
| T007 | Run full suite and no-loss smoke | Incomplete | Jest, plugin surface, and supplemental command exercises ran; mandatory live two-issue lifecycle failed before issue creation. |

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Registry validation/render/provenance is isolated in one module; command and execute callers remain orchestration layers. |
| Open/Closed | 5 | Named catalog records add consumers/fragments without adding composition branches. |
| Liskov Substitution | 5 | Registry records and renderer return stable data contracts; tests use disposable registries and roots. |
| Interface Segregation | 5 | Callers import only registry creation, render, and provenance operations they use. |
| Dependency Inversion | 5 | Consumers depend on the registry API rather than workflow file concatenation. |

Layer separation is sound: `sdlc-workflows.mjs` remains the file adapter; `sdlc-prompt-snippets.mjs` owns composition; command and execute modules own delivery to their surfaces. No reverse imports or command/execute cycles were introduced.

## Security Assessment

**Score: 5/5.** Fragment records fail closed; only provider `plugin` is accepted; absolute and out-of-root paths are rejected before reading; real paths are checked against the canonical workflows root to prevent symlink escape; placeholders expand only named registry-supplied scalars; no shell evaluation is introduced. Authentication and web authorization are not applicable to this local prompt-composition module.

## Performance Assessment

**Score: 4/5.** Work is bounded and byte limits are checked before and after substitution. Hashing and catalog traversal are linear in rendered prompt size. `defaultPromptRegistry()` reloads all file-backed fragments synchronously for each render rather than caching an immutable built-in registry; this matches the approved design and is acceptable for bounded CLI/TUI dispatch, but it is avoidable startup I/O if render frequency grows.

## Testability Assessment

**Score: 5/5.** Registry creation and rendering are deterministic except the explicitly asserted timestamp; temporary roots exercise file and provenance boundaries; error codes are directly observable; command/worker consumer lists are synchronized by tests; full suite coverage includes compatibility surfaces and byte ceilings.

## Error Handling Assessment

**Score: 5/5.** Registration validates before mutating `byId`; render throws before returning partial text; provenance write failures collapse to the stable `provenance_write_failed` code; execute converts prompt failures into worker-safe reason codes. Named failure coverage passed.

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Scenario | Executable Coverage | Passes |
|---------------------|----------|---------------------|--------|
| AC1 | SCN001 | Jest plus corrected explicit-extension TUI diagnostic | Yes |
| AC2 | SCN002 | Jest | Yes |
| AC3 | SCN003 | Jest | Yes |
| AC4 | SCN004 | Jest and byte ceilings | Yes |
| AC5 | SCN005 | Full Jest plus required live lifecycle | No |

### Execution Results

- Full Jest suite after remediation: **Pass** — 43 suites passed, 1 skipped; 513 tests passed, 2 skipped; exit 0.
- OMP plugin surface: **Pass** — `Plugin surface validation passed: repository`; exit 0.
- Production composition search: **Pass** — no direct `workflowBody(` composition outside adapter/registry; no `selection.md` read outside registry in production.
- Git hygiene: **Pass** — `git diff --check main...HEAD` exited 0 with no output.
- Unexpected issue-scoped skips: none observed.

## Exercise Test Results

| Field | Value |
|-------|-------|
| Skill Exercised | `/sdlc-draft-issue`, `/sdlc-status`, `/sdlc-write-spec` |
| Test Project | Disposable clone of `Nunley-Media-Group/nmg-sdlc-smoke-20260820001416`; removed after capture |
| Exercise Method | Failed manual TUI attempts used branch `--plugin-dir`/`--add-dir` without the required explicit `--extension`; corrected diagnostic loaded `src/extension.ts` explicitly; supplemental commands used `exercise-omp.mjs` |
| Interactive gate handling | Corrected diagnostic proved native plan activation; the required two-issue mutation lifecycle was not rerun |
| Live lifecycle verdict | Fail: convergence evidence absent, not a product native-plan failure |

### Captured Output Summary

The saved transcripts prove attempts 1 and 2 persisted the literal `/sdlc-draft-issue ...` input with no `mode_change`; `--no-extensions` disabled discovery and the commands omitted explicit `--extension /Volumes/Fast Brick/source/repos/nmg-sdlc/src/extension.ts`. Plugin resources remained visible through `--plugin-dir`/`--add-dir`, causing the model to follow the workflow manually and creating a false appearance that the extension was loaded. A corrected ordered diagnostic explicitly loaded the branch extension: its post-transform trace contained `/plan\n\n# Draft Issue...`, and the session recorded `mode_change: plan` plus `plan-mode-context`. No issue, branch, spec PR, execute run, or delivery PR was created in the original smoke. Full durable evidence and cleanup are in `specs/213-add-a-prompt-snippet-registry-for-command-and-worker-composition/live-smoke-evidence.md`.

Supplemental `/sdlc-status` exited 0 with no captured output. Headless `/sdlc-write-spec` printed the expected TUI-only diagnostic but timed out at 300 seconds waiting for `agent_end`; this is diagnostic evidence only.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | Focused native-plan/harness suites: 14/14 passed. Full suite: 513 passed, 2 skipped; exit 0. |
| Skill inventory | Not applicable | No workflow, shared reference, or agent file changed in `main...HEAD`. |
| OMP plugin surface | Pass | Repository validator exited 0. |
| Skill creator validation | Not applicable | No skill-bundled implementation file was edited during verification. |
| Skill exercise | Fail | Corrected TUI diagnostic proves native-plan rewriting, but the authoritative two-issue draft→write-spec→execute lifecycle was not performed. |
| Prompt quality | Pass | Existing workflow text remains source-owned; composition metadata and substitution are bounded and explicit. |
| Git hygiene | Pass | `git diff --check main...HEAD` exited 0. |

**Gate Summary**: 4/5 applicable gates passed, 1 failed; 2 gates not applicable.

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| High | Verification infrastructure | `scripts/exercise-omp.mjs`, `scripts/__tests__/sdlc-commands.test.mjs` | The failed manual TUI launch omitted explicit `--extension` while passing `--no-extensions`, and no focused test exposed the required launch invariant. | Centralized the harness argv in `exerciseOmpArgs()` and added an exact regression assertion that source extension loading remains explicit between `--no-extensions` and plugin resources. | direct |

## Remaining Issues

| Severity | Category | Location | Issue | Impact | Reason Not Fixed |
|----------|----------|----------|-------|--------|------------------|
| Critical | Verification evidence | `specs/213-add-a-prompt-snippet-registry-for-command-and-worker-composition/live-smoke-evidence.md` | The required live two-issue lifecycle was not performed with the extension factory loaded. | Required two-issue draft→write-spec→execute evidence and issue/PR identifiers remain absent, so AC5 and the authoritative completion gate are unmet. | Requires a complete clean verification rerun; the native-plan source path itself is proven functional. |

## Positive Observations

- Composition ownership is centralized without adding dependencies or changing workflow source text.
- Provenance includes stable fragment identity and content hashes.
- Registration and rendering fail before partial success.
- Full compatibility and byte-ceiling suites pass.
- Smoke attempts failed closed and left the remote repository unchanged.

## Files Reviewed

| File group | Issues | Notes |
|------------|--------|-------|
| `src/sdlc-prompt-snippets.mjs` | 0 | Focused registry, root boundary, provenance, and named errors. |
| `src/sdlc-commands.mjs`, `src/extension.ts` | 0 | Corrected explicit-extension TUI diagnostic proves the input rewrite enters native plan mode. |
| `scripts/sdlc-execute.mjs` | 0 | Worker render/provenance callsites follow approved design. |
| Changed Jest suites | 0 | Full suite green; registry coverage is comprehensive. |
| Live smoke repository | 1 remaining | No new GitHub identifiers; disposable clone clean and removed. |

## Recommendation

**Needs verification rerun.** No native-plan source change is required. Rerun with explicit `--extension <repo>/src/extension.ts` and preserve two distinct issue IDs, their spec publication outcomes, one execute run processing both, both resulting PR IDs, merged/closed terminal state, and cleanup evidence. Do not proceed to `/sdlc-open-pr #213` on the existing failed handoff.
