# Verification Report: /sdlc-execute routes against the fetched remote default branch

**Date**: 2026-10-25
**Issue**: #502
**Reviewer**: Claude Code (architecture-reviewer, verify worker)
**Scope**: Implementation verification against spec

**Verification head**: ac13af8727512bfc69fb2de6784372aa8edff0b9

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | 4.8 |

### Implementation Status: Pass
**Total Issues**: 2 (both Low, non-blocking)

`branchCommits` in `scripts/sdlc-execute.mjs` now fetches `refs/heads/<defaultBranch>` into `refs/remotes/origin/<defaultBranch>` and counts `refs/remotes/origin/<defaultBranch>..HEAD`. It throws `default_branch_unreadable` when the default branch name is missing, the fetch fails, or the count is unreadable or not numeric. Three new regression tests cover the stale-local-default cases. Two of them (empty-branch and fetch-failure) fail against the pre-fix source and all three pass at HEAD. Both registered steering validations passed at the verification head, and coverage is complete (2/2).

---

## Issue Scope

- Active issue: #502
- Spec: `specs/502-route-sdlc-execute-against-the-fetched-remote-default-branch-instead-of-the-stale-local-ref`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":502,"specPath":"specs/502-route-sdlc-execute-against-the-fetched-remote-default-branch-instead-of-the-stale-local-ref","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 502 --spec specs/502-… --base main --controller-run-id 3c3fdbe4-1f43-47cd-a47c-73040c5b9a32`, exit 0
- Artifact: `.nmg-sdlc/verification/502.json` — `ok: true`, `ceiling: null`
- Coverage: declared 2, recorded 2, complete `true`, no missing, duplicate, or unknown results
- Identity: head `ac13af8727512bfc69fb2de6784372aa8edff0b9`, tree clean, spec hash `sha256:df4ba0ea…`, steering hash `sha256:d2c85d61…`

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Stale local default no longer skips implement | Pass | `scripts/sdlc-execute.mjs:227-237` counts against the fetched `refs/remotes/origin/<base>`; call site `scripts/sdlc-execute.mjs:914` routes `unimplemented` to `implement` before `prepareVersion` (line 923-925, gated on `verify`/`deliver`). Test "routes an empty issue branch created from origin to implement…" asserts steps `start, implement` and 0 version preparations before implement |
| AC2 | Branch with real commits still routes to verify/deliver | Pass | `Number(count) > 0` returns true → existing verify path with `prepareVersion` first. Test "routes a branch with real commits to verify…" asserts steps `verify, deliver` and >0 preparations before verify |
| AC3 | Unreadable remote default ref fails closed | Pass | `scripts/sdlc-execute.mjs:229,232,235` throw `default_branch_unreadable` for missing name, failed fetch, failed or non-numeric count. Test "fails closed with default_branch_unreadable…" asserts `{status: 1, stdout: '', stderr: 'default_branch_unreadable\n'}`, no starts, no version preparations |
| AC4 | Regression tests cover a stale local default branch | Pass | `scripts/__tests__/sdlc-execute.test.mjs` `describe('stale local default branch (#502)')` — 3 tests; full suite passed (1154 passed, 2 skipped) |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Count branch commits against the fetched remote default ref | Complete | All four acceptance bullets met (FR1, FR2, FR3) |
| T002 | Add stale-local-default regression coverage | Complete | Pre-fix check: in a detached scratch worktree with `origin/main`'s `scripts/sdlc-execute.mjs`, the empty-branch and fetch-failure tests **failed** and the real-commits test passed. All 3 pass at HEAD. `cd scripts && npm test` exits 0 |

The supervisor test fixture (`scripts/__tests__/sdlc-execute-supervisor.test.mjs`) now publishes a `main` baseline on origin and answers `gh repo view --jq` with `main`. With fail-closed routing, a fixture without a remote default branch would now stop on `default_branch_unreadable`, so it needed both. This is a necessary, in-scope adjustment.

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | `branchCommits` still answers one question; the fetch is part of producing a truthful count |
| Open/Closed | 5 | Change is local to the helper; routing call site unchanged |
| Liskov Substitution | 5 | N/A — no type hierarchy |
| Interface Segregation | 5 | Signature unchanged `(cwd, run, evidence)` |
| Dependency Inversion | 5 | Uses the injected `run` so tests substitute a failing fetch |

### Layer Separation

The change stays inside the execute controller script. No workflow, agent, hooks module, or reference file changed, so the skill-creator, skill-inventory, and plugin-surface gates do not apply.

### Dependency Flow

No new imports. Default branch name still comes from the status evidence (`evidence.project.defaultBranch`).

---

## Security Assessment

- [x] Authentication: unchanged (git uses the existing origin credentials)
- [x] Authorization: no new mutation; only `refs/remotes/origin/<base>` is updated, never a local branch or HEAD
- [x] Input validation: count is checked as `^\d+$` before use
- [x] Injection prevention: git invoked with argument arrays; branch name comes from GitHub's `defaultBranchRef`
- [x] Data protection: no secrets logged

---

## Performance Assessment

- [x] Async patterns: synchronous child process, consistent with the controller's other git calls
- [x] Caching: the `implementedHeads.has(...)` short-circuit skips the fetch for heads already implemented in this invocation
- [x] Resource management: `--quiet --no-tags` and a single refspec limit the fetch
- [x] Query optimization: one network round-trip per routing pass that reaches the check. Acceptable for correctness.

---

## Error Handling Assessment

All three unreadable states (missing name, fetch failure, unreadable count) fail closed with one stable reason code. This replaces the old fail-open `return true`, which caused the defect. Stderr and exit status are asserted exactly in tests.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Yes (Jest) | Yes |
| AC2 | Yes (SCN002) | Yes (Jest) | Yes |
| AC3 | Yes (SCN003) | Yes (Jest) | Yes |
| AC4 | Yes (SCN004) | Yes (Jest suite) | Yes |

### Coverage Summary

- Feature files: 4 scenarios (`feature.gherkin`)
- Step definitions: Implemented as Jest contract tests in `scripts/__tests__/sdlc-execute.test.mjs`
- Unit/contract tests: 1156 total — 1154 passed, 2 skipped (pre-existing), 52/53 suites passed (1 skipped)

---

## Exercise Test Results

No `workflows/` or `agents/` files changed in this diff (`git diff origin/main...HEAD` touches only `scripts/`, version mirrors, and `CHANGELOG.md`), so a skill exercise does not apply. The live controller behavior was exercised end to end by the registered smoke gate below.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (builtin.command: `npm test -- --runInBand` in `scripts/`) | Pass | Exit 0; `Test Suites: 1 skipped, 52 passed`; `Tests: 2 skipped, 1154 passed, 1156 total` |
| `repository.nmg-sdlc-smoke` (project.nmg-sdlc-smoke) | Pass | Provisioned a fresh smoke issue (#257) through autopilot draft-issue and write-spec. Baseline: no closing PRs. `sdlc-execute run #257`: start, implement, verify, and deliver passed. Proof: [nmg-sdlc-smoke#257](https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/257) CLOSED, [PR #259](https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/259) MERGED at `11394831417dd6eff77d752d671314cf5e8f4ed1` |
| Git hygiene (`git diff --check origin/main...HEAD`) | Pass | Exit 0 |
| Skill inventory / plugin surface / skill-creator / skill exercise | N/A | No workflow-bundled, reference, agent, or plugin-surface files changed |

**Gate Summary**: 3/3 applicable gates passed, 0 failed, 0 incomplete

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None required | — | — |

## Remaining Issues

### Critical Issues
None.

### High Priority
None.

### Medium Priority
None.

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Error Handling |
| **Location** | `scripts/sdlc-execute.mjs:231` |
| **Issue** | The refspec `refs/heads/<base>:refs/remotes/origin/<base>` has no `+`, so a force-pushed (non-fast-forward) remote default branch makes the fetch fail |
| **Impact** | The run stops conservatively with `default_branch_unreadable` instead of routing. It never misroutes |
| **Reason Not Fixed** | Fail-closed matches FR3. Allowing forced updates is a policy choice outside this spec |

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Documentation |
| **Location** | `CHANGELOG.md` `[4.4.5]` |
| **Issue** | The bug-fix entry was filed under `### Changed` rather than `### Fixed` |
| **Impact** | Cosmetic changelog categorization |
| **Reason Not Fixed** | Generated by delivery's `prepare-version`. This verify step may write only the verification report |

---

## Positive Observations

- Replaces a fail-open default (`return true` on any read failure) with an explicit fail-closed reason code.
- Two of the three regression tests are proven to fail against the pre-fix code, so they guard the defect.
- Counts against a ref the controller refreshes itself, without touching the local default branch or HEAD, as the out-of-scope list requires.

---

## Recommendations Summary

### Before PR (Must)
- [x] None

### Short Term (Should)
- [ ] Consider filing future `bug` changelog entries under `### Fixed` in `prepare-version`

### Long Term (Could)
- [ ] Decide whether routing should tolerate a force-pushed default branch (`+` refspec)

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-execute.mjs` | 1 (Low) | `branchCommits` rewrite |
| `scripts/__tests__/sdlc-execute.test.mjs` | 0 | 3 new regression tests |
| `scripts/__tests__/sdlc-execute-supervisor.test.mjs` | 0 | Fixture publishes a remote `main` |
| `CHANGELOG.md` | 1 (Low) | Section heading |
| `VERSION`, `package.json`, `.claude-plugin/plugin.json` | 0 | Synchronized at 4.4.5 (patch for `bug`) |

---

## Recommendation

**Ready for PR**

All four acceptance criteria and both tasks are satisfied with direct evidence. The regression tests are proven to catch the defect. Every registered validation, including the real smoke delivery, passed at the exact verification head.
