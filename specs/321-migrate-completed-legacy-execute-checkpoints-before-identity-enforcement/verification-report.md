# Verification Report: Migrate completed legacy execute checkpoints before identity enforcement

**Date**: 2026-08-29
**Issue**: #321
**Reviewer**: Codex
**Scope**: Implementation verification against the approved issue specification

## Implementation Status: **PR Evidence Pending**

## Executive Summary

The implementation satisfies every local acceptance criterion after one verification fix. Fully unbound terminal legacy checkpoints are classified separately from bound checkpoints, cleaned through the existing bounded runtime path with an exact byte guard, and followed by normal fresh identity creation. Partial identity, nonterminal state, stale bytes, locks, unsafe links, ownership conflicts, and bound identity drift remain fail-closed.

Local focused and repository suites pass. Deterministic steering coverage is complete with both required validations passing and no ceiling. The remaining bounded evidence is the pull-request-only checkpoint-portability matrix on native Ubuntu, macOS, and Windows runners; therefore the overall status is `PR Evidence Pending`, not `Pass`.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Architecture Average** | **4.8** |

## Deterministic Steering Artifact and Ceiling

- Artifact: `.omp/sdlc/verification/321.json`
- Generated: `2026-08-29T07:42:04.424Z`
- Head SHA: `b542cfe11a5f3bc27dda95544245ee6e856e9159`
- Dirty diff hash covering the verification fix: `sha256:3d5ee19bfc741785acc3e1b99440b87e0ec82ba603fd5ed9a600feeec52c74c1`
- Spec hash: `sha256:8f35148f7772d06df70721ca06f5fa09046d3f7ae620329e3de87adfb4d1f957`
- Steering hash: `sha256:2174195cc06e46f1c32c7642068f0d91a2c79827447bd6aed47073cbac05e98f`
- Coverage: declared 2, recorded 2, complete `true`; no missing, duplicate, or unknown results
- Ceiling: none

## Issue Scope

- Active issue: #321
- Spec: `specs/321-migrate-completed-legacy-execute-checkpoints-before-identity-enforcement`
- Manifest: implicit single issue; no `issue-scope.json` required
- Resolver status: `implicit_single_issue` (`singular_defect_scope`)
- Delivery: AC [AC1, AC2, AC3, AC4, AC5]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8]; tasks [T001, T002, T003, T004, T005]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":321,"specPath":"specs/321-migrate-completed-legacy-execute-checkpoints-before-identity-enforcement","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8"],"tasks":["T001","T002","T003","T004","T005"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->
<!-- nmg-sdlc-pr-readiness: {"schemaVersion":1,"state":"pr_evidence_pending","issueNumber":321,"specPath":"specs/321-migrate-completed-legacy-execute-checkpoints-before-identity-enforcement","local":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8"],"tasks":["T001","T002","T003","T004","T005"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005"],"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]},"tests":"pass","steeringGates":"pass"},"pendingEvidence":[{"kind":"check_run","name":"Checkpoint portability (ubuntu-latest)","event":"pull_request","acceptanceCriteria":["AC4","AC5"]},{"kind":"check_run","name":"Checkpoint portability (macos-latest)","event":"pull_request","acceptanceCriteria":["AC4","AC5"]},{"kind":"check_run","name":"Checkpoint portability (windows-latest)","event":"pull_request","acceptanceCriteria":["AC4","AC5"]}]} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Pending — exact `pull_request` check runs `Checkpoint portability (ubuntu-latest)`, `Checkpoint portability (macos-latest)`, and `Checkpoint portability (windows-latest)`
- No implementation PR exists yet; PR #322 is the merged specification-approval PR and is not implementation evidence.

## Acceptance Criteria

- [x] **AC1 — Pass**: `legacyCompletedRunState` requires terminal schema-version-1 state and zero identity properties; different-list startup performs byte-guarded cleanup and normal fresh-run initialization. The issue-6 → issue-19 test verifies exact owned artifact cleanup, unrelated-runtime retention, fresh canonical identity, worker start, and no identity-mismatch output (`scripts/sdlc-execute.mjs:581-688`, `scripts/sdlc-execute.mjs:1469-1494`, `scripts/__tests__/sdlc-execute.test.mjs:1514-1576`).
- [x] **AC2 — Pass**: all 62 non-empty proper identity subsets across LF/CRLF and POSIX/Windows path-form data return exact mismatch, preserve checkpoint bytes/supporting runtime, and start no worker. Incomplete, active, failed, remediating, malformed, and missing-completion fixtures cover the remaining rejected shapes (`scripts/__tests__/sdlc-execute.test.mjs:1578-1683`).
- [x] **AC3 — Pass**: cleanup validates canonical runtime directories, acquires an exclusive lock, compares exact checkpoint bytes under lock, revalidates state, deletes only owned paths, and preserves bound identity/CAS checks. Verification fixed the startup catch boundary so eligible cleanup failures surface `completed_cleanup_failed`; an integration assertion now covers the held-lock path (`scripts/sdlc-execute.mjs:606-688`, `scripts/sdlc-execute.mjs:1480-1493`, `scripts/__tests__/sdlc-execute.test.mjs:1685-1734`).
- [x] **AC4 — Local Pass / PR evidence pending**: deterministic LF/CRLF × POSIX/Windows path-form classification passes locally, native canonical identity is asserted, and the workflow declares an explicit Node/Jest matrix for Ubuntu, macOS, and Windows (`scripts/__tests__/sdlc-execute.test.mjs:1514-1622`, `.github/workflows/nmg-sdlc-verify.yml:46-73`). Native runner conclusions await the implementation PR.
- [x] **AC5 — Local Pass / PR evidence pending**: local macOS coverage proves link, lock, stale-byte, deletion, lease, revision, branch, and head boundaries. The native matrix includes mandatory Windows junction behavior and privilege-qualified Windows symlink behavior. Ubuntu and Windows runner conclusions await the implementation PR.

## Regression Obligations

The normalized active scope contains no separately adopted regression identifiers. Existing bound completed cleanup, legacy same-list binding, CAS identity enforcement, exact artifact ownership, and different-list mismatch tests remain passing in the focused 188-test suite.

## Task Validation

- [x] **T001**: identity fields are declared once; any identity own property is distinguished from complete valid identity; strict fully unbound terminal classification is implemented.
- [x] **T002**: different-list migration, exact-byte cleanup, canonical path safety, exclusive locking, exact owned deletion, fresh identity creation, and cleanup-failure signaling are implemented.
- [x] **T003**: deterministic issue-6 migration, 62-subset, newline/path-form, unsafe-state, link/junction, lease, CAS, and cleanup-failure regressions exist and pass locally.
- [x] **T004**: `.github/workflows/nmg-sdlc-verify.yml` adds the dedicated three-OS Node 20 matrix and explicit JavaScript Jest entrypoint without changing the existing verify job's purpose.
- [x] **T005 local obligations**: focused suite, full suite, plugin-surface verification, steering tests, and consumer smoke pass. Hosted matrix evidence remains the declared PR-only obligation.

## Architecture Review

| Area | Score | Findings |
|------|-------|----------|
| SOLID Principles | 4/5 | The change keeps classification, checkpoint reading, and cleanup in narrow helpers and reuses the established fresh-run path. `scripts/sdlc-execute.mjs` remains a large controller module, but this change does not add a second convention or broaden its responsibility. |
| Security | 5/5 | Identity subsets fail closed; canonical-root confinement, `lstatSync` link rejection, exclusive `wx` locking, exact byte comparison, owned-path deletion, and foreign lease preservation prevent traversal, race, and ownership bypasses. No shell interpolation or untrusted executable construction was added. |
| Performance | 5/5 | Startup performs bounded reads and scans over the fixed eight-step set and issue list. Byte comparison is linear in one bounded checkpoint file; no polling, unbounded traversal, or avoidable repeated hot-path work was introduced. |
| Testability | 5/5 | Pure predicates and injected controller adapters support deterministic filesystem fixtures. The suite covers positive, negative, race, identity, ownership, newline, path-form, and native-link boundaries with stable observable assertions. |
| Error Handling | 5/5 | Classification mismatch and post-classification cleanup failure now have distinct stable diagnostics. Cleanup normalizes internal failures to `completed_cleanup_failed`, preserves diagnostic state where safe, and blocks fresh-run creation. |

**Architecture average**: 4.8/5

## Test Results

| Command / Evidence | Result | Summary |
|--------------------|--------|---------|
| `cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs` | Pass | 1 suite, 188 tests passed, 0 failed |
| `cd scripts && npm test` | Pass | 49 suites passed, 1 suite skipped by its existing applicability contract; 718 tests passed, 2 skipped, 0 failed |
| `node scripts/verify-plugin-surface.mjs --root . --label repository` | Pass | `Plugin surface validation passed: repository` |
| `git diff --check` | Pass | No whitespace errors |
| Deterministic steering `repository.tests` | Pass | `npm test -- --runInBand` exited 0 against dirty diff hash `sha256:3d5e…74c1` |
| Deterministic steering `repository.nmg-sdlc-smoke` | Pass | Disposable consumer smoke returned JSON with `nextAction.command` `/sdlc-draft-issue` |
| Native checkpoint-portability matrix | Pending | PR-only Ubuntu, macOS, and Windows check runs do not exist before implementation PR creation |

### BDD Coverage

- Scenarios: 5/5 represented by Jest evidence (`SCN001`–`SCN005`).
- Step definitions: exercised through deterministic Jest controller/filesystem fixtures rather than a separate Gherkin runner.
- Local execution: Pass.
- Native-host completion: macOS local evidence is present; exact Ubuntu and Windows hosted evidence is pending.

### Real Smoke Lifecycle Evidence

No workflow or agent bundle changed, so the changed-skill disposable exercise branch is not applicable. The mandatory consumer-project smoke ran through the deterministic steering provider using `exercise-omp` against `Nunley-Media-Group/nmg-sdlc-smoke`; it exited successfully and produced `/sdlc-draft-issue` as the next `/sdlc-*` command.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` | Pass | Required built-in command provider; effective status `passed`; command exited 0 |
| `repository.nmg-sdlc-smoke` | Pass | Required consumer smoke provider; effective status `passed`; `/sdlc-status --json` returned next action `/sdlc-draft-issue` |

**Gate Summary**: 2/2 passed; 0 failed; 0 incomplete; coverage complete; no ceiling.

## Fixes Applied

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| High | Error handling / acceptance | `scripts/sdlc-execute.mjs:1487-1492` | Different-list startup converted every eligible cleanup failure to `Run checkpoint identity mismatch`, violating AC3/FR4/SCN003. | Preserved `cleanupCompletedRun`'s `completed_cleanup_failed` diagnostic at the controller boundary. | `direct` |
| High | Regression coverage | `scripts/__tests__/sdlc-execute.test.mjs:1708-1734`, `scripts/__tests__/sdlc-execute.test.mjs:1839` | Cleanup-boundary tests did not assert the legacy startup integration diagnostic, and an existing bound cleanup test expected the obsolete mismatch result. | Added the held-lock legacy startup integration assertion and updated the bound cleanup expectation. | `direct` |

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| External evidence | Native portability | GitHub Actions implementation PR | Ubuntu, macOS, and Windows checkpoint-portability check conclusions are not yet available. | These `pull_request` check runs cannot exist before the controlled implementation PR is created. |

## Overall Status

**PR Evidence Pending**

All local implementation, architecture, test, smoke, and deterministic steering obligations pass. The only remaining evidence is the exact three-OS pull-request checkpoint-portability matrix declared above.

## Recommendation

Ready for controlled draft PR evidence collection. Do not mark verification `Pass` until all three exact native checkpoint-portability check runs succeed for the same implementation head.