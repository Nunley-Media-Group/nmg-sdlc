# Verification Report: Bare write-spec missing-spec picker

**Date**: 2026-08-23
**Issue**: #238
**Reviewer**: Codex
**Scope**: Implementation verification against the approved issue specification

---

## Executive Summary

The implementation satisfies the approved delivery and regression contracts. The new helper validates the complete GitHub response, filters the exact case-sensitive `spec-created` label, sorts and deduplicates results, and fails closed. The interactive workflow routes bare invocations through a single bounded picker while preserving explicit invocation and the distinct post-publication loop. Focused tests, the full Jest suite, plugin-surface checks, inventory checks, helper smoke testing, and a disposable-project TUI exercise passed.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 5 |
| Testability | 4 |
| Error Handling | 5 |
| **Overall** | **4.7** |

### Implementation Status: Pass
**Total Issues**: 0

---

## Issue Scope

- Active issue: #238
- Spec: `specs/238-present-issues-missing-spec-created-on-bare-write-spec`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC3, AC4]; FR [FR1, FR2, FR3, FR4, FR5]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN004, SCN005, SCN006]
- Regression: AC [AC2]; FR [FR6]; scenarios [SCN003, SCN007]

<!-- nmg-sdlc-issue-scope: {"issueNumber":238,"specPath":"specs/238-present-issues-missing-spec-created-on-bare-write-spec","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN004","SCN005","SCN006"]},"regression":{"acceptanceCriteria":["AC2"],"functionalRequirements":["FR6"],"scenarios":["SCN003","SCN007"]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Bare invocation immediately presents at most three lowest-numbered missing-label issues, recommended first, plus the exact Finished option; listed and Other selections enter the existing initial path. | Pass | `workflows/write-spec/WORKFLOW.md:24-39`; disposable TUI displayed `#2 — Two` (Recommended), `#4 — Four`, `#7 — Seven`, and `Finished — stop without writing a spec`, excluding fixture issue #9. |
| AC2 | Explicit numeric and invalid non-empty behavior remain unchanged; post-publication candidates and Finished wording remain distinct. | Pass | `workflows/write-spec/WORKFLOW.md:18-22,147-180`; `scripts/__tests__/interactive-plan-contract.test.mjs:130-169`; explicit TUI smoke reached `discover --issue 42` and returned fixture `issue_unreadable` without showing the bare picker. |
| AC3 | Empty missing-label results print the exact message and stop without asking. | Pass | `workflows/write-spec/WORKFLOW.md:32-35`; helper live smoke returned `{"ok":true,"issues":[]}`; first disposable RPC/TUI exercise rendered `No open issues missing spec-created.`. |
| AC4 | Listing and shape failures fail closed without guessed choices. | Pass | `scripts/publish-approved-spec.mjs:181-213`; malformed root, JSON, row, labels, failed `gh`, and extra-argument cases pass in `publish-approved-spec.test.mjs`. |

## Regression Obligations

- [x] AC2 / FR6 / SCN003: explicit `#N` and `N` bypass the picker; invalid non-empty input retains exact usage output — static contract tests pass and explicit TUI smoke entered Discovery.
- [x] AC2 / FR6 / SCN007: the post-publication loop still invokes approved-package `candidates` and uses `Finished — stop writing specs` — preserved in `workflows/write-spec/WORKFLOW.md:147-180` and covered by the interactive contract test.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add `missing-spec-created` helper command. | Complete | Implemented in `scripts/publish-approved-spec.mjs`; explicit argv, complete validation, exact-label filtering, sorting, deduplication, and stable errors verified. |
| T002 | Route bare write-spec through the picker. | Complete | Implemented in `workflows/write-spec/WORKFLOW.md`; TUI exercised against four mocked missing-label issues. |
| T003 | Cover helper and workflow regression contracts. | Complete | Focused suites passed 27/27 tests; helper edge cases and workflow contracts are covered. |
| T004 | Run full plugin verification. | Complete | Full Jest, inventory, plugin surface, skill contract validation, git hygiene, helper smoke, and interactive TUI exercise completed. |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | `missingSpecCreated` owns only list validation/filtering; `candidates` remains separate. |
| Open/Closed | 4 | A new dispatch subcommand extends the helper without altering candidate semantics. |
| Liskov Substitution | 4 | No subtype contract applies; the existing `run`/JSON command boundary remains consistent. |
| Interface Segregation | 5 | The helper returns only `{ok, issues}` and the workflow consumes only that bounded contract. |
| Dependency Inversion | 4 | External GitHub access remains behind explicit `spawnSync` argv, consistent with the existing script architecture. |

**SOLID score**: 4/5. The change preserves module boundaries and deliberately avoids overloading `candidates`.

### Layer Separation

The workflow owns user choice and lifecycle control; the Node helper owns deterministic GitHub evidence parsing and classification. README documentation reflects the public behavior. No lifecycle decision moved into the script layer.

### Dependency Flow

`workflows/write-spec/WORKFLOW.md` depends on the script's JSON contract, and the script reuses `issueHasSpecCreatedLabel`. Dependencies point from orchestration to deterministic classification and do not introduce a second label predicate.

---

## Security Assessment

**Score: 5/5.** External data is validated before use. The `gh` call uses a fixed executable and explicit argument array; no issue title, label, or number is interpolated into shell source. Malformed or partial evidence fails closed. No secrets, authentication changes, remote mutation, path expansion, or untrusted code execution were introduced.

- Authentication: Not applicable; existing authenticated `gh` context is reused read-only.
- Authorization: Not applicable; the new command only lists issues.
- Input validation: Pass — complete array, positive safe integer numbers, non-empty titles, and label shapes are checked.
- Injection prevention: Pass — explicit argv via `spawnSync`, no shell.
- Data protection: Pass — only issue number, title, and labels are read.

---

## Performance Assessment

**Score: 5/5.** The GitHub scan is explicitly bounded to 100 open issues. Validation, filtering, sorting, and deduplication are bounded in memory. The workflow caches the result for invalid-Other re-asks, preventing repeated network calls. No unnecessary dependencies or repeated repository scans were added.

---

## Testability and Error Handling

**Testability score: 4/5.** The helper is exercised through deterministic fake-`gh` fixtures, including label shapes, case sensitivity, sorting, deduplication, empty results, malformed data, and command failure. The workflow contract has static coverage and was also exercised in the actual TUI. Interactive `/plan` behavior cannot complete through the RPC harness by design, so the actual TUI supplied the runtime evidence.

**Error handling score: 5/5.** Stable `invalid_arguments`, `issues_unreadable`, and exact empty-set output cover invalid invocation, transport/parse/shape failure, and valid empty evidence. No partial list is returned, no error is swallowed, and workflow failure paths stop before `ask`.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps/Contract Coverage | Passes |
|---------------------|-------------|-----------------------------|--------|
| AC1 | Yes — SCN001, SCN002, SCN004 | Yes | Yes |
| AC2 | Yes — SCN003, SCN007 | Yes | Yes |
| AC3 | Yes — SCN006 | Yes | Yes |
| AC4 | Yes — SCN005 | Yes | Yes |

### Coverage Summary

- Feature files: 1 file, 7 scenarios.
- Focused tests: 27 passed across 2 suites.
- Full suite: 459 passed, 1 expected environment-dependent skip, 40 suites passed and 1 skipped.
- Test execution: Pass.

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `write-spec` |
| **Test Project** | Disposable temporary Git repository; removed after exercise |
| **Exercise Method** | `node scripts/exercise-omp.mjs --cwd <project> --timeout-ms 300000 -- /sdlc-write-spec`, followed by the actual interactive OMP TUI with the extension loaded |
| **Interactive gate handling** | Actual TUI `ask` exercised |
| **Duration** | RPC: 300-second bounded timeout; TUI: approximately 2 minutes |

### Captured Output Summary

The RPC harness correctly rendered the documented fail-closed message `Run /sdlc-write-spec in the TUI.` but timed out waiting for `agent_end`, consistent with the harness's documented inability to enter native plan mode. The actual TUI exercise used a disposable project and fixture `gh` response containing missing-label issues 9, 2, 7, and 4. Its first user interaction was one picker with `#2 — Two` recommended, then `#4 — Four`, `#7 — Seven`, and the exact Finished option; #9 was omitted by the three-item cap. Selecting Finished produced no publication or execute output. A separate explicit `#42` invocation bypassed the picker and reached Discovery.

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC1 | Bare picker order, cap, recommendation, and Finished option | Pass | Actual TUI picker output captured from disposable fixture project. |
| AC2 | Explicit invocation bypass | Pass | Actual TUI explicit invocation reached fixture Discovery and returned `issue_unreadable`. |
| AC3 | Empty result exact output | Pass | Live helper returned an empty set; RPC/TUI exercise rendered the exact message. |
| AC4 | Listing failure fails closed | Pass | Deterministic helper tests cover non-zero `gh`, malformed JSON, root, rows, and label shapes. |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `cd scripts && npm test -- --runInBand`: 459 passed, 1 expected skip. |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: 43 items mapped, clean. |
| OMP plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root .. --label repository`: passed. |
| Skill creator validation | Pass | Resolved/read `skill://skill-creator`; validator passed a temporary `SKILL.md` mirror of the 191-line `workflows/write-spec/WORKFLOW.md` entry contract. |
| Skill exercise | Pass | Actual OMP TUI picker and explicit routing exercised in a disposable project; RPC limitation recorded separately. |
| Prompt quality | Pass | Success, empty, failure, explicit, invalid, Other, Finished, and continuation paths are bounded and unambiguous. |
| Git hygiene | Pass | `git diff --check main...HEAD`: exit 0. |

**Gate Summary**: 7/7 gates passed, 0 failed, 0 incomplete.

---

## Fixes Applied

None. No safe local correction was required.

## Remaining Issues

None.

---

## Positive Observations

- The implementation reuses the exact label predicate rather than creating a second convention.
- The new picker and existing continuation candidate set remain intentionally separate.
- Invalid Other input reuses cached evidence rather than relisting GitHub.
- README behavior is synchronized with the public command.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/publish-approved-spec.mjs` | 0 | Helper and command dispatch satisfy T001. |
| `workflows/write-spec/WORKFLOW.md` | 0 | Bare, explicit, empty, failure, Other, Finished, and continuation paths reviewed. |
| `scripts/__tests__/publish-approved-spec.test.mjs` | 0 | Helper behavior and failures covered. |
| `scripts/__tests__/interactive-plan-contract.test.mjs` | 0 | Workflow and regression contracts covered. |
| `README.md` | 0 | Public invocation and behavior updated. |

---

## Recommendation

**Ready for PR**

All local obligations and steering gates pass. No PR-only evidence is required and no remaining issue blocks delivery.
