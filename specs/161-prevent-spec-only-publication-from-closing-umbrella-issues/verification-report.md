# Verification Report: Prevent Spec-Only Publication from Closing Umbrella Issues

**Date**: 2026-08-14
**Issue**: #161
**Reviewer**: Codex
**Scope**: Defect-fix verification against the approved #161 specification

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture / Blast Radius | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **5.0** |

**Implementation Status**: Pass (defect fix)
**Total Issues**: 0 remaining; 1 low-severity test-coverage finding and 1 major review finding fixed during verification

The defect no longer relies on pull-request body wording. Seal-Spec publication keeps the issue-linked sealing branch as source provenance, pushes the exact seal commit to a deterministic unlinked publication ref, and requires actual GitHub closing-reference and issue-timeline proof before pending or merged success. Close/reopen events are processed chronologically, and recovery can reopen only the exact umbrella whose currently active closure belongs to the exact marked publication PR from the same repository. Historical, reopened, later unrelated, and cross-repository closures cannot authorize recovery. The skill retains its approval gate, and ordinary implementation delivery closure is unchanged.

---

## Reproduction Check

The original PathCast incident was rechecked live without mutation:

- PR `Nunley-Media-Group/pathcast#125` used `Refs #108` and the canonical umbrella marker.
- Its head was the issue-linked `108-establish-claim-specific-ip-and-product-safety-guardrails` branch.
- GitHub returned issue #108 in `closingIssuesReferences`.
- `scripts/umbrella-publication-status.mjs` returned `publication_closed_umbrella` / `publication_pr_closed_umbrella`.
- The helper found a `ClosedEvent` at `2026-08-14T02:34:56Z`, one second after merge, with same-repository PR #125 as the currently active exact closer; issue #108 remained closed.

This reproduces the old failure through the new read-only evidence path. The fixed workflow cannot report an open issue-linked publication as pending-safe and requires the deterministic unlinked head plus an empty umbrella closing-reference set.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Publication PRs are non-closing | Pass | Dedicated ref derivation and marker generation in `scripts/umbrella-publication-status.mjs:117`; `pending_safe` requires the dedicated head and excludes the umbrella at `scripts/umbrella-publication-status.mjs:271`; write-spec creates the ref with plain Git and never `gh issue develop` at `skills/write-spec/SKILL.md:242`. |
| AC2 | Umbrella remains open after merge | Pass | `merged_safe` requires current issue state `OPEN` and no unexplained closing relationship at `scripts/umbrella-publication-status.mjs:286`; write-spec combines it with fresh canonical tree proof at `skills/write-spec/SKILL.md:269`. |
| AC3 | Unexpected closure is detected | Pass | Chronological close/reopen processing tracks the active closure at `scripts/umbrella-publication-status.mjs:251`; only its repository-qualified exact PR attribution returns `publication_closed_umbrella` at line 315. Live PathCast #108/#125 produced that status with no gaps. |
| AC4 | Existing auto-closed umbrellas can be recovered | Pass | Shared exact-recovery invariants are defined at `references/canonical-umbrella-spec.md:100`; write-spec requires an exact active closure, exact approval, `gh issue reopen N`, refetch, `merged_safe`, and `evidence.recovered = true` at `skills/write-spec/SKILL.md:271`. Publication-close/reopen/unrelated-close and cross-repository regressions prove historical evidence cannot authorize recovery. The helper itself is read-only. |
| AC5 | Ordinary delivery closure is preserved | Pass | The shared contract and write-spec explicitly retain `$nmg-sdlc:open-pr` ownership; static regression coverage proves the helper contains no reopen mutation. |
| AC6 | Existing publication safety remains intact | Pass | Write-spec retains full seal commit/tree, allowed-path diff, forbidden release paths, remote-ref collision proof, exact marker/base/head/commit matching, no force-push, and canonical reclassification at `skills/write-spec/SKILL.md:217-274`. |
| AC7 | Actual GitHub closing semantics are exercised | Pass | The opt-in live writer at `scripts/exercise-github-umbrella-publication.mjs:129` creates linked control and unlinked cases, merges fixture PRs, and asserts `closing_relationship` / `publication_closed_umbrella` versus `pending_safe` / `merged_safe`; the GraphQL query shape was exercised live against PathCast #108/#125. A disposable write repository was not supplied during this verification, so the unlinked live mutation remains opt-in rather than being run against production. |

All seven ACs have exactly one `@regression` scenario in `feature.gherkin` and direct deterministic contract evidence.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add deterministic publication-closing classification | Complete | Zero-dependency helper, shared contract, stable evidence states, and bounded timeline pagination implemented. |
| T002 | Publish from an unlinked branch and enforce semantic gates | Complete | Seal source retained; deterministic publication ref and pre/post GitHub gates added through `$skill-creator`. |
| T003 | Add deterministic and live GitHub-semantic coverage | Complete | 12 focused helper tests, cross-skill contract assertions, disposable Git topology exercise, seven Gherkin scenarios, and opt-in live writer added. |
| T004 | Document and verify | Complete | README/CHANGELOG updated and every applicable verification gate passes. |

---

## Architecture and Blast-Radius Assessment

- **Shared callers**: only the multi-PR Seal-Spec branch invokes the new helper. Ordinary `$nmg-sdlc:open-pr`, single-PR specs, child amendments, versioning, and existing canonical tree classification are not modified.
- **Public contract**: adds stable read-only JSON statuses and a documented helper CLI; it does not change existing helper signatures or status values.
- **Silent data changes**: none. The classifier reads GitHub state only. The live exercise is a separately named explicit writer requiring both a repository argument and `--acknowledge-live-writes`.
- **Layer separation**: Git tree/content authority remains in `umbrella-spec-status.mjs`; GitHub issue/PR semantic evidence is isolated in `umbrella-publication-status.mjs`; workflow decisions and approval-gated mutation remain in `write-spec`.
- **Minimal-change check**: every changed path maps to #161 specification, implementation, test, documentation, or verification evidence. No unrelated refactor or formatting churn is present.

---

## Security, Performance, Testability, and Error Handling

| Area | Score | Evidence |
|------|-------|----------|
| Security | 5/5 | Positive integer, repository, spec path, full OID, and base validation; `spawnSync`/`execFileSync` argument arrays; no shell interpolation; exact repository-qualified closer comparison; no secrets; helper performs no writes. |
| Performance | 5/5 | Closing references are bounded at 100 and fail on truncation; close/reopen timeline pagination is bounded at 10 pages; each external query has a timeout and output cap. |
| Testability | 5/5 | Pure `classifyPublicationEvidence`, injectable command adapter, deterministic marker/branch functions, contract-faithful fixtures, disposable Git topology, and normal-suite network independence. |
| Error Handling | 5/5 | Stable `reasonCode`, bounded `gaps`, exact evidence preservation, fail-closed missing/truncated/mismatched state, bounded retry in the opt-in live exercise, and best-effort fixture cleanup that does not conceal the primary failure. |

---

## Test Coverage

| Layer | Result | Evidence |
|-------|--------|----------|
| BDD scenarios | Pass | 7/7 ACs have one `@regression` scenario. |
| Focused helper/contract tests | Pass | 21 tests across the new helper and canonical contract suites, including active-closure ordering and repository identity regressions. |
| Focused publication topology | Pass | `exercise-write-spec-epic.test.mjs` proves the dedicated ref resolves to the exact seal commit while the linked source ref remains unchanged. |
| Full Jest suite | Pass | 29 suites passed; 275 tests passed; 12 pre-existing intentional exercise skips; 0 failures. |
| Live read-only GitHub semantics | Pass | PathCast #108/#125 classified with exact closing reference and repository-qualified active `ClosedEvent` closer attribution using the close/reopen query. |
| Live disposable writer | Not run | Explicit opt-in script is implemented and contract-tested; no disposable repository was supplied, so production repositories were not polluted. |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `cd scripts && npm test -- --runInBand`: 29/32 suites passed, 3 intentional suites skipped; 275 passed, 12 intentional skips, 0 failures. |
| Skill inventory | Pass | `Skill inventory audit: clean (439 items mapped).` |
| Codex compatibility | Pass | `Codex compatibility check passed.` |
| Active plugin surface | Pass | `Plugin surface validation passed: repository`. |
| Skill creator validation | Pass | `quick_validate.py skills/write-spec`: `Skill is valid!` |
| Skill exercise | Not applicable | No `scripts/__fixtures__/skill-exercise/write-spec` runner fixture exists; the changed skill is exercised by the dedicated deterministic Jest fixture instead. |
| Prompt quality | Pass | Instructions are ordered, exact, fail-closed, cover success/failure/recovery/decline, preserve gate integrity, reference existing packaged paths, and keep the entrypoint at 326 lines. |
| Git hygiene | Pass | Script syntax checks and `git diff --check` exit 0. |

Delivery preparation verified `VERSION` and `.codex-plugin/plugin.json` are both valid and synchronized at `2.0.4`; these exact version artifacts are owned by `$nmg-sdlc:open-pr` and are covered by T004.

---

## Fixes Applied During Verification

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| Low | Testing | `scripts/__tests__/umbrella-publication-status.test.mjs` | Base-ref mismatch and a directly truncated timeline payload were implemented but not independently asserted. | Added explicit fail-closed assertions for both evidence shapes and reran focused/full suites. | direct |

---

## Remaining Issues

None.

The opt-in live writer is intentionally not executed without an explicit disposable repository and merge acknowledgement. This is an evidence boundary, not an implementation defect; the actual GitHub query/closer contract was verified read-only against the recorded incident.

---

## Recommendation

**Ready for PR.**

All seven acceptance criteria pass, every implementation task is complete, the original production failure is reproduced through the new live read-only classifier, deterministic coverage is green, skill-creator and repository gates pass, and there are no unresolved findings.
