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
**Review Finding Ledger**: 34/34 fixed (`I01`–`I19` initial findings; `G01`–`G15` GitHub findings)

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
- Focused impacted suites: 122/122 tests passing after final fixes.
- Complete Jest suite: 35 suites passing; 388 tests passing; 12 established conditional/opt-in tests skipped; 0 unexpected failures or orphaned imports.
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
| Contract tests | Pass | 35 suites / 388 tests passed; no unexpected skips or orphaned imports |
| Skill inventory | Pass | Clean; 463 items mapped after inspected pointer-contract refresh |
| Codex compatibility | Pass | `Codex compatibility check passed.` |
| Active plugin surface | Pass | Repository plugin surface validation passed |
| Skill creator validation | Pass | verify-code, status, and open-pr bundles all valid |
| Skill exercise | Pass | All three changed skills passed every deterministic and rubric check with zero skips |
| Prompt quality | Pass | Unambiguous steps, complete success/failure/resume paths, supported CLI commands, logical H1/H2 ordering, unchanged explicit gates, valid cross-references, and preserved historical boundaries |
| Git hygiene | Pass | `git diff --check` exited 0; diff contains only issue #171 implementation/spec/documentation evidence |

**Gate Summary**: 8/8 passed, 0 failed, 0 incomplete

## Fixes Applied During Verification

`V01`–`V05` are pre-review verification improvements and are excluded from the 34-item review ledger. Review IDs are counted exactly once; `I08`–`I15` names the eight individually counted fixture-heading findings.

| ID(s) | Severity | Category | Location | Original Issue | Fix Applied | Routing |
|-------|----------|----------|----------|----------------|-------------|---------|
| V01 | Medium | Security | `scripts/verification-readiness.mjs` | Symlink type was checked only after path resolution. | Reject the original report path when it is a symlink before resolving/reading it. | direct |
| V02 | Medium | Status safety | `scripts/sdlc-status.mjs` | Missing draft metadata could render as ready, and ready PR plus pending verification was not explicitly inconsistent. | Preserve unknown metadata, validate head shape, and fail closed on ready/pending conflict. | direct |
| V03 | Low | Test fidelity | delivery exercise | Fixture used a nonexistent `gh pr checks --head` shorthand. | Model supported `gh pr view` head proof plus `gh pr checks --required --json`. | direct |
| V04 | Low | Prompt quality | verify-code/open-pr skills | Three reference pointers did not use deterministic pointer grammar. | Normalize the pointers, register no-skip exercises, and refresh the inspected inventory baseline. | skill-creator |
| V05 | Low | Contract test | open-pr contract test | Static assertion lagged the current-report freshness requirement. | Pin the stricter current pending wording. | direct |
| I01 | Major | Status safety | status source/tests | Pending evidence with unknown open-PR draft state could fall through to `pull-request-open`. | Add a named fail-closed gap and exact repair action. | direct |
| I02 | Major | Exercise integrity | exercise runner/tests | Missing ordered steps could pass because both indices were `-1`; P6 accepted equal placeholders. | Require both steps in order and a concrete H2 SHA. | direct |
| I03 | Major | Validator robustness | readiness validator/tests | A non-string satisfied SHA could throw during normalization. | Type-guard before comparison and pin non-throwing invalid-data behavior. | direct |
| I04 | Major | Delivery interface | validator CLI/open-pr reference | Final-body validation had no executable public workflow command. | Add bounded delivery-body CLI validation before ready. | skill-creator + direct |
| I05 | Major | Retry safety | shared/open-pr contracts/exercise | A pushed satisfied H1 report could not re-enter after H2 failure. | Permit only the exact preserved draft to resume at H2. | skill-creator + direct |
| I06 | Major | Evidence provenance | validator/contracts/fixtures | Allowlisted kind and AC mapping did not prove PR-only provenance. | Require exact `event: pull_request` identity and reject push/unknown events. | skill-creator + direct |
| I07 | Major | Release evidence | verification report | Blast radius denied real release-artifact changes. | Record the three synchronized 2.0.8 paths. | direct |
| I08–I15 | Minor | Markdown hierarchy | eight report fixtures | Eight status headings used the reviewed hierarchy. | Normalize all eight headings to H2. | direct |
| I16 | Minor | Exercise fidelity | delivery exercise | H1/H2 were fixed constants and unchanged H2 was accepted. | Make observations configurable and require post-report advancement. | direct |
| I17 | Minor | Rubric coverage | runner tests | Tests checked only count and final ID. | Assert exact ordered V/P IDs plus malformed-order/SHA failures. | direct |
| I18 | Minor | Report contract | report scaffold | Scaffold label did not match the canonical parser field. | Use the canonical `Implementation Status` field. | skill-creator |
| I19 | Minor | Spec validation | requirements checklist | Fixture inventory was not explicit enough. | Name qualified-pending and pre-PR-capable fixtures. | direct |
| G01 | Minor | Success semantics | delivery exercise | Only `SUCCESS` advanced H1/H2. | Share a predicate accepting `SUCCESS`, `NEUTRAL`, and `SKIPPED`; test all paths. | direct |
| G02 | Major | Persisted-state proof | delivery exercise | In-memory marker validation preceded body persistence and refetch. | Model edit/refetch first, then validate fetched body/head/draft state before ready. | direct |
| G03 | Major | H1/H2 identity | status source/tests | Satisfied H1 was compared with current H2. | Derive one exact H1 from report evidence and validate final marker separately against H2. | direct |
| G04 | Major | Evidence identity | exercise runner/tests | V3 did not match satisfied evidence to declared kind/name/AC identity. | Require exact ordered identity/event/AC mapping and add replacement regression. | direct |
| G05 | Major | Malformed data | exercise runner/tests | Parseable null/primitive structures could throw. | Require record roots/elements, catch evaluator errors, and fail rubric checks closed. | direct |
| G06 | Major | Report parsing | readiness validator/tests | Prose or duplicate status fields could override the real result. | Require exactly one canonical Markdown status heading; reject duplicates. | direct |
| G07 | Minor | Report scaffold | verify-code template/format/tests | Status heading and marker placement diverged from parser/contract. | Use exact H3 status and place readiness immediately after scope. | skill-creator + direct |
| G08 | Minor | Evidence schema | verify-code report guidance | Wording implied `observedStates` on every evidence kind. | Limit observations to `merge_blocking`; retain check-specific fields. | skill-creator |
| G09 | Major | Pending semantics | verify-code skill/format | Missing-check prohibition also blocked valid pre-PR pending evidence. | Distinguish pre-PR absence from missing/failed post-draft evidence. | skill-creator |
| G10 | Minor | Spec example | active design | Example mapped pending evidence outside active delivery ACs. | Map the example check to AC1. | direct |
| G11 | Minor | Acceptance contract | requirements/Gherkin | Final marker persistence/refetch/validation was implicit. | Require all three before `gh pr ready`. | direct |
| G12 | Major | Release evidence | tasks/report | GitHub separately flagged the false version-artifact claim. | Add path-specific 2.0.8 task and reviewed-file evidence. | direct |
| G13 | Major | Completion safety | status source/tests/docs | Ready/merged controlled PRs could complete without valid final evidence. | Validate final marker/head and fail closed before review or completion. | skill-creator + direct |
| G14 | Minor | Review accounting | verification report | The 19/19 claim did not map one-to-one to grouped table rows. | Add this exact I/G ledger and separate non-review V IDs. | direct |
| G15 | Minor | Test evidence | report/PR delivery evidence | Recorded Jest totals disagreed across artifacts. | Use the fresh authoritative 35-suite / 388-test run and update the PR body. | direct |

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
