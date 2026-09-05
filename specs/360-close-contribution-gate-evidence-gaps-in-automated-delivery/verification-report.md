# Verification Report: Close contribution-gate evidence gaps in automated delivery

**Date**: 2026-09-05
**Issue**: #360
**Reviewer**: Codex
**Scope**: Manual implementation verification against the approved specification

---

## Executive Summary

The implementation satisfies AC1–AC4 and FR1–FR5. Generated pull-request evidence is evaluated through the canonical managed gate before mutation; gate-only body failures are repaired without commits or human-review classification; mixed checks and true review blockers retain existing behavior.

### Implementation Status: Pass

**Total Issues**: 0 implementation findings

## Acceptance Criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC1 | Pass | `scripts/contribution-evidence.mjs` executes the fenced evaluator from `references/contribution-gate.md`; generated evidence covering implementation, `VERSION`, and `package.json` passes in `scripts/__tests__/contribution-evidence.test.mjs`. |
| AC2 | Pass | `scripts/sdlc-deliver.mjs` evaluates the exact generated title/body/path set before create or edit; controller tests prove incomplete evidence prevents both mutations with `contribution_evidence_incomplete`. |
| AC3 | Pass | Gate-only failures at the unchanged expected head edit the body without another commit or `NMG_SDLC_REMEDIATION`, then continue observation. Bare and workflow-qualified check names are covered. |
| AC4 | Pass | Existing human-review, changes-requested, pathless-thread, mixed-check, required-check, and exact-head tests remain green. |

## Unit and Behavioral Tests

| Command | Result |
|---------|--------|
| `npm test -- --runInBand __tests__/contribution-evidence.test.mjs` | Passed: 1 suite, 3 tests. |
| `npm test -- --runInBand` | Passed through the deterministic repository validation at head `b8fba3966cc7b6b57cbce5c54f71827f0cb39ef6`. |
| `npm test -- --runInBand __tests__/contribution-evidence.test.mjs __tests__/sdlc-deliver.test.mjs __tests__/exercise-contribution-gate.test.mjs __tests__/contribution-gate-contract.test.mjs` | Passed: 4 suites, 121 tests. |

## Code Review

Three independent reviews covered the evidence adapter, delivery controller, and controller tests. All returned PASS. A final review after the `listFiles`/`paginate` adapter correction and direct unit regression also returned PASS. No actionable finding remains.

## Steering and Contribution Alignment

- Product: automated issue delivery remains controller-owned and fail-closed at mutation boundaries.
- Technical: Node ESM, explicit command arguments, exact-head merge, and remote-check observation remain unchanged.
- Structure: the reusable canonical evaluator adapter is in `scripts/contribution-evidence.mjs`; gate policy remains solely in `references/contribution-gate.md`.
- Managed contribution workflow and `references/contribution-gate.md` are byte-unchanged.

## Reviewer Context

The required mutable smoke runner was attempted with fresh smoke issues #79 and #82. Both exercised full implementation/review/verification cycles and merged exact-head PRs #81 and #84. The first exposed completed-delivery re-entry overwriting a successful handoff; that defect is tracked as #362 with a reviewed unit-tested fix. The second initially stopped on a transient generated `uv.lock` dirty path and completed successfully when resumed. Because those outer provider invocations had already recorded exit 1, the deterministic artifact retained a `Fail` ceiling despite subsequent exact merged/closed proof. The owner explicitly requested manual delivery rather than another nmg-sdlc orchestration pass.

## Changed-path Evidence

- `scripts/contribution-evidence.mjs` — canonical local evaluator, body builder, faithful GitHub adapter.
- `scripts/sdlc-deliver.mjs` — pre-mutation evaluation and gate-only body repair.
- `scripts/__tests__/contribution-evidence.test.mjs` — evaluator/body and direct adapter unit coverage.
- `scripts/__tests__/sdlc-deliver.test.mjs` — AC1–AC4 controller regressions.
- `specs/360-close-contribution-gate-evidence-gaps-in-automated-delivery/verification-report.md` — durable verification evidence.
- `VERSION`, `package.json`, `CHANGELOG.md` — synchronized patch release metadata.

## Recommendation

Ready for manual pull-request delivery. GitHub contribution and repository checks remain authoritative before exact-head merge.
