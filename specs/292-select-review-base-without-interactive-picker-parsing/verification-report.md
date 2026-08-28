# Verification Report: Select review base without interactive picker parsing

**Date**: 2026-08-28
**Issue**: #292
**Reviewer**: Codex
**Scope**: Implementation verification against the approved specification

---

## Executive Summary

The implementation satisfies the reviewed acceptance contract and the verification remediation. Exact local-or-origin default-ref resolution replaces terminal picker parsing, one controller-owned prompt performs review plus finalization, and artifact-backed handoffs control completion. The linked-install blocker was reproduced as direct URL/path entry guards comparing the symlinked `process.argv[1]` with the real `import.meta.url`; all 12 equivalent supported script guards, including the initially missed `verify-current-specs.mjs`, now use the shared canonical-real-path `isCliEntry` helper. Behavioral coverage executes the steering and current-spec CLIs through an actual temporary plugin symlink, proves stdout and artifact creation, and proves imports remain inert.

The mandatory verifier was rerun through `/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/sdlc-verify-steering.mjs`. It produced stdout, wrote `.omp/sdlc/verification/292.json`, recorded complete 2/2 coverage, passed both required providers, and imposed no ceiling. Focused tests, current-spec validation, and the full repository suite pass. Overall status is **Pass**.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **4.7** |

### Implementation Status: Pass

**Total implementation findings**: 1 resolved
**Verification blockers**: 0

---

## Deterministic Steering Artifact and Ceiling

Original command executed twice:

```text
node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/sdlc-verify-steering.mjs" --project . --issue 292 --spec specs/292-select-review-base-without-interactive-picker-parsing --base main --controller-run-id d379f511-611c-4962-84a9-4cccb2ff8ee5
```

Both original executions returned without output and did not create `.omp/sdlc/verification/292.json`. Root cause: the installed package path is a symbolic link, so the direct `import.meta.url` equality guard classified the real invocation as an import and skipped `main()`.

After remediation, the same linked-path command exited 0 with `ok: true`, `ceiling: null`, issue 292, and complete coverage: 2 declared, 2 recorded, no missing, duplicate, or unknown results. It wrote `.omp/sdlc/verification/292.json`; `repository.tests` and `repository.nmg-sdlc-smoke` both recorded `effectiveStatus: passed`.

## Issue Scope

- Active issue: #292
- Spec: `specs/292-select-review-base-without-interactive-picker-parsing`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9]; FR [FR1, FR2, FR3, FR4, FR5, FR6]; tasks [T001, T002, T003, T004, T005, T006]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008, SCN009, SCN010]
- Regression: issue #291 AC [AC2, AC3]; FR [FR3, FR4]; scenarios [SCN002, SCN003]

<!-- nmg-sdlc-issue-scope: {"issueNumber":292,"specPath":"specs/292-select-review-base-without-interactive-picker-parsing","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004","T005","T006"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010"]},"regression":{"acceptanceCriteria":["AC2","AC3"],"functionalRequirements":["FR3","FR4"],"scenarios":["SCN002","SCN003"]}} -->

## Delivery Validation

- Local verification: Complete; deterministic steering coverage is 2/2 with no ceiling
- PR evidence: Not required

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Remote-only default branch reviews noninteractively | Pass | `scripts/sdlc-execute.mjs:959-970`, `scripts/__tests__/sdlc-execute.test.mjs:2408-2438` |
| AC2 | Local default branch behavior is preserved | Pass | `scripts/sdlc-execute.mjs:962-970`, `scripts/__tests__/sdlc-execute.test.mjs:2440-2459` |
| AC3 | Missing default ref fails closed | Pass | `scripts/sdlc-execute.mjs:2140-2147`, `scripts/__tests__/sdlc-execute.test.mjs:2514-2533` |
| AC4 | Successful review prompt still requires its handoff | Pass | `scripts/sdlc-execute.mjs:1000-1026`, `scripts/__tests__/sdlc-execute.test.mjs:2461-2481` |
| AC5 | Exact pasted prompt recovery sends one Enter | Pass | `scripts/sdlc-execute.mjs:1010-1017`, `scripts/__tests__/sdlc-execute.test.mjs:2483-2512` |
| AC6 | Direct non-stall review failure fails closed | Pass | `scripts/sdlc-execute.mjs:1000-1003`, `scripts/__tests__/sdlc-execute.test.mjs:2535-2577` |
| AC7 | Skipped state detection cannot end an active review | Pass | `scripts/sdlc-execute.mjs:402-415`, `scripts/__tests__/sdlc-execute.test.mjs:2579-2609` |
| AC8 | One prompt finalizes artifact-backed review evidence | Pass | `scripts/sdlc-execute.mjs:973-1026`, `scripts/__tests__/sdlc-execute.test.mjs:2611-2701`, `workflows/review-main/WORKFLOW.md:7-15` |
| AC9 | Linked plugin steering CLIs execute while imports remain inert | Pass | `scripts/plugin-controller-path.mjs:26-38`, guarded `scripts/*.mjs` CLIs, `scripts/__tests__/sdlc-verification-runtime.test.mjs` linked-path regression |

## Regression Obligations

| Contract | Status | Evidence |
|----------|--------|----------|
| #291 AC2 / FR3 / SCN002: retained workers require exact ownership | Pass | Review paths retain `matchingWorkerOwnership` checks; retained review coverage appears at `scripts/__tests__/sdlc-execute.test.mjs:3044-3115` |
| #291 AC3 / FR4 / SCN003: owned panes close on terminal outcomes | Pass | Successful and failed review cases assert owned-pane closure at `scripts/__tests__/sdlc-execute.test.mjs:2461-2481`, `2643-2663`, and `2665-2701` |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Resolve and start reviews without picker parsing | Complete | Exact ref checks and one review protocol prompt implemented; README and workflow updated |
| T002 | Replace picker tests with deterministic ref coverage | Complete | SCN001-SCN003 cover remote-only, local, narrow-name, and missing-ref behavior |
| T003 | Verify review lifecycle and prompt contracts | Complete | Full Jest suite, current-spec validation, plugin surface, skill inventory, and diff hygiene passed |
| T004 | Wait for handoff after direct review submission | Complete | Submission status is not treated as completion; stall-only recovery and hard failure paths covered |
| T005 | Make review completion handoff-driven in one sibling prompt | Complete | Canonical non-empty artifact and validated handoff are required; process loss fails closed |
| T006 | Make supported CLI entry guards symlink-safe | Complete | All equivalent raw script entry comparisons use `isCliEntry`; linked steering CLIs and inert imports are behaviorally covered |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | `resolveReviewBase`, `reviewProtocolPrompt`, `submitReviewProtocol`, and `observeReviewHandoff` separate resolution, composition, submission, and observation |
| Open/Closed | 4 | Existing run, Herdr, and handoff adapters are reused without a second review-specific subsystem |
| Liskov Substitution | 5 | No subtype contract changed |
| Interface Segregation | 4 | Helpers receive only the Herdr, identity, prompt, and artifact inputs they use |
| Dependency Inversion | 5 | Git and Herdr behavior remains injectable through `run` and the Herdr adapter in tests |

**SOLID score**: 4.4/5

### Layer Separation

Review lifecycle policy remains in `scripts/sdlc-execute.mjs`; the workflow bundle defines sibling-worker behavior; README documents the public surface. The controller does not route the host review through generic task agents or the main pane.

### Dependency Flow

Repository/GitHub evidence resolves the base before prompt construction. Prompt settlement feeds canonical handoff validation, and only then may lifecycle state advance. Terminal rendering no longer feeds repository selection.

## Security Assessment

**Score**: 5/5

- Exact Git refs are checked with explicit `git show-ref --verify --quiet` argument arrays.
- No branch names are evaluated as shell source.
- Missing GitHub or Git evidence fails closed without guessing.
- Review evidence must use the canonical path and be non-empty.
- Pane ownership remains exact by worker name and pane id.

## Performance Assessment

**Score**: 4/5

- Ref resolution performs at most two bounded `git show-ref` calls after one default-branch lookup.
- Picker parsing and key-navigation loops were removed.
- Handoff observation performs bounded work per iteration and remains tied to exact worker presence; it intentionally has no arbitrary wall-clock deadline.
- No avoidable branch-list allocation remains in the review path.

## Testability Assessment

**Score**: 5/5

- Git, Herdr, prompt status, worker presence, and artifact creation are injected fixture behavior.
- Each approved Gherkin scenario maps to a named Jest regression.
- Local/remote resolution, success, stall recovery, skipped detection, findings, invalid evidence, direct failure, and process loss are independently observable.

## Error Handling Assessment

**Score**: 5/5

- Missing refs and non-stall prompt failures produce `review_failed`.
- Invalid or empty artifact evidence produces `invalid_handoff`.
- Confirmed owned-worker disappearance produces `process_lost`.
- Only `agent_prompt_stalled` enters pasted-prompt recovery.
- No idle/working detection is authoritative for review completion.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Jest Case | Passes |
|---------------------|-------------|---------------|--------|
| AC1 / SCN001 | Yes | Yes | Yes |
| AC2 / SCN002 | Yes | Yes | Yes |
| AC3 / SCN003 | Yes | Yes | Yes |
| AC4 / SCN004 | Yes | Yes | Yes |
| AC5 / SCN005 | Yes | Yes | Yes |
| AC6 / SCN006 | Yes | Yes | Yes |
| AC7 / SCN007 | Yes | Yes | Yes |
| AC8 / SCN008-SCN009 | Yes | Yes | Yes |

### Coverage Summary

- Feature files: 1 active feature with 10 scenarios
- Step definitions: Jest behavior cases mapped by scenario id
- Focused execution: 3 suites passed; 196 tests passed; exit 0
- Full test execution: 49 suites passed, 1 opt-in exercise suite skipped; 687 tests passed, 2 platform/opt-in tests skipped; exit 0 in the deterministic steering artifact
- Expected full-suite skips: opt-in exercise suite requires `RUN_EXERCISE_TESTS=1`; the Windows junction case is skipped on Darwin

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `/sdlc-execute 292` |
| **Test Project** | `/tmp/nmg-sdlc-292-exercise.dHn4Hb` (removed after capture) |
| **Exercise Method** | `node "/Volumes/Fast Brick/source/repos/nmg-sdlc/scripts/exercise-omp.mjs" --cwd /tmp/nmg-sdlc-292-exercise.dHn4Hb -- /sdlc-execute 292` |
| **Interactive gate handling** | N/A (automated command) |
| **Duration** | 13.74 seconds |

### Captured Output Summary

The OMP harness loaded and invoked `/sdlc-execute`. Execution stopped before review with `Unable to read labels for #292` and controller exit code 1 because the disposable repository has no corresponding authenticated GitHub issue. No remote mutation occurred. This proves command-surface loading but does not provide live review-phase evidence.

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC1-AC8 | Review protocol behavior | Incomplete | Disposable exercise could not pass the issue-label precondition; deterministic Jest fixtures provide the local behavioral evidence above |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Mandatory linked-path runner | Pass | Exit 0; stdout reports `ok: true`, `ceiling: null`, and complete 2/2 coverage; `.omp/sdlc/verification/292.json` created |
| `repository.tests` | Pass | Mandatory artifact records `effectiveStatus: passed`; focused execution passed 3 suites and 196 tests; deterministic full execution passed 49 suites and 687 tests |
| `repository.nmg-sdlc-smoke` | Pass | Mandatory artifact records `effectiveStatus: passed` with summary `nmg-sdlc-smoke status next /sdlc-draft-issue` |
| Current specs | Pass | `node scripts/verify-current-specs.mjs`: 54 genuine issue specs verified |
| Diff hygiene | Pass | `git diff --check` exited 0 with no output after the contribution-evidence edits |
| Plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository` exited 0 |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: 43 items mapped |
| Workflow bundle validation | Not applicable | `skill://skill-creator` was resolved and read; its validator requires a `SKILL.md`, while `workflows/review-main` is an OMP `WORKFLOW.md` bundle. Plugin-surface and prompt-synchronization tests pass. |

**Gate Summary**: 7 passed, 0 failed, 0 incomplete, 1 not applicable

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| High | Verification | `scripts/sdlc-verify-steering.mjs`, `scripts/sdlc-steering.mjs` | Linked installed path differed from the real module path, so direct URL equality silently skipped both CLIs | Reused canonical-real-path `isCliEntry`; added actual-symlink execution and inert-import coverage | Fixed locally |
| Medium | Reliability | Equivalent guarded `scripts/*.mjs` CLIs, including `verify-current-specs.mjs` | Raw lexical entry comparisons had the same linked-install no-op | Audited and migrated all 12 equivalent supported script guards to the shared helper | Fixed locally |

### Contribution Changed-Path Evidence

| Path | Verified behavior | Executed evidence |
|------|-------------------|-------------------|
| `VERSION` | Delivery artifact advances the canonical release version from `3.18.5` to `3.18.6`. | `git diff main -- VERSION package.json` showed the exact one-line version transition. |
| `package.json` | Delivery artifact keeps the published package version synchronized at `3.18.6`. | The same diff showed only the manifest version transition and exact agreement with `VERSION`. |
| `scripts/epic-lifecycle-repair.mjs` | Its standalone lifecycle-repair entrypoint now uses shared canonical-real-path `isCliEntry`, so invocation through a plugin symlink executes and import remains inert. | Linked-path `node …/scripts/epic-lifecycle-repair.mjs --help` exited 0 and printed the `--evidence <snapshot.json> --json` usage. |
| `scripts/epic-spec-authority.mjs` | Its epic authority entrypoint uses the symlink-safe guard without changing exported inspection behavior. | Linked-path `node …/scripts/epic-spec-authority.mjs --help` exited 0 and printed epic, child, and all modes. |
| `scripts/issue-spec-scope.mjs` | Its issue-scope entrypoint uses the symlink-safe guard and remains inert when imported. | Linked-path `node …/scripts/issue-spec-scope.mjs --help` exited 0 and printed the project/spec/issue contract. |
| `scripts/pr-delivery-state.mjs` | Its delivery-state entrypoint uses the symlink-safe guard while preserving evidence classification exports. | Linked-path `node …/scripts/pr-delivery-state.mjs --help` exited 0 and printed the evidence, issue, and optional expected-head contract. |
| `scripts/skill-exercise-runner.mjs` | Its asynchronous runner entrypoint uses the symlink-safe guard and still exits with the resolved runner status. | Linked-path `node …/scripts/skill-exercise-runner.mjs --help` exited 0 and printed the skill, base, artifact, and help options. |
| `scripts/umbrella-publication-status.mjs` | Its publication-status entrypoint uses the symlink-safe guard for standalone and aggregate-child publication modes. | Linked-path `node …/scripts/umbrella-publication-status.mjs --help` exited 0 and printed both modes. |
| `scripts/umbrella-spec-status.mjs` | Its umbrella-spec entrypoint uses the symlink-safe guard for parent, publication, aggregate-child, and all-spec audit modes. | Linked-path `node …/scripts/umbrella-spec-status.mjs --help` exited 0 and printed all four modes. |

All seven linked-path commands used `/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc`, which resolves to the current checkout, and completed in one `&&`-chained audit with exit 0. The existing actual-symlink regression additionally executes steering and current-spec behavior and proves linked imports remain inert.

## Non-Blocking Limitations

| Severity | Category | Location | Limitation | Impact |
|----------|----------|----------|------------|--------|
| Medium | Exercise | Disposable OMP project | Live command exercise could not reach review because issue #292 labels were unreadable outside the GitHub-backed repository | Does not block the deterministic contract: authenticated steering smoke and all local behavioral fixtures pass |

## Positive Observations

- The implementation deletes the presentation parser instead of adding width-aware parsing.
- Exact ref checks prefer local state and accept the required remote-only clone shape.
- One prompt now owns review and evidence finalization, eliminating the second-transition race.
- Passed handoffs require durable, canonical, non-empty review output.
- Regression cases directly encode all ten approved scenarios.

## Recommendations Summary

### Short Term (Should)

- Exercise the review phase in its authenticated Herdr/GitHub environment if live lifecycle evidence is required beyond deterministic controller fixtures.

### Long Term (Could)

- Provide a workflow-bundle-aware validator for `WORKFLOW.md` packages, or document plugin-surface validation as the canonical replacement for generic `SKILL.md` validation.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-execute.mjs` | 0 | Exact ref resolution, one-prompt protocol, handoff observation, remediation and retained paths |
| `scripts/__tests__/sdlc-execute.test.mjs` | 0 | Approved scenario and lifecycle regression coverage |
| `scripts/__tests__/sdlc-prompt-snippets.test.mjs` | 0 | Workflow prompt synchronization covered by passing suite |
| `workflows/review-main/WORKFLOW.md` | 0 | One sibling prompt performs host review and finalization |
| `README.md` | 0 | Public lifecycle wording updated |
| `scripts/plugin-controller-path.mjs` | 0 | Existing canonical-real-path entry helper reused without changing import semantics |
| Guarded `scripts/*.mjs` CLIs | 0 | Equivalent direct URL and lexical entry comparisons removed |
| `scripts/__tests__/sdlc-verification-runtime.test.mjs` | 0 | Actual linked-path invocation proves steering stdout, verifier artifact, and inert imports |
| `scripts/verify-current-specs.mjs` | 0 | Linked invocation now uses canonical-real-path entry detection and is covered by the actual-symlink regression |

## Recommendation

**Pass**

The reviewed implementation and verification remediation satisfy issue #292. The mandatory linked-path runner now produces complete, passing deterministic evidence with no ceiling.
