# Verification Report: Ignore plugin runtime state under `.omp/sdlc`

**Date**: 2026-08-24
**Issue**: #255
**Reviewer**: Codex
**Scope**: Implementation verification against the approved specification

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **5.0** |

### Implementation Status: Pass

**Total Issues**: 0 remaining. Verification found and fixed one high-priority implementation gap and its contradictory regression coverage: execute delegated runtime untracking to the start worker instead of performing the approved preflight itself. `runExecute` now performs the controlled untrack immediately before its initial dirty gate, authorizes only the exact resulting index-only deletion set, and fails closed before run-state writes or worker startup when untracking fails.

## Issue Scope

- Active issue: #255
- Spec: `specs/255-ignore-plugin-runtime-state-under-omp-sdlc`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2]; FR [FR1, FR2, FR3]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002]
- Regression: AC [AC3]; FR [FR4]; scenarios [SCN003]

<!-- nmg-sdlc-issue-scope: {"issueNumber":255,"specPath":"specs/255-ignore-plugin-runtime-state-under-omp-sdlc","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2"],"functionalRequirements":["FR1","FR2","FR3"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002"]},"regression":{"acceptanceCriteria":["AC3"],"functionalRequirements":["FR4"],"scenarios":["SCN003"]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Onboard/upgrade install `.omp/sdlc/`; runtime no longer blocks issue start | Pass | `scripts/omp-sdlc-ignore.mjs:17-61`; `workflows/onboard-project/WORKFLOW.md:50`; `scripts/sdlc-upgrade.mjs:930-953,1262-1292`; focused tests and disposable CLI exercise passed. |
| AC2 | Tracked runtime is removed only from the index and only its exact staged deletions are authorized | Pass | `scripts/omp-sdlc-ignore.mjs:64-135`; `scripts/start-issue.mjs:117-134`; `scripts/sdlc-execute.mjs:637-644,775-785`; real-git controller fixtures preserve the working-tree file and reject incomplete/additional transitions. |
| AC3 | Dirt outside the exact authorized runtime transition still blocks branch mutation | Pass | `scripts/__tests__/start-issue-controller.test.mjs:177-241`; `scripts/__tests__/sdlc-execute.test.mjs:1001-1053`; both controllers return `dirty_tree` and start no branch/worker for unrelated dirt. |

## Regression Obligations

- [x] AC3 / FR4 / SCN003: unignored runtime, unrelated files, missing deletion records, extra paths, worktree deletions, modifications, renames, and untracked paths remain blocking.
- [x] Existing start dirty-tree behavior for ` M local.txt` remains green.
- [x] Existing execute dirty preflight still returns status 2 with `Working tree is dirty for a new issue` off the issue branch.

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add ignore/untrack helper and onboard/upgrade writers | Complete | Canonical predicate, writer, CLI, upgrade detector/apply ordering, and workflow contracts are present and idempotent. |
| T002 | Untrack runtime in start and execute before dirty checks | Complete | Both controllers invoke the shared helper; only the immediate initial dirty gate receives the exact authorization. |
| T003 | Add regression tests | Complete | Helper, upgrade, start, and execute coverage maps SCN001-SCN003 and exercises success plus fail-closed variants. |
| T004 | Verify focused suites | Complete | Required four-suite Jest command passed: 151 tests. |

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | `omp-sdlc-ignore.mjs` owns the ignore, cached-untrack, and exact-transition policy once. |
| Open/Closed | 5 | Start, execute, onboard, and upgrade consume one focused module rather than duplicating predicates. |
| Liskov Substitution | 5 | Injected `run` and `fs` contracts remain substitutable in deterministic fixtures. |
| Interface Segregation | 5 | Consumers import only the writer, untrack operation, or transition predicate they use. |
| Dependency Inversion | 5 | Filesystem and command execution are injectable at the policy boundary. |

Layer separation is preserved: workflow Markdown declares when the operation runs; the zero-dependency script owns deterministic mutation and classification; controllers retain lifecycle decisions. Dependency flow remains from workflows/controllers to the shared helper, with no reverse coupling.

## Security Assessment

**Score: 5/5.** Git arguments are fixed arrays. No shell interpolation accepts host data. Untracking uses exactly `git rm --cached -r -- .omp/sdlc`, never deletes working-tree files, requires the exact ignore rule, validates NUL-delimited tracked paths under `.omp/sdlc/`, and authorizes no status record outside the operation-bound exact set. Failures stop before branch or worker mutation. Authentication, web authorization, XSS, CSRF, and sensitive-data controls are not applicable to this local controller change.

## Performance Assessment

**Score: 5/5.** When the ignore rule is absent, the helper performs no git subprocess. When present, work is bounded to one `git ls-files` and at most one `git rm --cached`; exact-set checks are linear in the number of runtime paths. Synchronous I/O occurs only in bounded CLI/controller startup, consistent with technical steering.

## Testability Assessment

**Score: 5/5.** Pure predicates cover ignore recognition and exact transition authorization. Filesystem and process execution are injected. Unit cases cover malformed and failed commands; real-git fixtures prove index-only deletion and retained working-tree files. Gherkin scenarios SCN001-SCN003 map to executable Jest coverage.

## Error Handling Assessment

**Score: 5/5.** Read, list, and removal failures are classified as `runtime_untrack_failed`. Start writes an intervention handoff and does not develop a branch. Execute returns status 2 with an exact diagnostic, writes no run state, and starts no worker. No errors are swallowed or converted into broader clean-tree exceptions.

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Executable Coverage | Passes |
|---------------------|-------------|-------------------------|--------|
| AC1 | SCN001 | Yes | Yes |
| AC2 | SCN002 | Yes | Yes |
| AC3 | SCN003 | Yes | Yes |

### Execution Results

- Required focused Jest suites: **Pass** — 4 suites, 151 tests.
- Full Jest suite: **Pass** — 42 suites passed, 1 skipped; 504 tests passed, 2 skipped.
- Unexpected issue-scoped skips: none.

## Exercise Test Results

| Field | Value |
|-------|-------|
| Skill Exercised | `/sdlc-onboard-project` plus its exact ignore-writer command |
| Test Project | Disposable `/tmp/nmg-sdlc-exercise-255.*` project, removed after capture |
| Exercise Method | `node <plugin-root>/scripts/exercise-omp.mjs --cwd <project> --timeout-ms 300000 -- /sdlc-onboard-project` |
| Interactive gate handling | Expected RPC fail-closed result: `Run /sdlc-onboard-project in the TUI.` followed by bounded timeout |
| Direct artifact exercise | First `ensure --root` returned `changed:true` and wrote exactly `.omp/sdlc/`; second run returned `changed:false`, `already present` |

The changed workflow is interactive and therefore cannot complete through print/RPC by contract. The captured TUI-only diagnostic is the expected graceful degradation, not evidence of workflow mutation. The exact plan-execution helper was separately exercised against the disposable repository and satisfied AC1's write and idempotence behavior. AC2 and AC3 were exercised through real-git controller fixtures.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | Focused 151/151 and full 504/504 executed tests passed. |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: clean, 43 items mapped. |
| OMP plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository`: passed. |
| Skill creator validation | Pass | Resolved/read `skill://skill-creator`; affected WORKFLOW/reference bundles satisfy its authoring rules. Its generic validator requires `SKILL.md` and is not applicable to repository `WORKFLOW.md` bundles; native inventory, surface, prompt, tests, and exercise checks passed. |
| Skill exercise | Pass | Interactive RPC failed closed as documented; exact helper behavior and controller transitions were exercised in disposable/real-git fixtures. |
| Prompt quality | Pass | Added workflow instructions are imperative, ordered after spec creation or v2 cleanup, name exact argv, preserve approval boundaries, and reference packaged files. |
| Git hygiene | Pass | `git diff --check` exited 0 with no output. |

**Gate Summary**: 7/7 applicable gates passed, 0 failed, 0 incomplete.

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| High | Spec compliance / error handling | `scripts/sdlc-execute.mjs` | Execute did not call `untrackOmpSdlcRuntime`, so tracked runtime could block before the start worker and untrack failure was not classified at execute preflight. | Added the shared untrack call immediately before `dirtyTreeBlocks`, passed its exact authorization only to that gate, and added the required status-2 failure path. | direct |
| High | Testing | `scripts/__tests__/sdlc-execute.test.mjs` | Tests asserted that execute must not untrack runtime, contradicting approved T002/FR3. | Replaced contradictory expectations with real-git exact-transition success, unrelated-dirt rejection, working-tree preservation, and untrack-failure coverage. | direct |

## Remaining Issues

None.

## Positive Observations

- The operation-bound exact-set predicate avoids broad porcelain filtering.
- Cached-only removal preserves host runtime files while making the ignore rule effective.
- Onboard and upgrade share one canonical spelling and remain idempotent.
- Documentation, changelog, Gherkin, regression tests, and controller behavior are aligned after the verification fix.

## Files Reviewed

| File group | Issues | Notes |
|------------|--------|-------|
| `scripts/omp-sdlc-ignore.mjs` | 0 | Focused policy module; exact and fail-closed. |
| `scripts/start-issue.mjs`, `scripts/sdlc-execute.mjs` | 1 fixed | Both now satisfy the approved controlled-untrack preflight. |
| `scripts/sdlc-upgrade.mjs` | 0 | Detector/apply ordering and preservation verified. |
| `workflows/onboard-project/`, `workflows/upgrade-project/` | 0 | Approval and mutation boundaries preserved. |
| Four issue-focused Jest suites | 1 fixed | Coverage now matches approved execute behavior. |
| `README.md`, `CHANGELOG.md`, issue spec package | 0 | Public and traceability artifacts align with behavior. |

## Recommendation

**Ready for PR.** All delivery and regression obligations pass locally; architecture and steering gates pass; no PR-only evidence is required.
