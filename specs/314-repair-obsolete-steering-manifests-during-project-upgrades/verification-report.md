# Verification Report: Repair obsolete steering manifests during project upgrades

**Date**: 2026-08-31
**Issue**: #314
**Reviewer**: Codex
**Scope**: Implementation verification against the approved specification

---

## Executive Summary

The implementation satisfies AC1–AC5. Current-layout manifests containing the obsolete `byteBound` snippet field now produce a read-only, digest-bound, manifest-only upgrade plan. Approved application removes only `byteBound`, preserves canonical registrations and project-owned content, restores strict runtime loading, and remains fail closed for additional unknown fields or stale evidence. Installation guidance now requires `/sdlc-upgrade-project` after every install or update. All mandatory local, steering, smoke, plugin-surface, focused regression, and hygiene gates pass.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5.0 |
| Architecture (SOLID) | 5.0 |
| Security | 5.0 |
| Performance | 5.0 |
| Testability | 5.0 |
| Error Handling | 4.0 |
| **Overall** | **4.8** |

### Implementation Status: Pass

**Total Issues**: 0.

## Issue Scope

- Active issue: #314
- Spec: `specs/314-repair-obsolete-steering-manifests-during-project-upgrades`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5]; FR [FR1, FR2, FR3, FR4, FR5, FR6]; tasks [T001, T002, T003]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":314,"specPath":"specs/314-repair-obsolete-steering-manifests-during-project-upgrades","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required
- Delivery version artifacts: Pass; `VERSION` and `package.json` are synchronized at `3.20.4` by the deterministic delivery controller.

## Deterministic Steering Artifact and Ceiling

- Artifact: `.omp/sdlc/verification/314.json`
- Controller run: `9ae60657-5078-47d0-b413-d4649fd89e43`
- Identity head: `5ac558bda3f41b62a66f95ebe66eff71cf7e6244`
- Coverage: 2 declared, 2 recorded, 0 missing, 0 duplicate, 0 unknown; complete
- Ceiling: none
- `repository.tests`: passed; 49 suites passed, 1 skipped; 789 tests passed, 2 skipped
- `repository.nmg-sdlc-smoke`: passed; `/sdlc-status --json` returned `nextAction.command: "/sdlc-draft-issue"`

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Detect obsolete current-layout manifests without mutation | Pass | `scripts/sdlc-upgrade.mjs:666-707`; byte-for-byte detection assertions in `scripts/__tests__/sdlc-upgrade.test.mjs:579-611` |
| AC2 | Remove only `byteBound`, preserve registrations and files, reject stale plans | Pass | Candidate plan at `scripts/sdlc-upgrade.mjs:672-698`; apply and preservation assertions at `scripts/__tests__/sdlc-upgrade.test.mjs:613-632`; stale digest rejection at `scripts/__tests__/sdlc-upgrade.test.mjs:647-657` |
| AC3 | Restore prompt-fragment loading after repair | Pass | `loadSteeringRuntime` and `projectPromptFragments` assertions at `scripts/__tests__/sdlc-upgrade.test.mjs:613-632` |
| AC4 | Require project upgrade after every install or update | Pass | Guidance at `README.md:39`; exact public contract assertions at `scripts/__tests__/steering-contract.test.mjs:89-94` |
| AC5 | Keep runtime strict and reject partial repair with another unknown field | Pass | Strict canonicalization at `scripts/sdlc-upgrade.mjs:672-679`; unknown-field and no-mutation assertions at `scripts/__tests__/sdlc-upgrade.test.mjs:634-645` |

## Regression Obligations

The implicit single-issue resolver assigns the complete inventory to delivery and no identifiers to a separate regression inventory. Existing strict runtime validation, legacy Markdown migration, staged apply, and stale-plan behavior remain covered and pass.

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Detect and repair obsolete current-layout manifests | Complete | Digest-bound manifest-only update uses strict canonicalization and the existing staged writer. |
| T002 | Add regression and documentation contracts | Complete | Detection, apply, preservation, runtime recovery, idempotence, strict rejection, stale evidence, and README guidance are covered. |
| T003 | Verify focused and repository contracts | Complete | Focused Jest, complete Jest, plugin surface, live smoke, and BDD mapping pass. |

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Detection constructs the approved plan; mutation remains in the steering writer. |
| Open/Closed | 5 | Existing schema, digest, and staged-apply extension points are reused. |
| Liskov Substitution | 5 | No subtype or substitutability contract changes. |
| Interface Segregation | 5 | The helper consumes only the manifest and steering primitives required by this repair. |
| Dependency Inversion | 5 | Safety remains delegated to `canonicalSnippetRecord`, `steeringSourceDigest`, and `applySteeringRuntime`. |

**SOLID score**: 5.0/5.0

### Layer Separation and Dependency Flow

Detection remains in `scripts/sdlc-upgrade.mjs`; schema authority and staged mutation remain in `scripts/sdlc-steering.mjs`. Ordinary runtime loading remains strict. No compatibility alias, command-time mutation, or second writer was introduced.

## Security Assessment

**Score**: 5.0/5.0

- Every repaired record passes the strict canonical schema; an additional unknown field fails closed.
- The complete steering source digest binds approval and prevents stale-plan mutation.
- Candidate runtime validation and existing path/symlink boundaries run before live replacement.
- The change adds no shell interpolation, secret handling, network write, or broadened file scope.

## Performance Assessment

**Score**: 5.0/5.0

The detector performs one bounded snippet scan and computes the steering digest only when a repairable field exists. It adds no repeated hot-path I/O, network operation, retry loop, unbounded collection, or dependency.

## Testability and Coverage

**Score**: 5.0/5.0

| Acceptance Criterion | Scenario | Behavioral Evidence | Result |
|---------------------|----------|---------------------|--------|
| AC1 | SCN001 | Non-mutating detection fixture | Pass |
| AC2 | SCN002 | Exact repair, preservation, repeat detection, and stale plan | Pass |
| AC3 | SCN003 | Runtime and prompt fragments load after apply | Pass |
| AC4 | SCN004 | Exact README installation contract | Pass |
| AC5 | SCN005 | Unknown field and stale digest fail closed without mutation | Pass |

- BDD mapping: 5/5 ACs map one-to-one to SCN001–SCN005.
- Focused execution: 2 suites, 32 tests passed.
- Complete execution: 49 suites and 789 tests passed; 1 suite and 2 tests skipped as declared repository behavior.
- Plugin surface: `node scripts/verify-plugin-surface.mjs --root . --label repository` passed.
- Git hygiene: `git diff --check main...HEAD` passed.

## Error Handling Assessment

**Score**: 4.0/5.0

Required failures remain stable and fail closed: an additional unknown snippet key raises `steering_manifest_unknown_key`, stale approval raises `steering_plan_stale`, and staged application preserves existing reason-coded failures. The repository uses machine-readable reason codes rather than a typed error hierarchy; no new error-handling defect was found.

## Real Smoke Lifecycle Evidence

| Field | Evidence |
|-------|----------|
| Provider | `repository.nmg-sdlc-smoke` |
| Repository | `https://github.com/Nunley-Media-Group/nmg-sdlc-smoke` |
| Method | Disposable clone; `exercise-omp /sdlc-status --json` with this checkout loaded |
| Result | Pass |
| Observable contract | `nextAction.command` is `/sdlc-draft-issue` |
| Mutation | Read-only; no smoke-repository issue, branch, PR, or comment created |

No `workflows/` or `agents/` file changed, so an issue-specific live workflow exercise was not applicable. The changed upgrade script is exercised through disposable deterministic fixtures.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` | Pass | `npm test -- --runInBand` exited 0; 49 suites and 789 tests passed |
| `repository.nmg-sdlc-smoke` | Pass | Live `/sdlc-status --json` returned a valid `/sdlc-` next action |
| Focused regression | Pass | `sdlc-upgrade.test.mjs` and `steering-contract.test.mjs`: 32/32 tests passed |
| Plugin surface | Pass | Repository plugin-surface validation passed |
| Git hygiene | Pass | `git diff --check main...HEAD` exited 0 |

**Gate Summary**: 5/5 passed, 0 failed, 0 incomplete. Manifest coverage is complete and imposes no ceiling.

## Fixes Applied

None during this verification run. The implementation branch already contains the corrected README contract wording.

## Remaining Issues

None.

## Positive Observations

- The migration removes only the known obsolete key and immediately reuses strict canonical validation.
- Approval binds to the complete steering tree rather than only the manifest.
- Detection remains read-only and apply remains staged at the existing ownership boundary.
- Tests verify semantic preservation and byte-identical project-owned bodies.
- The public README requirement is locked by an exact contract test.

## Files Reviewed

| File | Findings | Notes |
|------|----------|-------|
| `scripts/sdlc-upgrade.mjs` | 0 | Satisfies the locked repair contract. |
| `scripts/__tests__/sdlc-upgrade.test.mjs` | 0 | Covers detection, apply, recovery, strict rejection, idempotence, and stale evidence. |
| `README.md` | 0 | Requires upgrade after every install or update and before other workflows. |
| `scripts/__tests__/steering-contract.test.mjs` | 0 | Locks the required installation guidance. |

## Recommendation

**Ready for delivery.**

All approved local obligations and mandatory deterministic gates pass. No PR-only evidence is required by this specification.
