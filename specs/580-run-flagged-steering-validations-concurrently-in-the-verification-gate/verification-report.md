# Verification Report: Run flagged steering validations concurrently in the verification gate

**Date**: 2026-11-19
**Issue**: #580
**Reviewer**: Claude (nmg-sdlc verify worker, gate phase)
**Scope**: Implementation verification against spec
**Verification head**: 38ed63e9866130c6272196c19fd7fe2e5f7ce916

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 4.7 |

### Implementation Status: Pass
**Total Issues**: 3 (all `info`, none blocking)

The review of this source passed with no finding above `info`. The pre-merge gate ran once through `sdlc-verify-steering.mjs` at head `38ed63e9866130c6272196c19fd7fe2e5f7ce916`. It recorded both declared validations (`repository.tests` and `repository.nmg-sdlc-smoke`) as required and passed. Coverage is complete (`declared: 2`, `recorded: 2`, `complete: true`), and the ceiling is `null`.

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/580.json` (generated 2026-11-19T19:10:03.679Z)
- Identity: headSha `38ed63e9866130c6272196c19fd7fe2e5f7ce916`, steeringHash `sha256:cc80105a430c7fd1d914c6e253145b44d198660fb624848c166e778d00887aba`, specHash `sha256:37b812295222f5c68fab09431a50e7a4a9c8be549bbf41322b4ba21b43be37de`
- Base ref: `main`; tree state clean
- Ceiling: none
- Coverage: declared 2, recorded 2, complete true; missing, duplicate and unknown all empty

---

## Issue Scope

- Active issue: #580
- Spec: `specs/580-run-flagged-steering-validations-concurrently-in-the-verification-gate`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":580,"specPath":"specs/580-run-flagged-steering-validations-concurrently-in-the-verification-gate","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Acceptance Criteria Verification

The evidence comes from the passed review record `.nmg-sdlc/verification/580-review.json` (reviewed head bf5e936, scoped). Every criterion is exercised through the real `runSteeringValidations` entry point. **No criterion's tests mock the path under test.**

| AC | Description | Status | Exercised | Evidence |
|----|-------------|--------|-----------|----------|
| AC1 | Flagged validations run at the same time | Pass | real_entry_point | `src/sdlc-verification-runtime.mjs:442-449` starts the pending `concurrent: true` batch with `Promise.all`. `scripts/__tests__/validation-tiers.test.mjs:419-428` asserts overlapping spans and a total time under 800ms for 400ms and 500ms members. |
| AC2 | Unflagged validations keep today's serial behavior | Pass | real_entry_point | `src/sdlc-verification-runtime.mjs:445-446` awaits each unflagged validation alone. The tests at `validation-tiers.test.mjs:430-461` check that unflagged runs never overlap and that results with no key match results with `concurrent: false`. |
| AC3 | A failure does not stop the other concurrent validations | Pass | real_entry_point | `execute` turns provider and slot errors into entries (`:413-422`). The AC3 test lets the fast member fail; the slow member still passes, coverage is complete and the ceiling is Fail. |
| AC4 | Results stay in manifest order | Pass | real_entry_point | `src/sdlc-verification-runtime.mjs:452` assembles results in manifest order through `resultById`. The AC4 test finishes members in reverse order and keeps the heavy and selection fields. |
| AC5 | Heavy validations still take a pool slot | Pass | real_entry_point | `src/sdlc-verification-runtime.mjs:409-412`. `validation-tiers.test.mjs:495-511` uses the real host-wide pool: the heavy member waits for its slot (`waitedMs >= 250`), the light member does not, and the pool is empty afterwards. |
| AC6 | The Phase 1 deferral rule is unchanged | Pass | real_entry_point | Each batch member gets the same `deferred()` rule (`:440`, `:449`). The AC6 test confirms that no provider starts and every result records the deferral summary. |
| AC7 | Cancelling the gate stops every running validation | Pass | real_entry_point | Every member receives the shared signal (`:391`, `:411`) and slots are released in `finally`. The AC7 test confirms every member is cancelled, `release()` is called once, and the ceiling is Incomplete. |
| AC8 | An invalid flag is rejected | Pass | real_entry_point | `src/sdlc-steering-runtime.mjs:10`, `:242`. `scripts/__tests__/sdlc-steering-runtime.test.mjs` accepts true and false and rejects `'yes'`, `1`, `null` and `{}`. |

### Functional Requirements

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | `src/sdlc-steering-runtime.mjs:10`, `:242` |
| FR2 | Pass | `src/sdlc-verification-runtime.mjs:442-449` |
| FR3 | Pass | `src/sdlc-verification-runtime.mjs:445-446`; Phase 1 is unchanged and still serial |
| FR4 | Pass | `src/sdlc-verification-runtime.mjs:417-422`, `:449` |
| FR5 | Pass | `src/sdlc-verification-runtime.mjs:452` |
| FR6 | Pass | `src/sdlc-verification-runtime.mjs:393-423` (`execute` unchanged) |
| FR7 | Pass | `references/steering-schema.md:27`, `:45-49`; `README.md:189`, `:208` |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Accept and validate the concurrent key | Complete | `src/sdlc-steering-runtime.mjs` |
| T002 | Run flagged Phase 2 validations as one concurrent batch | Complete | `src/sdlc-verification-runtime.mjs` |
| T003 | Document the concurrent key | Complete | `references/steering-schema.md`, `README.md`, `CHANGELOG.md` (the bullet ends with `(#580).`) |
| T004 | Add behavioral coverage | Complete | `scripts/__tests__/validation-tiers.test.mjs` and `sdlc-steering-runtime.test.mjs`. The AC5 coverage is in `validation-tiers.test.mjs`, not the `sdlc-heavy-pool.test.mjs` file the task named; it uses the real pool. |

---

## Architecture Assessment

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID Principles | 5 | Batching is a small change to the Phase 2 loop. Per-validation behavior stays in the unchanged `execute`, the loader owns key validation, and the dependency direction is unchanged. |
| Security | 5 | Adds no input surface beyond a boolean key that the loader validates, and no shell construction. |
| Performance | 5 | Flagged validations overlap, and heavy members still go through the host-wide pool. |
| Testability | 4 | The tests drive the real entry point and the real pool. Two wall-clock bounds could be flaky on a loaded host (F2). |
| Error Handling | 4 | Each member's failures are isolated. The synchronous code before the `try` in `execute` can still reject `Promise.all` (F1). |

Average: 4.6 (5 + 5 + 5 + 4 + 4 = 23 / 5). The Executive Summary's 4.7 also counts Spec Compliance.

### Review lenses

- **acceptance**: complete. Scoped review: AC1, AC5 and FR7 were checked again and pass; the other rows keep their earlier pass.
- **failure-paths**: complete. Each member's failures stay isolated. F1 and F3 are `info` only, and the repair adds no new failure path.
- **test-quality**: complete. All 9 #580 tests pass through the real `runSteeringValidations`, and each test now has a 30s fixture timeout.

---

## Test Coverage

- BDD scenarios: 8 of 8 acceptance criteria have scenarios (SCN001 to SCN008 in `feature.gherkin`) and Jest tests that drive the real entry point.
- Test execution: Pass (`npm test -- --runInBand`: 69 test suites passed and 1 skipped; 1672 tests passed and 2 skipped; 1674 total).

### Steering validation results

| Validation | Provider | Required | Tier | Selection | Heavy | Status | Evidence |
|------------|----------|----------|------|-----------|-------|--------|----------|
| `repository.tests` | `builtin.command` | yes | null | null | none | Passed | `npm test -- --runInBand` exited 0. Log: `.nmg-sdlc/verification/580/repository.tests.log` |
| `repository.nmg-sdlc-smoke` | `project.nmg-sdlc-smoke` | yes | null | null | none | Passed | "nmg-sdlc-smoke delivered #323" |

This project declares no tiers, so every required validation ran, and each result records `tier: null` and `selection: null`.

---

## Real Smoke Lifecycle Evidence (`repository.nmg-sdlc-smoke`)

- Provisioning: the gate reused the recorded smoke issue `Nunley-Media-Group/nmg-sdlc-smoke#323` (`.nmg-sdlc/smoke/provisioned.json`). It was OPEN with `spec-created`, and its spec PR #324 `docs: approve spec for #323` was MERGED. `NMG_SDLC_SMOKE_ISSUES` was unset.
- Baseline: before the run, issue #323 had no closing PRs (`closedByPullRequestsReferences.nodes: []`).
- Execution: a headless `claude /sdlc-execute #323` run (session `98cfab10-f86d-4443-b947-55799e019351`) delivered the issue from a fresh `--single-branch` clone.
- Proof: PR #325 `Add greeting_initials library helper` is MERGED at `cf1b4f68c16904a4186f9b93ebbbf23cd684d0b9` (merged 2026-11-19T19:09:13Z). It is outside the baseline, and issue #323 is CLOSED.
- Smoke issue #323 is now delivered and terminal. The next verification will provision a fresh issue.

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Reason** | No exercise run. The change touches only `src/`, `scripts/__tests__/`, `references/steering-schema.md` and docs, not `workflows/` or `agents/`. |
| **Coverage** | The live smoke gate above ran the whole execute and verify lifecycle on this checkout. |

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None in the gate phase. An earlier gate failure from the Jest default timeout under load was repaired in bf5e936: each test now has a fixture timeout, and the AC2 test is split in two. | — | `direct` |

## Remaining Issues

None are Critical, High or Medium. These `info` observations come from the review:

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Low (info, F1) | Error Handling | `src/sdlc-verification-runtime.mjs` | The synchronous code before the `try` in `execute` (`resolveSelection`, `requestFor`) runs outside it. A transient throw there would reject `Promise.all` while the other members keep running unawaited. | `info` only, and a uniform failure throws before any provider starts. A follow-up could use `Promise.allSettled` or move that code inside the `try`. |
| Low (info, F2) | Testing | `scripts/__tests__/validation-tiers.test.mjs` | AC1 (under 800ms) and AC5 (`waitedMs >= 250`) assert wall-clock bounds. | `info` only. The main overlap assertions are deterministic, and the full suite passed under `--runInBand`. |
| Low (info, F3) | Documentation | `references/steering-schema.md`, `README.md` | `concurrent` also applies to `/sdlc-verify-full`, and flagged validations share one working tree, but the docs do not warn against shared output paths. | `info` only; this is documentation. |

---

## Recommendations Summary

### Before PR (Must)
- None.

### Short Term (Should)
- Consider `Promise.allSettled`, or moving the code before the `try` into it, to close F1.

### Long Term (Could)
- Document the shared-working-tree caveat and the `/sdlc-verify-full` scope of `concurrent` (F3).

---

## Recommendation

**Ready for PR**

All 8 acceptance criteria and 7 functional requirements pass, with tests that drive the real entry point. Both required pre-merge validations passed at the exact source head, coverage is complete, there is no ceiling, and the live smoke lifecycle merged and closed its issue with exact-head proof.
