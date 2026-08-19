# Verification Report: Add CONTRIBUTING.md Generation to Project Onboarding and Upgrades

**Issue**: #109
**Date**: 2026-04-26
**Status**: Pass

## Executive Summary

Issue #109 is implemented in the working tree. The feature adds a shared contribution-guide contract, wires it into `onboard-project` and `upgrade-project`, preserves project-authored contribution policy, treats `CONTRIBUTING.md` as a managed non-destructive artifact, inserts README links idempotently, updates public docs, and adds deterministic plus live exercise coverage.

## Acceptance Criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC1 Greenfield onboarding creates guide | Pass | `skills/onboard-project/references/greenfield.md` applies `../../references/contribution-guide.md` after steering exists and before milestone/starter issue work. |
| AC2 Brownfield onboarding creates guide | Pass | `skills/onboard-project/references/brownfield.md` applies the contract after steering verification and records existing-code plus reconciled/source-backfilled spec context. |
| AC3 Upgrade creates missing guide | Pass | `skills/upgrade-project/SKILL.md` Step 7a analyzes missing `CONTRIBUTING.md` as a managed non-destructive artifact. |
| AC4 Existing guide preserved | Pass | `references/contribution-guide.md` requires targeted insertion only; live exercise verified an existing guide prefix was preserved before the appended section. |
| AC5 README links guide | Pass | `references/contribution-guide.md` defines idempotent README-link insertion and missing-README skip behavior; deterministic and live exercises covered both. |
| AC6 Content accounts for steering | Pass | The shared reference requires reading product, tech, and structure steering and avoiding unsourced stack assumptions; live exercise verified steering-derived `npm test` guidance. |
| AC7 Idempotency | Pass | `scripts/__tests__/exercise-contribution-guide.test.mjs` and the live exercise verified second-run no-op behavior and no duplicate README link. |
| AC8 Public docs updated | Pass | `README.md` and `CHANGELOG.md` document contribution-guide behavior for onboarding and upgrade. |
| AC9 Exercise verification | Pass | Deterministic Jest exercise and nested Codex live exercise both used disposable projects and verified guide creation, README link, preservation, missing-README behavior, and idempotency. |
| AC10 Managed file creation policy | Pass | `skills/upgrade-project/SKILL.md` replaces the blanket no-file-creation rule with managed non-destructive file creation while still prohibiting unrelated synthesis and missing README creation. |

## Architecture Review

| Area | Score | Notes |
|------|-------|-------|
| SOLID Principles | 4 | Shared contract avoids duplicated lifecycle-skill logic and preserves one skill per SDLC step. |
| Security | 5 | No new auth surface; reference requires preserving user content, avoiding secret/internal URL copying, and no `gh` mutations in exercise. |
| Performance | 4 | Small fixed Markdown file set, idempotent short-circuiting, and no persistent runtime state. |
| Testability | 5 | Contract tests and exercise tests cover the prompt contracts and file behaviors with disposable fixtures. |
| Error Handling | 5 | Missing steering and README cases are explicit gaps/skips; unattended behavior is deterministic and non-blocking. |

Average architecture score: 4.6.

## Test Coverage

- BDD scenarios: 10/10 acceptance criteria represented in `feature.gherkin`.
- Executable coverage: 10/10 criteria covered by contract tests, exercise tests, live exercise, and static implementation review.
- Step definitions: Not applicable; this prompt-based plugin uses Jest contract/exercise tests instead of Cucumber step definitions.
- Test execution: Passed.

## Exercise Test Results

Deterministic exercise: `scripts/__tests__/exercise-contribution-guide.test.mjs`

- Onboarding-style project: creates `CONTRIBUTING.md`, adds exactly one README link, and reruns cleanly.
- Upgrade-style project: preserves an existing local policy section, appends `## nmg-sdlc Contribution Workflow`, records missing README as a gap, and does not create README.

Live nested Codex exercise:

- Source contract read from working-tree files: `references/contribution-guide.md`, onboarding greenfield/brownfield refs, and upgrade refs.
- Onboarding-style disposable project: `CONTRIBUTING.md=created`, README link `added`, `linkCount=1`.
- Generated guide contained issue/spec/steering/workflow coverage, brownfield context, and steering-derived `npm test` expectation.
- Onboarding second run: `already present` / `already present`; guide and README hashes unchanged.
- Upgrade-style disposable project with existing guide and no README: `CONTRIBUTING.md=updated`, README link `skipped (README missing)`.
- Existing guide prefix was preserved before the appended nmg-sdlc workflow section.
- Upgrade second run: `already present`, README still absent, guide hash unchanged.
- Cleanup removed both disposable `/tmp` project directories; repo status before/after was identical.
- No `gh` commands were run in the live exercise.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| SDLC runner tests | Pass | `npm test` from `scripts/`: 9 suites passed, 3 skipped; 328 tests passed, 17 skipped. |
| Skill exercise test | Pass | Nested `codex exec` live exercise passed against working-tree files and disposable `/tmp` projects. |
| Skill inventory audit | Pass | `node scripts/skill-inventory-audit.mjs --check`: clean, 506 items mapped. |
| Prompt quality review | Pass | Changed skill pointers use compliant shared-reference wording; behavior remains stack-agnostic and mode-aware. |
| Behavioral contract review | Pass | Preconditions, postconditions, invariants, and boundaries are covered for steering, content preservation, managed artifact creation, unattended mode, and README skip behavior. |

Gate summary: 5/5 passed, 0 failed, 0 incomplete.

## Validation Commands

| Command | Result |
|---------|--------|
| `gh issue view 109 --json labels --jq '.labels[].name'` | Passed: labels are `enhancement`, `automatable`; not a spike. |
| `gh issue view 109` | Passed: issue context loaded. |
| `npm test` from `scripts/` | Passed: 9 suites passed, 3 skipped; 328 tests passed, 17 skipped. |
| `npm --prefix scripts test -- --runInBand` | Passed: 9 suites passed, 3 skipped; 328 tests passed, 17 skipped. |
| `npm --prefix scripts run compat` | Passed. |
| `node scripts/skill-inventory-audit.mjs --check` | Passed. |
| `git diff --check` | Passed. |
| `codex exec --full-auto ...` | Passed with escalated session-store access for live exercise. |

## Fixes Applied

None. No verification findings required code changes.

## Remaining Issues

None.

## Recommendation

Ready for `$nmg-sdlc:open-pr #109` after the working-tree changes are committed by the delivery step.
