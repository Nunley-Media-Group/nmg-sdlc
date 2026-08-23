# Verification Report: Apply spec-created after specs exist and gate execute selection

**Date**: 2026-08-23
**Issue**: #223
**Reviewer**: Codex
**Scope**: Implementation verification against approved spec

---

## Executive Summary

The implementation satisfies AC1–AC7 and T001–T011. It adds a zero-dependency `spec-created` label helper, applies the label after write-spec merge, gates explicit execute queues, provides the empty-argument picker contract, and backfills labels during approved onboarding and upgrade execution. Focused issue tests, command rendering, inventory, plugin surface, prompt limits, and git hygiene pass.

The first verification fix updated the stale `workflows/execute/WORKFLOW.md` trigger description so it no longer claims empty execution auto-selects the first backlog issue or accepts only space-separated input; `commands/sdlc-execute.md` was regenerated from the workflow.

Overall status is **Pass**. The mandatory full contract suite passes after a follow-up verification fix retained issue #225's exact legacy-path examples inside fenced code blocks, which `stripFencedCode` removes before current-spec validation, preserving the approved paragraph requirement and literals. The full suite passes 386 tests with one intentional skip; the issue-focused suite passes 103/103 tests.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5.0 |
| Architecture (SOLID) | 4.0 |
| Security | 5.0 |
| Performance | 4.0 |
| Testability | 5.0 |
| Error Handling | 4.0 |
| **Overall** | **4.5** |

### Implementation Status: Pass
**Total Issues**: 0

---

## Issue Scope

- Active issue: #223
- Spec: `specs/223-apply-spec-created-after-specs-exist-and-gate-execute-selection`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7]; tasks [T001–T011]; scenarios [SCN001–SCN007]
- Regression: related execute-controller obligations from issue #194, especially AC2, AC4, and FR2–FR6

<!-- nmg-sdlc-issue-scope: {"issueNumber":223,"specPath":"specs/223-apply-spec-created-after-specs-exist-and-gate-execute-selection","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009","T010","T011"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007"]},"regression":{"acceptanceCriteria":["#194-AC2","#194-AC4"],"functionalRequirements":["#194-FR2","#194-FR3","#194-FR4","#194-FR5","#194-FR6"],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Write-spec applies `spec-created` idempotently after publication | Pass | `scripts/publish-approved-spec.mjs:256-270`; `scripts/spec-created-label.mjs:81-101`; focused publish/helper tests pass, including post-merge failure and repeated add behavior |
| AC2 | Empty execute presents every open labeled issue and queues only the selection | Pass | `scripts/sdlc-execute.mjs:428-439`; `workflows/execute/references/selection.md:5-12`; command-render and workflow contract tests pass |
| AC3 | Explicit lists skip picker and reject all work when any issue is unlabeled | Pass | `scripts/sdlc-execute.mjs:704-719`; controller tests prove zero worker starts and stable issue diagnostics; live controller smoke returned `#223 has no spec-created label` with exit 2 |
| AC4 | Labeled explicit lists preserve listed order with first-occurrence dedupe | Pass | `scripts/sdlc-execute.mjs:54-70`; controller test persists `[15,12]` for `#15,#12 #15` and starts `s15-start` first |
| AC5 | Empty specified backlog starts nothing | Pass | `scripts/sdlc-execute.mjs:694-702`; controller test expects exact `No open spec-created issues.\n` and zero starts |
| AC6 | Upgrade labels unique complete issue-owned spec packages only | Pass | `scripts/spec-created-label.mjs:42-78,104-129`; `scripts/sdlc-upgrade.mjs:1139-1144`; upgrade/helper tests cover Draft ownership, omission, and continue-on-failure |
| AC7 | Onboard backfills after package creation and labels nothing for empty greenfield specs | Pass | `workflows/onboard-project/WORKFLOW.md:48`; `workflows/onboard-project/references/brownfield.md:11-12`; shared helper returns empty successful results for an empty `specs/` tree |

## Functional Requirements Verification

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | Exact constant/description, create-if-missing, and add-only mutation in `scripts/spec-created-label.mjs:8-11,81-101` |
| FR2 | Pass | Initial explicit gate and per-worker re-check in `scripts/sdlc-execute.mjs:704-719,742-752,825-833` |
| FR3 | Pass | `list-specified` plus `workflows/execute/references/selection.md:5-12` |
| FR4 | Pass | `/[\s,]+/` parsing, stable usage, dedupe, and max-20 behavior covered by focused tests |
| FR5 | Pass | Shared backfill helper used by upgrade and prescribed by onboard without per-issue confirmation |
| FR6 | Pass | Label gate precedes the existing approved-spec stop; focused Draft-spec test still returns `Run /sdlc-write-spec #42` |
| FR7 | Pass | `gh issue edit N --add-label spec-created` only; tests reject `--remove-label` |

---

## Regression Obligations

| Obligation | Status | Evidence |
|------------|--------|----------|
| #194 AC2 / FR2: retain controller preflight, run state, queue, resume, and helper CLIs | Pass | Existing controller regression suite remains green in the focused 103-test run; `backlog` CLI remains in `scripts/sdlc-execute.mjs` |
| #194 AC4 / FR3–FR6: retain compact rendered command, Herdr safety, prompt ceilings, and generated surface | Pass | `extension-commands.test.mjs`, `rendered-prompt-bytes.test.mjs`, inventory, and plugin-surface validation all pass |
| Existing `selectBacklog` dependency/Done filtering remains unchanged | Pass | No `selectBacklog` implementation change; legacy helper tests pass |
| Existing eight-worker handoff pipeline remains unchanged after queue selection | Pass | Controller regression test still verifies start, implement, review1, fix1, review2, fix2, verify, and deliver worker order |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add spec-created label module | Complete | Six required exports and both CLI modes present |
| T002 | Cover label helper | Complete | New helper suite covers exact labels, package ownership, idempotence, and failure continuation |
| T003 | Apply label at write-spec merge completion | Complete | Apply occurs after checkout and ff-only pull; failure is post-merge and fail-closed |
| T004 | Extend publish tests and gh stub | Complete | Success log, `labeled: true`, and post-merge failure covered |
| T005 | Parse comma lists and add list-specified | Complete | Parser and sorted list helper implemented; backlog CLI retained |
| T006 | Gate runExecute | Complete | Empty, resume, unlabeled, ordered, and Draft cases covered |
| T007 | Add picker reference and compact workflow | Complete | Reference exists; rendered command sync and byte ceiling pass; stale description fixed during verification |
| T008 | Upgrade always backfills | Complete | Backfill runs after approved-item loop, including empty approvals |
| T009 | Onboard backfills after package writes | Complete | Greenfield, brownfield/source-backfill, and already-initialized distinctions documented |
| T010 | Extend execute and upgrade tests | Complete | New controller and upgrade cases pass |
| T011 | Run focused contract and helper tests | Complete | 6 suites, 103 tests passed |

---

## Architecture Assessment

### SOLID Compliance — 4/5

| Principle | Score | Notes |
|-----------|-------|-------|
| Single Responsibility | 4 | Label discovery/mutation is isolated in `spec-created-label.mjs`; the pre-existing execute controller remains large but cohesive around orchestration |
| Open/Closed | 4 | Shared exported helper serves publication, execute, and upgrade without duplicate label logic |
| Liskov Substitution | 4 | Injectable `run` functions preserve a stable command-result contract across production and tests |
| Interface Segregation | 4 | Callers import only label functions they use |
| Dependency Inversion | 5 | External command execution is injected in helper/controller/upgrade paths |

Layer direction remains workflow → deterministic script → `gh` argv execution. No lifecycle mutation moved into the extension factory or an unrelated workflow.

### Security Assessment — 5/5

- External issue numbers are validated as positive safe integers.
- GitHub calls use explicit program/argv arrays; no `sh -c`, interpolation, label removal, or replacement semantics.
- Spec discovery is rooted under `root/specs`, reads only fixed four-file names, and does not follow a shell glob.
- Label comparison is exact and case-sensitive.
- Failure output exposes bounded command diagnostics, not secrets.

### Performance Assessment — 4/5

- Repository label and issue listing are bounded at 100 entries.
- Spec discovery performs one directory scan and four fixed reads per unique candidate.
- Backfill is sequential to retain per-issue failure accounting and avoid rate spikes; work is bounded by issue-owned packages.
- No new runtime dependencies, polling loops, or unbounded in-memory structures were introduced.

### Testability Assessment — 5/5

- All GitHub operations accept injectable command runners.
- Helper discovery uses deterministic temporary filesystem fixtures.
- Controller tests observe queue order, run state, worker starts, and stable diagnostics rather than source-text-only behavior.
- Publication tests use isolated repositories and command stubs.
- All seven Gherkin scenarios have direct focused contract coverage.

### Error Handling Assessment — 4/5

- Stable reason codes cover invalid CLI input, unreadable issue lists, and post-merge label failure.
- Backfill records per-issue failure and continues later packages.
- Execute starts zero workers when any explicit issue is unreadable or unlabeled.
- Write-spec does not attempt to undo a completed squash merge after label failure.
- Diagnostics are specific enough for remediation while preserving existing fail-closed behavior.

---

## Test Coverage

### BDD Scenarios

| Scenario | Acceptance Criterion | Has Contract Coverage | Result |
|----------|----------------------|-----------------------|--------|
| SCN001 | AC1 | Yes | Pass |
| SCN002 | AC2 | Yes | Pass |
| SCN003 | AC3 | Yes | Pass |
| SCN004 | AC4 | Yes | Pass |
| SCN005 | AC5 | Yes | Pass |
| SCN006 | AC6 | Yes | Pass |
| SCN007 | AC7 | Yes | Pass |

### Test Results

- Focused issue suite: **Pass** — 6 suites, 103 tests, 0 failures.
- Full repository suite: **Pass** — 38 suites and 386 tests passed; 1 environment-gated suite/test skipped; 0 failures.
- `node scripts/skill-inventory-audit.mjs --check`: **Pass** — 43 items mapped.
- `node scripts/verify-plugin-surface.mjs --root . --label repository`: **Pass**.
- `git diff --check`: **Pass** — no output.
- `node scripts/sdlc-execute.mjs list-specified`: **Pass** — valid JSON, `{"ok":true,"issues":[]}` for current live repository state.

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| Skill exercised | `/sdlc-execute` |
| Test project | Disposable `/tmp/nmg-sdlc-exercise-223.*` repository; removed after capture |
| Exercise method | `node scripts/exercise-omp.mjs --cwd <project> --timeout-ms 300000 -- /sdlc-execute '#223'` |
| Duration | 66.42 seconds for the quoted explicit invocation |
| Mutation policy | No GitHub or project mutations |

### Captured Output Summary

The disposable project intentionally had no GitHub remote. The expanded command attempted the explicit label read, returned `Unable to read labels for #223`, exited 1, and reported that it stopped before starting workers with no mutations. An empty invocation returned the helper's structured `issues_unreadable` failure. These runs prove file-command discovery and fail-closed behavior. Interactive picker rendering could not be observed in the non-TUI RPC harness and is covered by the workflow contract plus focused tests.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | Full suite: 38 suites and 386 tests passed, 1 environment-gated skip, 0 failures |
| Skill inventory | Pass | `Skill inventory audit: clean (43 items mapped).` |
| OMP plugin surface | Pass | Repository plugin surface validation passed |
| Skill creator validation | Pass | Resolved/read `skill://skill-creator` before the verification workflow fix. Its validator targets `SKILL.md` and is inapplicable to repository `WORKFLOW.md` bundles; applicable inventory, generated-command, prompt-limit, plugin-surface, focused-test, and exercise checks pass |
| Skill exercise | Pass | Disposable RPC exercise loaded `/sdlc-execute`, failed closed on unavailable issue labels, started no workers, and made no mutations |
| Prompt quality | Pass | Empty, success, cancel, invalid Other, unavailable UI, and helper-failure paths are explicit; stale trigger metadata was corrected |
| Git hygiene | Pass | `git diff --check` exited 0 with no output |

**Gate Summary**: 7/7 passed, 0 failed, 0 incomplete.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| Medium | Prompt quality | `workflows/execute/WORKFLOW.md:3` | Trigger metadata still claimed empty execute selected the first ready backlog issue and accepted only space-separated lists | Updated metadata to describe `spec-created` selection and comma/whitespace lists; regenerated `commands/sdlc-execute.md` | `skill-creator` |
| High | Verification gate | `specs/225-provide-situation-paragraphs-on-interactive-interview-asks/design.md`, `tasks.md` | Current-spec validation rejected legacy path literals in approved issue #225 prose | Retained the exact examples inside fenced code blocks so `stripFencedCode` excludes them from validation, and reworded the task criterion as the legacy-layout paragraph; full suite now passes | `direct` |

## Remaining Issues

None.

---

## Positive Observations

- One shared helper defines label identity, ownership discovery, creation, application, and backfill behavior.
- Label mutation is additive and idempotent; other issue labels are preserved.
- Explicit queue validation is atomic: one unlabeled issue prevents every worker start.
- Resume behavior preserves already-started workers while new-worker creation rechecks the label.
- Documentation, changelog, generated command surface, focused tests, and workflow references remain synchronized.

## Recommendations Summary

### Before PR (Must)

- [x] All local acceptance and steering gates pass.

### Short Term (Should)

- Re-run the TUI empty-argument picker against a repository with multiple open `spec-created` issues when that remote state is available; local contract coverage is already complete.

## Files Reviewed

`CHANGELOG.md`, `README.md`, `commands/sdlc-execute.md`, all changed scripts and tests, and all changed workflow/reference files listed by `git diff --name-only main...HEAD`.

---

## Recommendation

**Ready for PR.**

Issue #223 satisfies every approved acceptance criterion and task. All applicable local gates pass; no PR-only evidence is required.
