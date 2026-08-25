# Verification Report: Move exact-head delivery into a controller with on-demand remediation

**Date**: 2026-08-25
**Issue**: #195
**Reviewer**: Codex
**Scope**: Implementation verification against approved spec

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **4.50** |

### Implementation Status: Pass
**Total Issues**: 0

All issue-owned acceptance criteria pass. The deterministic controller, compact remediation workflow, packaged-controller resolution, exact-head merge proof, tests, plugin gates, and OMP exercise pass. The mandatory live smoke completed two distinct fresh issues in `Nunley-Media-Group/nmg-sdlc-smoke-20260820001416`: issue #23 through PR #29 at exact head `bfbd4faf526ca6f4a5355df4f40e1ccf70b3e754`, and issue #24 through PR #28 at exact head `0837f0cb29c198f4c3b2ffb39526f6178934fcd4`. Both PRs are `MERGED`; both issues are `CLOSED`; both deliver handoffs validate. A live post-merge reconciliation exposed the valid no-required-checks response from `gh`; the controller now handles that exact response as an empty complete required-check set, retains fail-closed behavior for other failures, and passes focused plus full regression tests.

Post-verification remediation was freshly reviewed and verified at exact merged-base head `3fac2afd3e9fe49afa95585b02d9bf3c250f7eca`. The scoped parser/test/spec review returned `passed` after two stale report-count findings were fixed. A second scoped review passed the live `gh pr checks --required` empty-check response fix with no findings. After merging current `origin/main` without rewriting history and resolving its additive changelog conflict, the full contract suite passed 44 suites and 599 tests with 2 expected opt-in skips. Regression inputs cover issue #195's self-referential body verbatim, case-insensitive genuine `BREAKING:` declarations in both title and body positions, and both valid GitHub CLI empty-check stderr forms.

---

## Issue Scope

- Active issue: #195
- Spec: `specs/195-move-exact-head-delivery-into-a-controller-with-on-demand-remediation`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9]; tasks [T001, T002, T003, T004, T005, T006, T007, T008, T009]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008, SCN009, SCN010, SCN011]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":195,"specPath":"specs/195-move-exact-head-delivery-into-a-controller-with-on-demand-remediation","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010","SCN011"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Satisfied by two live GitHub issue lifecycles
- Live repository: `Nunley-Media-Group/nmg-sdlc-smoke-20260820001416`
- Historical gate evidence: `delivery-major-gate-failure.json` preserves and validates the original `major_bump_required` deliver handoff without replacing the canonical latest-outcome handoff.

### Changed-Path Evidence

- `commands/sdlc-open-pr.md` and `scripts/sdlc-deliver.mjs` move terminal delivery into the deterministic controller while retaining on-demand remediation.
- `src/sdlc-prompt-snippets.mjs`, `scripts/__tests__/rendered-prompt-bytes.test.mjs`, and `scripts/__tests__/sdlc-prompt-snippets.test.mjs` register the compact deliver prompt, remove unconditional deliver remediation text, and retain implement-only simplification with byte and registry coverage.
- `workflows/write-code/WORKFLOW.md` and `scripts/__tests__/simplify-contract.test.mjs` execute and verify the appended simplify workflow after implementation and before final verification.
- `specs/195-move-exact-head-delivery-into-a-controller-with-on-demand-remediation/delivery-major-gate-failure.json` preserves the validated historical false-positive failure separately from the canonical deliver handoff.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Controller preserves terminal delivery, versioning, exact-branch PR handling, classifier reuse, exact-head merge, proof, cleanup ordering, and packaged resolution | Pass | `scripts/sdlc-deliver.mjs:140-445,486-504,506-847`; `src/extension.ts:41-45`; 599-test suite; validated live deliver handoffs for #23 and #24 |
| AC2 | Remediation occurs only on demand in the same worker | Pass | `scripts/sdlc-deliver.mjs:578-600,796-808`; `workflows/open-pr/WORKFLOW.md:54-85`; deliver prompts exclude unconditional Address PR Comments; remediation packet tests pass |
| AC3 | Human and ambiguous review stop safely | Pass | `scripts/sdlc-deliver.mjs:602-605,620,793-800`; explicit and classified human-review tests pass; no intervention path merges |
| AC4 | Pending delivery waits at least 30 seconds and stops at one hour | Pass | `scripts/sdlc-deliver.mjs:20-21,754-766,789-815`; injected-time test observes 120 sleeps of 30,000 ms and `delivery_pending` |
| AC5 | Exact-head proof and branch-deletion ordering are preserved | Pass | `scripts/sdlc-deliver.mjs:821-839`; merge argv uses `--squash --match-head-commit <H>` without delete; tests and live handoffs bind exact heads before cleanup |
| AC6 | Verification proves two fresh real issue lifecycles | Pass | #23: issue URL below, PR #29 `MERGED` at `bfbd4faf526ca6f4a5355df4f40e1ccf70b3e754`, issue `CLOSED`. #24: issue URL below, PR #28 `MERGED` at `0837f0cb29c198f4c3b2ffb39526f6178934fcd4`, issue `CLOSED`. Both controller-owned deliver handoffs validate. |

## Live Two-Issue Smoke Evidence

| Issue | Issue URL | PR URL | Exact observed head | PR proof | Issue proof | Merge commit | Delivery handoff |
|-------|-----------|--------|---------------------|----------|-------------|--------------|------------------|
| #23 | https://github.com/Nunley-Media-Group/nmg-sdlc-smoke-20260820001416/issues/23 | https://github.com/Nunley-Media-Group/nmg-sdlc-smoke-20260820001416/pull/29 | `bfbd4faf526ca6f4a5355df4f40e1ccf70b3e754` | `MERGED` at 2026-08-25T16:46:25Z | `CLOSED` | `f90c8e5d2b744f6f9eb08f2e67a363f9ca7dd344` | `.omp/sdlc/handoffs/23-deliver.json`: passed, validated |
| #24 | https://github.com/Nunley-Media-Group/nmg-sdlc-smoke-20260820001416/issues/24 | https://github.com/Nunley-Media-Group/nmg-sdlc-smoke-20260820001416/pull/28 | `0837f0cb29c198f4c3b2ffb39526f6178934fcd4` | `MERGED` at 2026-08-25T16:09:17Z | `CLOSED` at 2026-08-25T16:09:18Z | `1d499d22842492b017d7a7e28745d4f0b857b675` | `.omp/sdlc/handoffs/24-deliver.json`: passed, validated |

The corrected Herdr session launched `/sdlc-execute #23 #24` with the required `/tmp/herdr-v0.8.0` PATH. Issue #24 completed remotely while the persisted local queue was still processing #23; its verification comments were posted at 16:04/16:05, PR #28 was created at 16:07 and merged at 16:09. The later redundant local #24 review attempt correctly found no branch diff because PR #28 was already merged. A post-merge controller reconciliation initially failed on `gh pr checks --required` returning the documented exit-1 `no required checks reported ...` response with no JSON. That exact live finding was fixed and regression-tested; the controller rerun then wrote the validated passed #24 deliver handoff without changing remote proof.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add injectable delivery controller and CLI | Complete | Export, CLI, injected command boundary, packaged resolver, and terminal handoff behavior implemented and tested |
| T002 | Implement versioning and PR create/resume | Complete | Approved-spec/readiness gates, bump matrix, synchronized files, verified idempotence, exact branch, and non-force push implemented |
| T003 | Implement readiness, exact-head merge, and proof | Complete | Reuses `classifyPrDeliveryState`; exact head, proof, merged-resume, and cleanup ordering covered |
| T004 | Add deterministic remediation packet | Complete | Complete packet, exit 3, state re-fetch, and no nested worker behavior covered |
| T005 | Bound pending delivery and human intervention | Complete | 30-second/one-hour bounds and controller-owned human review covered |
| T006 | Compact open-pr workflow around controller loop | Complete | Controller loop, controlled-draft evidence, and on-demand remediation explicit |
| T007 | Remove unconditional deliver extra workflow | Complete | `STEP_EXTRA_WORKFLOWS` retains only implement simplify; prompt tests pass |
| T008 | Cover controller terminal and remediation paths | Complete | Full suite: 44 suites passed, 599 tests passed, 2 expected skips |
| T009 | Verify two real GitHub delivery lifecycles | Complete | Two distinct issue URLs, PR URLs, exact heads, merged states, closed states, and validated deliver handoffs preserved above |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Controller orchestration is cohesive; focused helpers own parsing, versioning, snapshots, evidence, and handoffs |
| Open/Closed | 4 | Existing classifiers and readiness contracts are reused; bot identities and versioned paths are steering-driven |
| Liskov Substitution | 5 | Injectable `run`, `fs`, `now`, and `sleep` support equivalent test doubles |
| Interface Segregation | 4 | Injection surface is small and purpose-specific |
| Dependency Inversion | 5 | Business orchestration depends on injected command, filesystem, clock, and sleep boundaries |

### Layer Separation

The execute pane owns orchestration only. Sibling deliver workers invoke the deterministic controller. `classifyPrDeliveryState`, verification readiness, and controller resolution remain shared script contracts instead of duplicated workflow prose.

### Dependency Flow

`src/extension.ts` resolves the packaged controller; the workflow invokes it; `sdlc-deliver.mjs` consumes existing classifiers and readiness validators. No controller dependency points to a target project's controller script.

---

## Security Assessment

**Score: 4/5.** Issue values are validated, all `gh` and `git` calls use argument arrays, no shell interpolation is used by the controller, review authorship fails closed, and branch cleanup occurs only after exact remote proof. No secrets were added or logged.

- [x] Authentication: authenticated `gh` CLI required
- [x] Authorization: repository operations use caller-scoped credentials
- [x] Input validation: issue, spec ownership/status, SHA, branch, PR, and evidence contracts validated
- [x] Injection prevention: command plus argv arrays; no shell evaluation
- [x] Data protection: no credentials persisted in packets, reports, or handoffs

---

## Performance Assessment

**Score: 4/5.** Remote observation is bounded to one hour with 30-second spacing. State is fetched only at transitions or polling intervals. Blocking sleep is intentional for a dedicated worker and injected in tests. Repository scans are bounded to one issue spec prefix and declared files.

---

## Testability and Error Handling

- **Testability: 5/5.** Controller commands, filesystem, clock, and sleep are injectable. Tests cover CLI validation, version gates, resume, remediation, human review, pending timeout, exact-head merge, head changes, proof, cleanup ordering, controlled drafts, packaged resolution, and the live no-required-checks response.
- **Error Handling: 5/5.** Stable exit codes and reason codes distinguish invalid invocation, intervention, remediation, pending, merge proof, and unexpected failures. GraphQL and required-check failures fail closed. The one explicitly documented valid empty-check response is now recognized without weakening other error paths.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (`SCN001`, `SCN003`, `SCN006`, `SCN008`, `SCN010`, `SCN011`) | Jest plus live controllers | Yes |
| AC2 | Yes (`SCN002`) | Jest controller/prompt tests and OMP exercise | Yes |
| AC3 | Yes (`SCN005`) | Jest controller tests | Yes |
| AC4 | Yes (`SCN004`) | Injected clock/sleep Jest test | Yes |
| AC5 | Yes (`SCN007`) | Injected order tests and live exact-head proof | Yes |
| AC6 | Yes (`SCN009`) | Two real GitHub/Herdr lifecycles | Yes |

### Coverage Summary

- Feature files: 1 feature, 11 scenarios
- Full local execution at merged-base head `3fac2afd3e9fe49afa95585b02d9bf3c250f7eca`: 44 suites passed, 599 tests passed
- Expected skips: 2 tests in one opt-in exercise suite
- Focused delivery-controller execution: `sdlc-deliver.test.mjs`, 23 tests passed
- Current-spec regression: 6/6 tests passed within the fresh full suite
- Live delivery: 2/2 issues have exact-head MERGED and CLOSED proof

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skills Exercised** | `/sdlc-open-pr #23`; `/sdlc-execute #23 #24` |
| **Test Project** | `/tmp/nmg-sdlc-195-smoke-4aQnji` |
| **Methods** | OMP RPC harness for compact workflow dry-run; corrected Herdr v0.8.0 session for live queue |
| **Interactive gate handling** | Host `/review` menus selected PR-style review against literal `main`; automated workers asked no user questions |

The dry-run verified exact controller invocation and 0/1/2/3 routing without mutation. The live run produced the remote evidence table above. No fixture or injected command substituted for either GitHub lifecycle.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | At `3fac2afd3e9fe49afa95585b02d9bf3c250f7eca`, `cd scripts && npm test -- --runInBand`: 44 suites passed, 599 tests passed, 2 expected skips |
| Current-spec regression | Pass | `current-specs.test.mjs`: 6/6 passed within the fresh exact-head full suite |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: 43 items mapped |
| OMP plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository` |
| Skill creator validation | Pass | Verify worker read `skill://skill-creator`; workflow bundle itself was not edited by verification |
| Git hygiene | Pass | `git diff --check` passed before report update; final check rerun before commit |
| Live GitHub/Herdr smoke | Pass | Two fresh real issue lifecycles, exact heads, merges, closures, and validated deliver handoffs |

**Gate Summary**: 7/7 gates passed, 0 failed, 0 incomplete

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| Medium | Contract | `references/rewrite-contract.json`, `references/rewrite-contract.md`, `scripts/verify-current-specs.mjs` | Active `workflows/simplify/` lacked a workflow-to-capability mapping | Mapped simplify to its existing capability and live workflow source | `skill-creator` for shared reference; direct for validator registry |
| High | Error Handling | `scripts/sdlc-deliver.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs` | Live merged-PR reconciliation rejected `gh pr checks --required` exit 1 with the exact valid `no required checks reported ...` response | Treat only that exact response as an empty required-check set; preserve fail-closed handling for every other empty/error response; add regression coverage | `direct` |
| High | Versioning | `scripts/sdlc-deliver.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`, `requirements.md` | Substring matching treated issue #195's prose about the BREAKING gate as a breaking declaration | Require case-insensitive `BREAKING:` at the start of the title or a body line; cover the exact self-referential body and genuine title/body declarations | Fresh delegated scoped review: passed, zero actionable findings |
| High | Error Handling | `scripts/sdlc-deliver.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs` | Live PR #263 returned the valid GitHub CLI response `no checks reported on the '<branch>' branch`, which the earlier exact parser rejected | Accept only the two exact empty-check stderr forms on exit 1 with empty stdout; preserve fail-closed handling otherwise; cover both forms | Fresh delegated scoped review: passed, zero actionable findings |

## Remaining Issues

None.

---

## Herdr Cleanup Evidence

After both remote lifecycles and local handoff artifacts were preserved, the verification run enumerated every remaining pane in workspace `w6` whose cwd was `/private/tmp/nmg-sdlc-195-smoke-4aQnji`. Only verification-created panes `w6:p9G` and `w6:p99` remained. Both were closed. A second `herdr pane list --workspace w6` query returned `remaining: 0` for that cwd. No tab was created by this verification run, so no tab required closure. The main pane/tab and every unrelated pre-existing pane/tab were preserved.

---

## Positive Observations

- Delivery classification and verification readiness are reused rather than forked.
- Every controller command is injectable and uses explicit argv arrays.
- Head changes force reclassification before guarded merge.
- Branch cleanup occurs only after refreshed MERGED+CLOSED proof.
- Green delivery prompts omit unconditional review-remediation content.
- Live verification found and closed a real merged-resume edge case without weakening fail-closed behavior.

---

## Recommendations Summary

### Before PR (Must)

None.

### Short Term (Should)

None.

### Long Term (Could)

None.

---

## Recommendation

**Ready for PR.** All local, architectural, workflow, test, and mandatory two-issue live GitHub/Herdr obligations pass. Verification-created Herdr panes were cleaned up after evidence preservation.
