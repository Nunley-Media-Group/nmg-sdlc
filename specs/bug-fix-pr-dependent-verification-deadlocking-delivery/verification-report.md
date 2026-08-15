# Verification Report: Fix PR-Dependent Verification Deadlocking Delivery

**Date**: 2026-08-14
**Issue**: #171
**Reviewer**: Codex
**Scope**: Defect-fix verification against the active issue slice

---

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

**Verification Path**: defect fix
**Total Issues**: 0
**Review Findings Fixed**: 19/19

The circular verification-to-delivery dependency no longer exists in the contract. A shared fail-closed validator distinguishes ordinary Pass, qualified PR evidence pending, exact-head satisfied evidence, blocked reports, and unverifiable reports. Status consumes the same classification, and open-pr owns a controlled draft H1/H2 transition without relaxing the ordinary delivery or merge gates.

## Issue Scope

- Active issue: #171
- Spec: `specs/bug-fix-pr-dependent-verification-deadlocking-delivery`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10]; FR [FR1, FR2, FR3, FR4, FR5, FR6]; tasks [T001, T002, T003, T004, T005, T006]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008, SCN009, SCN010]
- Regression: AC [none]; FR [none]; scenarios [none]

<!-- nmg-sdlc-issue-scope: {"issueNumber":171,"specPath":"specs/bug-fix-pr-dependent-verification-deadlocking-delivery","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004","T005","T006"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required for this defect's implementation proof

This is an ordinary Pass report. It intentionally carries no `nmg-sdlc-pr-readiness` marker.

## Reproduction Check

| Observation | Result | Evidence |
|-------------|--------|----------|
| Before | Reproduced contractually: generic non-Pass verification could not enter open-pr, while the missing GitHub evidence required a PR. | Issue #171 reproduction and root-cause analysis |
| After | Qualified local completion enters only a controlled draft path, gathers H1 evidence, reverifies, pushes the report to H2, rechecks H2, validates the final marker, and only then emits ready. | `scripts/__tests__/exercise-pr-dependent-delivery.test.mjs` and `scripts/__fixtures__/pr-dependent-verification/` |
| Fail-closed boundary | Pre-PR-capable checks, Partial, failed-gate, stale-scope, malformed, unknown-kind, stale-head, unchanged-H2, missing, failed, cancelled, and timed-out cases do not emit draft/ready or unsafe recovery actions. | Deterministic delivery exercise and validator unit cases |

## Acceptance Criteria Verification

| AC | Status | Evidence |
|----|--------|----------|
| AC1 | Pass | `scripts/verification-readiness.mjs` parses the distinct pending state and exact machine marker; verify-code documents the producer rules. |
| AC2 | Pass | Non-Pass statuses are blocked, local/gate failures invalidate readiness, and status/open-pr consume only validated data. |
| AC3 | Pass | The validator requires exact `event: pull_request` provenance for check evidence, intrinsically PR-only merge evidence, exact keys/mappings, and bounded files, arrays, names, and URLs; a push-event fixture fails closed. |
| AC4 | Pass | `scripts/sdlc-status.mjs` imports the shared validator, proves report freshness, emits `delivery-validation-pending`, separates local verification from PR evidence, and fails closed when open-PR draft state is unavailable. |
| AC5 | Pass | `skills/open-pr/references/pr-dependent-delivery.md` preserves every preflight gate and requires an exact open draft identity. |
| AC6 | Pass | H1 evidence requires the exact head, name, conclusion, link, AC mapping, and merge-blocking observation; missing and non-success states stop. |
| AC7 | Pass | The controlled flow reruns verify-code for H1, safely pushes a changed report, captures distinct H2, rejects H1 evidence for H2, and resumes an exact satisfied draft at H2 after a preserved failure. |
| AC8 | Pass | The public CLI validates the re-fetched final H2 body before `gh pr ready`; existing automated review, checks, mergeability, CLEAN state, merge choice, and cleanup remain in force. |
| AC9 | Pass | Every controlled-flow failure preserves the feature branch and draft and forbids ready, merge, checkout, deletion, false Pass, and protection mutation. |
| AC10 | Pass | PathCast #122, ordinary Pass, pre-PR-capable checks, generic blockers, configurable exact H1/H2 success, retry, and failure variants are deterministic fixtures. |

## Functional Requirements Verification

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | One shared schema/reference/helper is consumed by verify-code, status, and open-pr. |
| FR2 | Pass | Exact scope/local evidence, allowlists, bounds, and stable validator results are unit-tested. |
| FR3 | Pass | Generic non-Pass, stale, malformed, failed/incomplete, and mismatched evidence remains blocked. |
| FR4 | Pass | The controlled draft contract and state exercise cover draft creation/reuse, H1, reverification, report push, H2, final marker, and ready. |
| FR5 | Pass | Status remains read-only and exposes draft/head/merge/check metadata plus the pending-delivery stage. |
| FR6 | Pass | Contract, status, delivery, exercise, skill-runner, README, and inventory evidence are present and green. |

## Task Completion

| Task | Status | Evidence |
|------|--------|----------|
| T001 | Complete | Shared reference, validator, CLI, and validator tests |
| T002 | Complete | Verify-code skill, report reference, and report scaffold |
| T003 | Complete | Read-only status consumer and status tests |
| T004 | Complete | Controlled open-pr reference and contract tests |
| T005 | Complete | PathCast-style fixtures, skill exercises, README, and inspected baseline refresh |
| T006 | Complete | Complete verification gates and this issue-scoped report |

## Regression Obligations

No prior acceptance criteria, functional requirements, or scenarios are declared as active regression obligations for this singular defect. Related feature specs were used as bounded architecture and compatibility context; their ordinary Pass delivery behavior is pinned by the companion fixtures and existing open-pr tests.

## Architecture and Blast-Radius Assessment

| Area | Score | Assessment |
|------|-------|------------|
| Single responsibility | 5 | The zero-dependency helper owns marker classification; status owns observation; open-pr owns remote transition instructions. |
| Dependency direction | 5 | Status imports the shared helper; prompt consumers point to the shared reference rather than defining competing schemas. |
| Public contract | 5 | Changes are additive: ordinary Pass remains unchanged and JSON status gains additive readiness/PR metadata. |
| Security | 5 | Exact keys, identifiers, paths, sizes, schemes, symlink rejection, bounded arrays, safe argument arrays, and no report-content execution. |
| Performance | 5 | Local inspection is bounded; remote polling is capped at 60 attempts; evidence arrays and observations have explicit maxima. |
| Testability | 5 | Pure reusable exports, injected status adapters, deterministic fixtures, CLI exit-code tests, and independent failure matrices. |
| Error handling | 5 | Stable reason codes, named gaps, stdout/stderr separation, conservative unknown handling, and preservation-first remote failure paths. |

Blast radius is limited to verification reporting, lifecycle status, open-pr delivery prompting, deterministic exercises, public documentation, the skill inventory, and the approved release artifacts. `.codex-plugin/plugin.json`, `VERSION`, and `CHANGELOG.md` are synchronized at 2.0.8. There are no new dependencies, repository-protection changes, historical-spec rewrites, or consumer-product mutations.

## Test Coverage

- Active Gherkin scenarios: 10/10 mapped and covered.
- Focused impacted suites: 99/99 tests passing after final fixes.
- Complete Jest suite: 35 suites passing; 372 tests passing; 12 established conditional/opt-in tests skipped; 0 unexpected failures or orphaned imports.
- Syntax: all changed `.mjs` entrypoints pass `node --check`.
- Scope resolver: `implicit_single_issue`, exact AC/FR/task/scenario inventories, zero gaps.

## Exercise Test Results

| Skill / exercise | Result | Evidence |
|------------------|--------|----------|
| `verify-code` | Pass | 14 pass, 0 fail, 0 skipped |
| `status` | Pass | 14 pass, 0 fail, 0 skipped |
| `open-pr` | Pass | 15 pass, 0 fail, 0 skipped |
| PR-dependent state machine | Pass | Qualified H1/H2 becomes ready; all blockers preserve draft/branch and emit no unsafe action |

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | 35 suites / 372 tests passed; no unexpected skips or orphaned imports |
| Skill inventory | Pass | Clean; 462 items mapped after inspected pointer-contract refresh |
| Codex compatibility | Pass | `Codex compatibility check passed.` |
| Active plugin surface | Pass | Repository plugin surface validation passed |
| Skill creator validation | Pass | verify-code, status, and open-pr bundles all valid |
| Skill exercise | Pass | All three changed skills passed every deterministic and rubric check with zero skips |
| Prompt quality | Pass | Unambiguous steps, complete success/failure/resume paths, supported CLI commands, logical H1/H2 ordering, unchanged explicit gates, valid cross-references, and preserved historical boundaries |
| Git hygiene | Pass | `git diff --check` exited 0; diff contains only issue #171 implementation/spec/documentation evidence |

**Gate Summary**: 8/8 passed, 0 failed, 0 incomplete

## Fixes Applied During Verification

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| Medium | Security | `scripts/verification-readiness.mjs` | Symlink type was checked only after path resolution. | Reject the original report path when it is a symlink before resolving/reading it. | direct |
| Medium | Status safety | `scripts/sdlc-status.mjs` | Missing draft metadata could render as ready, and ready PR plus pending verification was not explicitly inconsistent. | Preserve unknown metadata, validate head shape, and fail closed on ready/pending conflict. | direct |
| Low | Test fidelity | `scripts/__tests__/exercise-pr-dependent-delivery.test.mjs` | Fixture used a nonexistent `gh pr checks --head` shorthand. | Model supported `gh pr view` head proof plus `gh pr checks --required --json`. | direct |
| Low | Prompt quality | `skills/verify-code/SKILL.md`, `skills/open-pr/SKILL.md` | Three existing reference pointers did not use the deterministic `Read ... when ...` grammar. | Normalize the pointers, register no-skip exercises, and refresh the inspected inventory baseline. | skill-creator |
| Low | Contract test | `scripts/__tests__/open-pr-delivery-contract.test.mjs` | Static assertion lagged the new current-report freshness requirement. | Pin the stricter `current valid pr_evidence_pending` wording. | direct |
| Major | Status safety | `scripts/sdlc-status.mjs`, `scripts/__tests__/sdlc-status.test.mjs` | Pending evidence with unknown open-PR draft state could fall through to `pull-request-open`. | Add a named fail-closed gap and exact manual-repair action for unavailable draft state. | direct |
| Major | Exercise integrity | `scripts/skill-exercise-runner.mjs`, runner tests | Missing ordered steps produced `indexOf() == -1` comparisons that could pass P2/P4/P5/P6; P6 accepted equal placeholders. | Require both steps to exist in order and require a concrete 40-character H2 SHA before equality. | direct |
| Major | Validator robustness | `scripts/verification-readiness.mjs`, validator tests | A non-string satisfied `headSha` could throw during case normalization. | Type-guard the SHA before comparison and pin non-throwing invalid-data behavior. | direct |
| Major | Delivery interface | validator CLI, open-pr controlled-delivery reference | Final-body validation existed only as an internal export, leaving no executable workflow command before ready. | Add bounded `--pr`, `--head`, and `--delivery-body-file` CLI validation and require its successful result before `gh pr ready`. | skill-creator + direct |
| Major | Retry safety | shared/open-pr contracts and delivery exercise | A pushed H1 report becomes satisfied, so an H2 failure could not re-enter the pending-only path. | Permit only the exact preserved satisfied draft to resume at H2 with refreshed identity/freshness/evidence checks and add an H2 failure-to-retry regression. | skill-creator + direct |
| Major | Evidence provenance | shared validator, verify-code/open-pr contracts, fixtures | An allowlisted check kind and AC mapping did not prove that the evidence was unavailable before PR creation. | Require exact `event: pull_request` identity, reject push/unknown events, and verify the observed event at H1/H2. | skill-creator + direct |
| Major | Release evidence | this report | Blast-radius text incorrectly claimed there were no version-artifact changes. | Record `.codex-plugin/plugin.json`, `VERSION`, and `CHANGELOG.md` synchronized at 2.0.8. | direct |
| Minor (8 findings) | Markdown hierarchy | eight PR-dependent report fixtures | Fixture `Implementation Status` headings used H3 directly below H1. | Normalize all eight headings to H2. | direct |
| Minor | Exercise fidelity | PR-dependent delivery exercise | H1/H2 observations were fixed constants and the report-commit path did not reject unchanged H2. | Make observed H1/H2 configurable, require advancement after a report commit, and pin the preserved-draft failure case. | direct |
| Minor | Rubric coverage | skill-exercise runner tests | Tests checked only a result count and final ID. | Assert the exact ordered V1-V6 and P1-P7 rubric ID sets plus malformed-order/SHA failures. | direct |
| Minor | Report contract | `skills/verify-code/checklists/report-template.md` | The scaffold used `Status` while the parser and public format require `Implementation Status`. | Rename the scaffold field to the canonical label. | skill-creator |
| Minor | Spec validation | active requirements validation checklist | The checklist omitted the qualified-pending fixture from its explicit regression inventory. | Require qualified pending and pre-PR-capable check fixtures explicitly. | direct |

## Remaining Issues

None.

## Positive Observations

- The shared marker is strict data, never executable content.
- Ordinary Pass remains a first-class compatibility path.
- Exact H1/H2 identity prevents stale check evidence from advancing readiness.
- Status remains entirely read-only and exposes uncertainty instead of guessing.
- Failure handling preserves every recoverable artifact and never alters protections.

## Files Reviewed

| Area | Files | Issues Remaining |
|------|-------|------------------|
| Shared contract | `references/pr-dependent-verification.md`, `scripts/verification-readiness.mjs` | 0 |
| Verification producer | `skills/verify-code/**` | 0 |
| Status consumer | `skills/status/SKILL.md`, `scripts/sdlc-status.mjs` | 0 |
| Delivery consumer | `skills/open-pr/**` | 0 |
| Tests and fixtures | PR-dependent, status, open-pr, and skill-exercise files under `scripts/` | 0 |
| Public/spec/release evidence | `README.md`, active defect spec, inventory baseline, `.codex-plugin/plugin.json`, `VERSION`, `CHANGELOG.md` | 0 |

## Recommendation

**Ready for PR re-review**

Issue #171 satisfies AC1–AC10 and FR1–FR6 with current issue-scoped Pass evidence. The review-fix batch may be committed and pushed to PR #172 for GitHub CodeRabbit and required-check evaluation.
