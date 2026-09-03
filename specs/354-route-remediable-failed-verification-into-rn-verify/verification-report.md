# Verification Report: Route remediable failed verification into rN-verify

**Date**: 2026-09-03
**Issue**: #354
**Reviewer**: Codex
**Scope**: Implementation verification against approved specification

---

## Executive Summary

Issue #354 passes its approved delivery contract after three verification-remediation findings were fixed. Fail and Partial reports now produce remediable non-intervention verify handoffs. The mutable smoke gate no longer recurses inside its owned verify worker. Execute now excludes explicitly foreign-project agents from worker matching and continues observing visible work when Herdr transiently reports idle or done. The full repository suite passed with 858 tests, deterministic steering coverage is complete, and the live smoke delivered issue #71 through merged PR #73 with exact invocation-owned proof.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **5.0** |

### Implementation Status: **Pass**

**Total Issues**: 0 remaining

## Deterministic Steering Artifact and Ceiling

- Artifact: `.omp/sdlc/verification/354.json`
- Generated: `2026-09-03T16:11:54.436Z`
- Identity head: `b2d2d6503816f8dc82c79dbffe1557a226e3a6a6`
- Coverage: declared `2`, recorded `2`, complete `true`; missing `[]`, duplicate `[]`, unknown `[]`
- Artifact ceiling: none
- `repository.tests`: Pass — `npm test -- --runInBand` exited 0; 50 suites passed, 1 skipped; 858 tests passed, 2 skipped
- `repository.nmg-sdlc-smoke`: Pass — delivered smoke issue #71 through merged PR #73 at exact head `7193fb5a5d3aaeb344900eb84b7afb76fe9d9ec1`

## Issue Scope

- Active issue: #354
- Spec: `specs/354-route-remediable-failed-verification-into-rn-verify`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7]; tasks [T001, T002, T003, T004, T005, T006]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":354,"specPath":"specs/354-route-remediable-failed-verification-into-rn-verify","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7"],"tasks":["T001","T002","T003","T004","T005","T006"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required for issue #354
- Required mutable smoke gate: Pass with current-invocation proof
- Readiness marker: not required

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Fail or Partial verification produces a failed non-intervention verify handoff and enters exactly one fresh `rN-verify` session | Pass | `scripts/sdlc-finalize-verification.mjs:81-91`; finalizer and execute regression suites |
| AC2 | Incomplete and controller blockers remain intervention and do not start remediation | Pass | `scripts/sdlc-finalize-verification.mjs:81-91`; Incomplete, missing-status, publish, unsafe-report, and lease fixtures |
| AC3 | Passed verification still advances to delivery without remediation | Pass | Passed finalizer fixtures and complete live smoke lifecycle |
| AC4 | Remediation preserves original verify identity and does not create a second `sN-verify` worker | Pass | Existing `r42-verify` topology and handoff-transfer fixtures in `scripts/__tests__/sdlc-execute.test.mjs` |
| AC5 | Smoke-owned verification does not recurse | Pass | `scripts/sdlc-execute.mjs:83-86`; `steering/extensions/nmg-sdlc-smoke.mjs:238-240`; live issue #71 completed through delivery |
| AC6 | Foreign same-number workers do not block the active project | Pass | `scripts/sdlc-execute.mjs:1032-1042,2163`; regression at `scripts/__tests__/sdlc-execute.test.mjs:4827` |
| AC7 | Visible work survives stale idle/done observations | Pass | `scripts/sdlc-execute.mjs:391-400`; regression at `scripts/__tests__/sdlc-execute.test.mjs:3696`; live smoke advanced through all workers |

## Functional Requirements

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | Fail/Partial classification uses retained readiness fields and emits `intervention: false`. |
| FR2 | Pass | Existing remediation predicate consumes the finalizer-produced verify handoff without changing step identity. |
| FR3 | Pass | Incomplete, unverifiable, publish, unsafe-report, and lease paths retain fail-closed intervention behavior. |
| FR4 | Pass | Passed finalization retains report artifact and `next: deliver`. |
| FR5 | Pass | Ownership is forwarded only to verify and deliver; nested verification returns Pass without starting another smoke controller. |
| FR6 | Pass | Initial agent discovery is scoped by canonical active-project cwd before starter/remediation matching. |
| FR7 | Pass | Visible `Working` detection resets the terminal-observation latch; normal terminal classification resumes when visible work ends. |

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Make Fail/Partial verify handoffs remediable | Complete | Finalizer writes the approved handoff shape. |
| T002 | Add finalize regression coverage | Complete | Fail, Partial, Incomplete, invalid, publish, pass, idle, and done boundaries are covered. |
| T003 | Confirm existing rem and pass paths | Complete | Focused and full suites pass. |
| T004 | Prevent nested mutable-smoke recursion | Complete | Ownership guard and exact pane environment propagation are covered. |
| T005 | Scope execute worker discovery to the active project | Complete | Foreign-cwd worker fixture passes without weakening same-project checks. |
| T006 | Preserve visibly active workers across stale idle state | Complete | The regression delays a handoff beyond two stale-idle observations and proves no prompt resubmission. |

## Regression Obligations

| Related Contract | Status | Evidence |
|------------------|--------|----------|
| #259 failed verify starts same-step remediation | Pass | `isRemediableFailedHandoff` and `REMEDIABLE_STEPS` remain unchanged; focused execute suite passes. |
| #259 intervention blockers remain preserved | Pass | Incomplete and unverifiable finalizer outcomes remain intervention. |
| #259 one rem pane and original step identity | Pass | Existing `r42-verify` topology and handoff-transfer fixtures pass. |
| Worker prompt delivery remains exactly once | Pass | Stale-idle regression proves observation continues without resubmitting the prompt. |
| Same-project retained ownership remains fail-closed | Pass | Existing wrong-pane/project/run/issue/step/branch/head fixtures pass. |

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Readiness classifies evidence, finalization maps handoffs, smoke validates lifecycle proof, and execute owns worker observation. |
| Open/Closed | 5 | Existing handoff options, pane environment allowlist, and observation helpers were extended without parallel controller paths. |
| Liskov Substitution | 5 | Handoff schema and original `step: verify` identity remain stable. |
| Interface Segregation | 5 | Project scoping consumes only the Herdr cwd already present in agent records. |
| Dependency Inversion | 5 | Existing injected Herdr, runner, process, and filesystem seams remain available to tests. |

### Layer Separation

The implementation preserves dependency direction. `verification-readiness.mjs` supplies classification evidence; `sdlc-finalize-verification.mjs` emits the stable handoff; `steering/extensions/nmg-sdlc-smoke.mjs` validates the consumer lifecycle; `sdlc-execute.mjs` owns worker topology, identity, and observation.

### Dependency Flow

No new module or reverse dependency was introduced. The fixes reuse existing readiness data, agent cwd metadata, terminal detection, and smoke proof artifacts.

## Security Assessment

Score: **5/5**. The changes add no shell interpolation, secret propagation, path deletion, or new remote-write authority. Agent cwd comparison canonicalizes existing paths. The smoke ownership marker remains allowlisted to verify and deliver only, and the enclosing provider still requires exact pre-merge proof, merged PR, and closed issue.

## Performance Assessment

Score: **5/5**. Agent filtering is one bounded pass over the Herdr snapshot. Status reconciliation adds one existing terminal-detection read only when state is idle/done and the handoff is absent. No polling deadline, unbounded repository scan, or avoidable hot-path allocation was introduced.

## Testability Assessment

Score: **5/5**. Regression fixtures directly reproduce finalizer handoff classification, nested smoke ownership, foreign same-number agent collision, and stale idle with visible work. The live smoke exercises the complete controller path through merge and closure.

## Error Handling Assessment

Score: **5/5**. Explicit foreign cwd is excluded without adopting unknown workers. Cwd-less records retain existing fail-closed ownership checks. Visible work overrides only transient idle/done state; once activity disappears, the existing two-observation terminal rule resumes. Missing, invalid, failed, blocked, process-loss, publish, and lease outcomes retain stable classification.

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Executable Coverage | Passes |
|---------------------|-------------|---------------------|--------|
| AC1 / SCN001 | Yes | Finalizer plus execute controller fixtures | Yes |
| AC2 / SCN002 | Yes | Finalizer blockers plus controller preservation fixtures | Yes |
| AC3 / SCN003 | Yes | Passed finalizer and smoke delivery | Yes |
| AC4 / SCN004 | Yes | Execute remediation topology | Yes |
| AC5 / SCN005 | Yes | Smoke provider and pane environment fixtures plus live smoke | Yes |
| AC6 / SCN006 | Yes | Foreign-project agent fixture | Yes |
| AC7 / SCN007 | Yes | Stale-idle visible-work fixture plus live lifecycle | Yes |

### Test Results

| Command | Result | Evidence |
|---------|--------|----------|
| `npm test -- --runInBand __tests__/sdlc-execute.test.mjs` | Pass | 1 suite, 240 tests after both controller fixes |
| `npm test -- --runInBand` | Pass | 50 suites passed, 1 skipped; 858 tests passed, 2 skipped |
| `node scripts/skill-inventory-audit.mjs --check` | Pass | 43 items mapped |
| `node scripts/verify-plugin-surface.mjs --root . --label repository` | Pass | Repository plugin surface validated |
| `git diff --check` | Pass | No whitespace errors before remediation commits |

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `/sdlc-verify-code #354` |
| **Test Project** | Disposable `nmg-sdlc-exercise-354-*` project; removed after capture |
| **Exercise Method** | `node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/exercise-omp.mjs" --cwd <project> -- /sdlc-verify-code ...` |
| **Interactive gate handling** | N/A; automated command with explicit no-GitHub/no-finalization dry-run constraint |
| **Result** | State-based terminal classification `Incomplete`, expected for an implementation-free disposable fixture |

The exercise proved command-surface loading and fail-closed behavior. Repository tests and the current deterministic live smoke provide implementation and lifecycle evidence.

## Real Smoke Lifecycle Evidence

The passing invocation cloned `Nunley-Media-Group/nmg-sdlc-smoke` to `/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-smoke-Y56SOk`. Before execution, issue #71 was OPEN with an empty closing-PR baseline. The source controller ran the full queue once with `NMG_SDLC_SMOKE_OWNED=1`; nested verification completed without recursion. Delivery recorded pre-merge head `7193fb5a5d3aaeb344900eb84b7afb76fe9d9ec1`. GitHub then reported issue #71 CLOSED and new PR #73 MERGED at that exact head. `.omp/sdlc/verification/354.json` binds the baseline, controller execution, closing-PR proof, exact head, PR URL, and issue state to this invocation.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` | Pass | `.omp/sdlc/verification/354.json`: command exited 0; 858 passed, 2 skipped |
| `repository.nmg-sdlc-smoke` | Pass | `.omp/sdlc/verification/354.json`: issue #71 CLOSED; PR #73 MERGED at exact recorded head |

**Gate Summary**: 2/2 passed, 0 failed, 0 incomplete. Coverage is complete and no ceiling applies.

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| High | Verification finalization | `scripts/sdlc-finalize-verification.mjs` | Fail/Partial reports were always intervention and could not enter `rN-verify`. | Emit failed non-intervention verify handoffs only for remediable Fail/Partial implementation outcomes. | `direct` |
| High | Generated command synchronization | `commands/sdlc-verify-code.md` | Generated verify command retained obsolete intervention wording. | Synchronized it with the approved workflow contract. | `direct` |
| High | Smoke orchestration | `steering/extensions/nmg-sdlc-smoke.mjs`, `scripts/sdlc-execute.mjs` | Nested verification recursively ran the mutable smoke and consumed delivery before enclosing proof capture. | Forward scoped ownership to verify/deliver and satisfy nested smoke locally while enclosing proof remains mandatory. | `direct` |
| High | Worker identity | `scripts/sdlc-execute.mjs:1032-1042,2163` | A foreign `s71-implement` blocked a fresh clone at `start` with `retained_worker_mismatch`. | Scope the initial Herdr agent snapshot to the active project's canonical cwd. | `direct` |
| High | Worker observation | `scripts/sdlc-execute.mjs:391-400` | Stale idle from an internal advisory completion closed `s71-implement` while primary tool activity continued. | Reset terminal observation while detection explicitly shows `Working`; consume the eventual handoff without resubmission. | `direct` |

## Remaining Issues

None.

## Positive Observations

- Remediation kept the original `verify` handoff identity; no rem-step identity leaked.
- The controller retained existing same-project ownership checks and stable reason codes.
- The smoke provider proved exact current-invocation delivery rather than accepting pre-existing remote state.
- Focused fixtures reproduced both verification-time controller failures before the live smoke passed.

## Recommendations Summary

### Before Delivery (Must)

- [x] All local acceptance criteria and regression obligations pass.
- [x] Both required steering gates pass with complete coverage.
- [x] Live smoke issue #71 has exact merged-head and closure proof.

### Short Term (Should)

- None.

### Long Term (Could)

- None within issue #354 scope.

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-finalize-verification.mjs` | 0 | Implements remediable Fail/Partial handoff mapping. |
| `scripts/sdlc-execute.mjs` | 0 | Owns scoped worker discovery, observation, remediation, and pane environment. |
| `steering/extensions/nmg-sdlc-smoke.mjs` | 0 | Preserves enclosing exact-proof authority and blocks nested recursion. |
| `scripts/__tests__/sdlc-finalize-verification.test.mjs` | 0 | Covers remediable and intervention boundaries. |
| `scripts/__tests__/sdlc-execute.test.mjs` | 0 | Covers remediation topology, project scoping, stale state, and prompt invariants. |
| `scripts/__tests__/nmg-sdlc-smoke.test.mjs` | 0 | Covers ownership, proof, and provider failure classifications. |
| `workflows/verify-code/WORKFLOW.md` | 0 | Matches approved worker contract. |
| `commands/sdlc-verify-code.md` | 0 | Synchronized generated command. |
| `steering/manifest.json` and registered runtime | 0 | Both required gates passed. |

## Recommendation

**Ready for delivery**

All approved acceptance criteria pass. Deterministic steering coverage is complete, the repository suite is green, and the required mutable smoke produced exact current-invocation merge and closure proof.
