# Verification Report: Move start and execute orchestration into controllers behind sibling workers

**Date**: 2026-08-21
**Issue**: #194
**Reviewer**: Codex
**Scope**: Implementation verification against approved spec

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | **4.5** |

### Implementation Status: Pass
**Total Issues**: 0 remaining; 2 fixed during verification

The start and execute orchestration controllers satisfy the approved issue #194 delivery contract after two local verification fixes. Controller behavior is covered by injected-adapter tests, the complete repository suite passes, the generated command and workflow surfaces remain synchronized, and a disposable-project OMP exercise reached the expected unapproved-spec stop through `/sdlc-execute`.

---

## Issue Scope

- Active issue: #194
- Spec: `specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3, FR4, FR5, FR6]; tasks [T001, T002, T003, T004, T005, T006, T007, T008]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005]
- Regression: AC [AC4, AC5, AC6, AC7, AC9 from #193]; FR [FR4, FR6, FR7, FR8, FR10 from #193]; scenarios [SCN004, SCN005, SCN006, SCN007, SCN009 from #193]

<!-- nmg-sdlc-issue-scope: {"issueNumber":194,"specPath":"specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005"]},"regression":{"acceptanceCriteria":["#193 AC4","#193 AC5","#193 AC6","#193 AC7","#193 AC9"],"functionalRequirements":["#193 FR4","#193 FR6","#193 FR7","#193 FR8","#193 FR10"],"scenarios":["#193 SCN004","#193 SCN005","#193 SCN006","#193 SCN007","#193 SCN009"]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Start controller preserves every current start outcome | Pass | `scripts/start-issue.mjs:12-151`; `scripts/__tests__/start-issue-controller.test.mjs:69-142`; focused and full Jest runs pass. The controller uses argument arrays, re-proves dependencies before branch mutation, writes stable handoffs, preserves spike-to-implement behavior, and treats Project mutation as best-effort. |
| AC2 | Execute controller preserves the current queue | Pass | `scripts/sdlc-execute.mjs:554-768`; `scripts/__tests__/sdlc-execute.test.mjs:273-543`; `/sdlc-execute #194` exercise returned `Run /sdlc-write-spec #194` from a disposable project with no approved spec. Full Jest covers preflight, queue state, resume, no-timeout stall recovery, handoff validation, and terminal delivery checks. |
| AC3 | Four sibling workers remain | Pass | `scripts/sdlc-execute.mjs:375-392,665-754`; tests assert `s42-start`, `s42-implement`, `s42-verify`, and `s42-deliver`, all with `kind: 'omp'`, plus bundled Simplify and Address PR Comments prompt content. |
| AC4 | Compact prompts preserve documented Herdr behavior | Pass | `scripts/sdlc-execute.mjs:423-444,618-754`; retained panes are no longer closed during resume, while panes created by the current run are closed after passed handoffs. Split, prompt wait, stall recovery, notification, and worker naming are covered by controller tests. |

---

## Regression Obligations

| Obligation | Status | Evidence |
|------------|--------|----------|
| #193 AC4 / FR4 / SCN004: prompt byte ceilings | Pass | Measured execute body is 784 bytes and start worker prompt is 1189 bytes; ceilings are exactly 1040 and 1445 (`+256`) in `scripts/__tests__/rendered-prompt-bytes.test.mjs:6-18`. Other ceilings remain unchanged. |
| #193 AC5 / FR6 / SCN005: file-command and extension surface | Pass | `src/extension.ts:64-66` keeps automated commands as file commands; `scripts/__tests__/extension-commands.test.mjs:47-54` verifies generated Markdown equality and absence of automated registration. |
| #193 AC6 / FR7 / SCN006: one-Enter stalled prompt recovery | Pass | `scripts/sdlc-execute.mjs:694-712`; controller test verifies one `enter`, wait for `working`, settlement, and no timeout field. |
| #193 AC7 / FR8 / SCN007: installed skill creator resolution | Pass | `skill://skill-creator` resolved and was read. No skill-bundled file was edited during verification; affected workflow bundles passed prompt-quality, inventory, repository tests, and exercise checks. |
| #193 AC9 / FR10 / SCN009: inventory accuracy | Pass | `node scripts/skill-inventory-audit.mjs --check` reported `clean (90 items mapped)`. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add startIssue module and CLI | Complete | New module exports both required functions; invalid CLI behavior now has direct regression coverage. |
| T002 | Cover start reasonCodes with injected run | Complete | All controller reason codes and non-mutating dependency failures covered. |
| T003 | Add runExecute and CLI run | Complete | Existing helper CLIs remain; execute does not import or call `startIssue`. |
| T004 | Cover execute controller and stall recovery | Complete | Four workers, preflight, exact install line, hour-safe wait shape, resume, and failure retention covered. |
| T005 | Compact start and execute workflows | Complete | Bodies match design; generated `commands/sdlc-execute.md` is synchronized. |
| T006 | Tighten start and execute prompt ceilings | Complete | Exact measured size plus 256 bytes verified. |
| T007 | Keep automated extension surface | Complete | Automated command remains file-command only; plugin surface validation passes. |
| T008 | Confirm no function dropped | Complete | Full suite and disposable exercise pass; retained-pane close regression fixed. |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Start and execute orchestration are separated into dedicated controllers. `runExecute` is necessarily large because it owns a serial state machine, but helper functions isolate parsing, Herdr adaptation, stop handling, and delivery cleanup. |
| Open/Closed | 4 | Step-to-workflow mappings and injected adapters localize expected extension points. New orchestration states still require controller edits. |
| Liskov Substitution | 5 | Injected `run`, `fs`, and `herdr` adapters are substitutable and exercised with deterministic fakes. |
| Interface Segregation | 4 | Controller dependencies are explicit and narrow enough for tests; the Herdr adapter remains a single multi-method orchestration boundary. |
| Dependency Inversion | 5 | Business orchestration depends on injected command/filesystem/Herdr contracts, with production adapters at the edge. |

**Architecture average**: 4.4 / 5 across SOLID, security, performance, testability, and error handling.

### Layer Separation

The extension factory remains outside worker orchestration. Workflow Markdown defines compact invocation contracts; scripts own deterministic execution; sibling OMP workers remain the product-edit isolation boundary. `startIssue` is not imported into the execute controller.

### Dependency Flow

Dependencies flow from compact workflow surfaces to controllers, then to injected process/filesystem/Herdr adapters. Shared handoff, spec, prompt, and run-state helpers remain authoritative rather than forked.

---

## Security Assessment

**Score: 5 / 5**

- Authentication: `gh auth status` is a fail-closed execute precondition.
- Authorization: GitHub mutations remain scoped to their owning stage; execute does not open PRs or edit product code.
- Input validation: issue arguments are bounded, positive safe integers for execute, deduplicated, and limited to 20.
- Injection prevention: external commands use command-plus-argument arrays rather than interpolated shell source.
- Data protection: no secrets are added or logged; diagnostics contain bounded operational state.
- Destructive boundary: local branch deletion occurs only after MERGED and CLOSED evidence and targets the resolved issue branch.

No security finding remains.

---

## Performance Assessment

**Score: 4 / 5**

- Queue size and spec scans are bounded.
- Serial issue and stage execution is required by the delivery contract.
- No controller-side worker deadline or unsupported `agent wait --timeout` argument shortens the authoritative Herdr wait.
- Synchronous process calls are acceptable for this CLI controller; no hot-loop or unbounded memory growth was found.
- External calls are not cancellable through the injected adapter, preventing a score of 5.

---

## Testability and Error Handling

### Testability

**Score: 5 / 5**

Both controllers expose deterministic functions with injected external dependencies. Tests cover exact reason codes, side-effect ordering, pane lifecycle, state persistence, stall recovery, invalid handoffs, command surfaces, and prompt sizes. The approved Gherkin has five scenarios; observable step behavior is implemented through Jest controller and contract tests rather than a separate Gherkin runner.

### Error Handling

**Score: 4 / 5**

Stable status codes, `reasonCode` values, intervention flags, handoff validation, exact diagnostics, notification fallback, and fail-closed mutation boundaries are present. Best-effort Project and notification failures are intentionally contained. Errors use result objects rather than a typed hierarchy, appropriate for this CLI but below a full score.

---

## Test Coverage

### BDD Scenarios

| Scenario / AC | Has Scenario | Has Executable Coverage | Passes |
|---------------|--------------|-------------------------|--------|
| SCN001 / AC1 | Yes | Yes — start controller tests | Yes |
| SCN002 / AC2 | Yes | Yes — execute controller, helper, and surface tests | Yes |
| SCN003 / AC3 | Yes | Yes — four-worker and prompt-composition tests | Yes |
| SCN004 / AC4 | Yes | Yes — Herdr adapter, stall, notification, and pane lifecycle tests | Yes |
| SCN005 / AC1-AC2 failure paths | Yes | Yes — CLI and preflight tests | Yes |

### Coverage Summary

- Feature files: 1 feature, 5 scenarios
- Step definitions: Implemented as deterministic Jest behavior tests; no separate Cucumber step runner
- Full test execution: Pass — 35 suites passed, 326 tests passed; 1 suite/test intentionally skipped unless `RUN_EXERCISE_TESTS=1`
- Focused post-fix execution: Pass — 2 suites, 41 tests
- Unexpected skips: None

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `execute` through `/sdlc-execute #194` |
| **Test Project** | Disposable `/tmp/nmg-sdlc-exercise-194.*` project; removed after capture |
| **Exercise Method** | `node scripts/exercise-omp.mjs --cwd <project> --timeout-ms 300000 -- /sdlc-execute '#194'` |
| **Interactive gate handling** | N/A — automated file command |
| **Duration** | 24.01 seconds |

### Captured Output Summary

The OMP harness loaded this extension, expanded `/sdlc-execute`, invoked the controller, inspected the disposable project, and printed exactly:

```text
Run /sdlc-write-spec #194
```

The disposable project intentionally had no approved issue #194 spec. This proves the updated file-command surface reaches the controller and preserves the required unapproved-spec stop without GitHub mutation.

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC2 | Execute command expansion and unapproved-spec stop | Pass for exercised slice | Harness output matched `Run /sdlc-write-spec #194`. Remaining AC2 queue behavior is proven by controller tests. |
| AC3 | Four-worker pipeline | Not reached | Deliberately blocked by absent approved spec; covered by deterministic fake-Herdr tests. |
| AC4 | Herdr launch behavior | Not reached | Deliberately blocked before worker split; covered by deterministic fake-Herdr tests. |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `cd scripts && npm test -- --runInBand`: 35 suites and 326 tests passed; only the documented opt-in exercise suite/test skipped. |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: `clean (90 items mapped)`. |
| OMP plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository`: validation passed. |
| Skill creator validation | Pass | Installed `skill://skill-creator` resolved and was read. Its validator targets `SKILL.md`, while these are repository `WORKFLOW.md` bundles; applicable bundle contracts passed inventory, prompt-quality, generated-surface, tests, and exercise validation. |
| Skill exercise | Pass | Disposable-project `/sdlc-execute #194` exercise completed in 24.01 seconds with the exact expected unapproved-spec stop. |
| Prompt quality | Pass | Compact workflows are decision-complete, preserve failure paths, use existing files, never ask, and maintain downstream handoff contracts. |
| Git hygiene | Pass | `git diff --check main...HEAD` exited 0 with no output after fixes. |

**Gate Summary**: 7/7 gates passed, 0 failed, 0 incomplete

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| High | Architecture / Safety | `scripts/sdlc-execute.mjs:632-659` | Resume closed a retained worker pane that was not created by the current run, violating AC4's pane-ownership boundary. | Removed retained-pane closure; a passed repaired handoff advances state while leaving the pre-existing pane untouched. Updated the controller test to assert only newly created panes close. | `direct` |
| Medium | Testing | `scripts/__tests__/start-issue-controller.test.mjs:74-88` | The observable invalid CLI contract (`exit 2`, exact usage/JSON, no handoff) lacked direct behavioral coverage. | Added a subprocess test for missing `--issue`, including filesystem non-mutation. | `direct` |

---

## Remaining Issues

None.

---

## Positive Observations

- Controller dependencies are injected without adding runtime packages.
- Stable handoff and run-state schemas are reused.
- Failed/intervention workers remain observable and recoverable.
- Prompt-byte reductions preserve implement and deliver extras.
- The execute controller maintains the main-pane non-mutation boundary.

---

## Recommendations Summary

### Before PR (Must)

- [x] No remaining verification blockers.

### Short Term (Should)

- [x] Keep controller contract tests and exact prompt-size ceilings in CI.

### Long Term (Could)

- [ ] None required for issue #194.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/start-issue.mjs` | 0 remaining | Start controller, CLI, reason codes, dependency proof, branch and Project behavior. |
| `scripts/sdlc-execute.mjs` | 0 remaining | Execute state machine, Herdr adapter, resume, pane ownership, delivery completion. |
| `scripts/__tests__/start-issue-controller.test.mjs` | 0 remaining | Reason-code, branch, spike, Project, and invalid CLI coverage. |
| `scripts/__tests__/sdlc-execute.test.mjs` | 0 remaining | Queue, preflight, four-worker, stall, failure, resume, and spec-stop coverage. |
| `scripts/__tests__/start-issue-selection-contract.test.mjs` | 0 | Compact workflow contract. |
| `scripts/__tests__/rendered-prompt-bytes.test.mjs` | 0 | Exact measured ceilings and extra workflow preservation. |
| `workflows/start-issue/WORKFLOW.md` | 0 | Compact invocation matches approved design. |
| `workflows/execute/WORKFLOW.md` | 0 | Compact invocation and main-pane boundary match approved design. |
| `commands/sdlc-execute.md` | 0 | Generated file-command surface synchronized. |
| `scripts/skill-inventory.baseline.json` | 0 | Inventory gate passes. |
| `src/extension.ts` | 0 | Automated commands remain unregistered file commands. |

---

## Recommendation

**Ready for PR**

All delivery and applicable regression obligations pass locally. No PR-only evidence is required, all steering gates pass, and no verification finding remains open.
