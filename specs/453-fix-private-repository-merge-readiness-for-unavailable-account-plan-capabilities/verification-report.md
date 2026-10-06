# Verification Report: Fix private-repository merge readiness for unavailable account-plan capabilities

**Date**: 2026-10-06
**Issue**: #453
**Reviewer**: architecture-reviewer (nmg-sdlc verify worker)
**Scope**: Implementation verification against spec
**Verification head**: ebd050f95126237ff7b99d0bcefc596a73a36099

---

## Executive Summary

Commit `ebd050f` (`fix: accept account-plan unavailable policy discovery in spec publication #453`) implements T001–T004. `scripts/publish-approved-spec.mjs` adds a private `isAccountPlanCapabilityUnavailable(result)` predicate. It is used only for the branch-rules and classic required-status-check protection discovery results. It matches only a nonzero integer exit status together with a stderr line that is exactly `Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)`, with or without the `gh: ` prefix. Check parsing, identity, mergeability, polling, and merge code are unchanged. `scripts/sdlc-deliver.mjs` has no production change. Every acceptance criterion has passing real-CLI fixture evidence. Both registered required validations passed at the verification head, including a real `nmg-sdlc-smoke` delivery.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | 5.0 |

### Implementation Status: Pass
**Total Issues**: 0

---

## Issue Scope

- Active issue: #453
- Spec: `specs/453-fix-private-repository-merge-readiness-for-unavailable-account-plan-capabilities`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":453,"specPath":"specs/453-fix-private-repository-merge-readiness-for-unavailable-account-plan-capabilities","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- `steering/manifest.json` loads with 4 managed modules, 3 snippets, and 1 extension (`project.nmg-sdlc-smoke`). It registers two required, always-applicable validations: `repository.tests` (`builtin.command`) and `repository.nmg-sdlc-smoke` (`project.nmg-sdlc-smoke`).
- Runner: `sdlc-verify-steering.mjs --project . --issue 453 --spec specs/453-… --base main --controller-run-id 20d3682a-ee2e-47da-b44d-1996ef3ae576`, which returned `ok: true` and `ceiling: null`.
- Artifact `.omp/sdlc/verification/453.json` has identity `headSha` `ebd050f95126237ff7b99d0bcefc596a73a36099`, `treeState: clean`, steering `sha256:8cc2905a…`, and spec `sha256:9b7c6d11…`.
- Coverage: `declared: 2`, `recorded: 2`, `complete: true`, with no missing, duplicate, or unknown entries.
- `repository.tests` (local, required, run first): **passed**, `npm test -- --runInBand exited 0`.
- `repository.nmg-sdlc-smoke` (required): **passed**, `nmg-sdlc-smoke delivered #194`. Details are under Smoke Lifecycle Evidence.
- Ceiling: none.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Recognize explicit unavailable capability narrowly | Pass | `scripts/publish-approved-spec.mjs:383-393` matches the full sentence and `(HTTP 403)` on one trimmed stderr line (optionally `gh: `) and requires a nonzero integer exit. It is applied at `:399-400` (rules) and `:428` (classic protection). No repository identity is consulted. Test `publish-approved-spec.test.mjs:1226` covers rules, protection, both, and the unprefixed form. Each reaches rules → protection → checks and then the exact-head merge. |
| AC2 | Keep ambiguous and unrelated failures closed | Pass | Nonmatching rules responses still go through `readJson(..., 'pr_readiness_failed')` (`:400`). Protection keeps the exit-1 `Branch not protected` exception and otherwise fails (`:428-431`). Test `:1264` covers each source independently: permission 403, auth 401, generic 403, 404, the sentence with HTTP 404, the sentence embedded in another line, network failure, malformed success, and the sentence on a successful malformed response. It also covers non-array rules, malformed protection, and a mixed case where one source is unavailable and the other returns a generic 403 (both directions). Every case returns `pr_readiness_failed` with no `pr merge`. The existing unprotected-branch fixtures still pass. |
| AC3 | Preserve applicable policy from every available source | Pass | One `Set` accumulates names across both sources (`:402`, `:412`, `:426-427`). An unavailable source adds nothing and clears nothing. Test `:1278` covers rules unavailable with protection requiring `guardrails`, protection unavailable with rules requiring it, and both readable. Merge waits until `guardrails` reports (4 `--required` observations) and then merges the exact head. Policy blocker: `:1322` `GH_POLICY_BLOCK` returns `pr_merge_blocked`. |
| AC4 | Preserve check and exact-head merge gates | Pass | `reportedChecks` and `publicationSnapshot` are unchanged. With both sources unavailable, test `:1289` covers absent→pending, pending unfiltered, and stale UNSTABLE. Each shows the `UNSTABLE, UNSTABLE, CLEAN, CLEAN` state sequence and then `--match-head-commit <head>` after the last `pr view`. Test `:1322` covers a failed check (`pr_check_failed`), an unknown state, malformed required checks, a non-array reported set, the plan diagnostic on the required and on the all-checks query, an unreadable query, a changed head/branch/base/PR number, a closed PR, a draft, BLOCKED, and DIRTY. None of these merge. |
| AC5 | Preserve implementation-delivery readiness | Pass | `scripts/sdlc-deliver.mjs` is unchanged (`git diff main...HEAD` touches only its test). Test `sdlc-deliver.test.mjs:415` sends the plan diagnostic to the required query and the all-checks query separately. Both end in `delivery_failed` "returned no JSON", with no merge and the issue still OPEN. `:429` covers malformed and unreadable output for both queries. `:437` covers a failed unfiltered check (`checks_failed`). `:455` covers pending required/unfiltered checks, which wait and then merge at the current head. Absent declared checks are covered by `pr-delivery-state.test.mjs:216`. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Classify unavailable policy discovery without weakening readiness | Complete | Private predicate plus two call sites. `readJson` and the command runner are not broadened. |
| T002 | Prove discovery classification and source-local requirements | Complete | Real-CLI fixture with per-source `GH_RULES_*` / `GH_PROTECTION_*` controls. Existing defaults are preserved. |
| T003 | Prove publication check and identity gates under unavailable discovery | Complete | Adds `GH_REQUIRED_CHECKS_*`, `GH_ALL_CHECKS_*`, `GH_LATE_REQUIRED`, `GH_DRIFT_NUMBER`, and `GH_MERGE_STATE` controls. Existing wait fixtures are reused. |
| T004 | Prove implementation-delivery check failures stay closed | Complete | Adds `checkResponses` keyed by `--required`. Sequenced responses cover the pending→pass transitions. |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | The predicate only classifies. Discovery stays in `expectedCheckNames`. |
| Open/Closed | 5 | The exception is added beside the existing branches without changing shared helpers. |
| Liskov Substitution | 5 | N/A (no type hierarchy). The predicate takes the same `spawnSync` result shape as the other helpers. |
| Interface Segregation | 5 | No CLI, output schema, or configuration surface changed. |
| Dependency Inversion | 5 | Uses the existing `run` abstraction. No new dependency. |

### Layer Separation

The change is contained in one script-layer function. No workflow, agent, reference, or extension surface changed (`git diff --name-only main...HEAD -- workflows agents references src` is empty).

### Dependency Flow

Unchanged. `publish-approved-spec.mjs` → `gh` via argument arrays.

---

## Security Assessment

- [x] Authentication: auth failures (401) still fail closed. Tested.
- [x] Authorization: permission 403 and generic 403 still fail closed. Only the exact plan sentence with HTTP 403 qualifies.
- [x] Input validation: the match is a whole-line equality on trimmed stderr. Embedded or prefixed variants and non-403 statuses are rejected. Successful exit codes never qualify.
- [x] Injection prevention: no new command construction. The existing argument-array `gh api` calls are unchanged.
- [x] Data protection: no new data is logged or persisted.

---

## Performance Assessment

- [x] Async patterns: unchanged synchronous CLI flow. The same two discovery calls run per snapshot.
- [x] Caching: N/A.
- [x] Resource management: no new processes. The predicate is O(stderr lines).
- [x] Query optimization: no added API calls.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Yes (`publish-approved-spec.test.mjs:1226`) | Yes |
| AC2 | Yes (SCN002) | Yes (`:1264`, existing unprotected-branch cases) | Yes |
| AC3 | Yes (SCN003) | Yes (`:1278`, `:1322` policy blocker) | Yes |
| AC4 | Yes (SCN004) | Yes (`:1289`, `:1322`) | Yes |
| AC5 | Yes (SCN005) | Yes (`sdlc-deliver.test.mjs:415-468`, `pr-delivery-state.test.mjs:216`) | Yes |

### Coverage Summary

- Feature files: 5 scenarios, mapped 1:1 to AC1–AC5.
- Focused run: `npm --prefix scripts test -- --runInBand __tests__/publish-approved-spec.test.mjs __tests__/sdlc-deliver.test.mjs __tests__/pr-delivery-state.test.mjs` passed 3/3 suites and 171/171 tests.
- Failing-before proof: a disposable copy of HEAD with `scripts/publish-approved-spec.mjs` restored from `main` ran `-t 'account-plan unavailable'`. Result: 25 failed, 22 passed. All four AC1 merge cases and both AC3 unavailable-source directions failed, along with every unavailable-discovery AC4 case (pre-fix code aborts at discovery). The fail-closed AC2 cases passed on both trees, as expected.
- Full suite: `repository.tests` passed at the verification head through the registered runner.
- `git diff --check main...HEAD`: exit 0.

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Reason** | Not applicable. No file under `workflows/`, `agents/`, `references/`, or `src/` changed, so there is no skill contract to exercise. The changed script is covered by real-CLI fixtures and by the live smoke spec-publication path. |
| **Recommendation** | None |

---

## Smoke Lifecycle Evidence

`repository.nmg-sdlc-smoke` ran from this checkout at `ebd050f` with no explicit queue:

- Provisioning: fresh clone and baseline (latest issue #191). A provider-owned Herdr pane ran `/sdlc-draft-issue` and then `/sdlc-write-spec 194`. Issue https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/194 was created, and spec PR https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/195 was published and **MERGED** through `publish-approved-spec.mjs`.
- Pre-run closing-PR baseline for #194: no nodes, state OPEN.
- `sdlc-execute run #194`: start, implement, verify, and deliver all passed. Result: `#194: MERGED and CLOSED`.
- Proof: issue #194 is **CLOSED**. PR https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/196 is **MERGED** with `headRefOid` `d8353217b3e3c1532e60cc66ce49c6fb291adf11`, outside the baseline.
- Smoke repository `repository.nmg-sdlc-smoke` preserved. No ad-hoc writes were made.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests (`repository.tests`) | Pass | Registered runner: `npm test -- --runInBand exited 0` at `ebd050f` |
| Live smoke project (`repository.nmg-sdlc-smoke`) | Pass | `nmg-sdlc-smoke delivered #194`. PR #196 MERGED at `d8353217…`, issue CLOSED |
| Skill inventory | N/A | No skill, reference, or agent surface changed |
| OMP plugin surface | N/A | Plugin surface unchanged |
| Skill creator validation | N/A | No skill-bundled file changed |
| Skill exercise | N/A | No changed skill |
| Prompt quality | N/A | No skill contract changed |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |

**Gate Summary**: 3/3 applicable gates passed, 0 failed, 0 incomplete

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None required | — | — |

## Remaining Issues

None.

---

## Positive Observations

- The exception is limited to one diagnostic and one source at a time. The mixed-failure tests prove that an unavailable source never hides an ordinary failure from the other source.
- Unchanged fixture defaults keep every pre-existing publication test meaningful.
- The delivery tests prove that the diagnostic on a check query never becomes an empty successful check set.

---

## Recommendations Summary

### Before PR (Must)
- None

### Short Term (Should)
- None

### Long Term (Could)
- None

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/publish-approved-spec.mjs` | 0 | Predicate and two discovery call sites |
| `scripts/__tests__/publish-approved-spec.test.mjs` | 0 | Per-source fixture controls and AC1–AC4 cases |
| `scripts/__tests__/sdlc-deliver.test.mjs` | 0 | Per-query check responses and AC5 cases |
| `CHANGELOG.md` | 0 | `[Unreleased]` entry matches the behavior |

---

## Recommendation

**Ready for PR**

All five acceptance criteria and four tasks are implemented with real-CLI evidence. Both registered required validations passed at `ebd050f95126237ff7b99d0bcefc596a73a36099` with complete coverage and no ceiling.
