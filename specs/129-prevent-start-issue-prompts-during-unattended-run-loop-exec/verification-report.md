# Verification Report: Prevent start-issue prompts during unattended run-loop exec

**Date**: 2026-04-27
**Issue**: #129
**Reviewer**: Codex
**Scope**: Defect verification against `specs/bug-prevent-start-issue-prompts-during-unattended-run-loop-exec/`

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
| **Overall** | 5 |

**Status**: Pass
**Total Issues**: 1 found, 1 fixed

The implementation satisfies the defect acceptance criteria. Verification found one runner-state edge case: Step 2 could mark `lastCompletedStep = 2` before checking that a feature branch was actually created. That was fixed by moving the branch postcondition ahead of state persistence and applying it to all `startIssue` runs.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Unattended start-issue does not call `request_user_input` | Pass | `skills/start-issue/SKILL.md:22`, `skills/start-issue/SKILL.md:153`, dry-run Codex exercise |
| AC2 | Unattended start-issue creates or reconciles the feature branch | Pass | `scripts/sdlc-runner.mjs:1156`, `scripts/sdlc-runner.mjs:2582`, `skills/start-issue/references/stale-remote-branch.md:50` |
| AC3 | Branch creation failures are actionable and non-interactive | Pass | `scripts/sdlc-runner.mjs:2582`, `scripts/__tests__/sdlc-runner.test.mjs:1419` |
| AC4 | Interactive behavior is unchanged | Pass | `skills/start-issue/SKILL.md:155`, `skills/start-issue/references/milestone-selection.md:45`, `skills/start-issue/references/stale-remote-branch.md:68` |
| AC5 | Runner treats prompt-tool failures as Step 2 contract violations | Pass | `scripts/sdlc-runner.mjs:1432`, `scripts/__tests__/sdlc-runner.test.mjs:396` |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Harden `start-issue` prompt gates | Complete | Skill and references separate unattended and interactive paths. |
| T002 | Harden runner Step 2 prompt and failure classification | Complete | Preselected prompt, exec-mode error matching, and branch postcondition are covered. |
| T003 | Add regression tests | Complete | Added prompt, exec-error, quoted-text, and no-branch state tests. |
| T004 | Verify and exercise the defect path | Complete | Jest, inventory audit, and dry-run Codex exercise passed. |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score | Notes |
|-----------|-------|-------|
| Single Responsibility | 5 | Prompt construction, text failure detection, and Step 2 postcondition remain localized. |
| Open/Closed | 5 | New failure phrase extends the existing pattern table. |
| Liskov Substitution | 5 | No polymorphic contracts changed. |
| Interface Segregation | 5 | Test helpers expose only the needed runner state. |
| Dependency Inversion | 5 | Runner tests use existing mocked `fs` and child-process boundaries. |

Layer separation is preserved: skill prompt wording stays in `skills/start-issue/`, runner orchestration stays in `scripts/sdlc-runner.mjs`, and regression coverage stays in `scripts/__tests__/`.

## Security Assessment

No secrets, auth behavior, command construction, or new dependency surface were introduced. The change reduces automation risk by preventing prompt-tool failures from being mistaken for success.

## Performance Assessment

No runtime loops or additional network calls were added. The new branch postcondition uses already-extracted state and avoids extra shell calls.

## Test Coverage

| Acceptance Criterion | Has Scenario | Has Automated Coverage | Passes |
|---------------------|--------------|------------------------|--------|
| AC1 | Yes | Yes | Yes |
| AC2 | Yes | Yes | Yes |
| AC3 | Yes | Yes | Yes |
| AC4 | Yes | Yes | Yes |
| AC5 | Yes | Yes | Yes |

Coverage summary:
- Feature scenarios: 5 in `feature.gherkin`
- Runner tests: 365 passed, 17 skipped
- Inventory audit: clean, 536 items mapped

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `$nmg-sdlc:start-issue` unattended path |
| **Test Project** | `/tmp/nmg-sdlc-verify-129-7CMNBg` |
| **Exercise Method** | `codex exec` dry-run inspection plus runner prompt import |
| **`request_user_input` gate Handling** | No active unattended call path found |

Captured output summary: nested Codex read the local modified skill, references, and runner, built the exact dry-run prompt for issue #129, and reported that the only `request_user_input` mentions were prohibitions or interactive-mode-only documentation. It did not call `gh`, create branches, or edit files.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| SDLC runner tests | Pass | `cd scripts && npm test`: 13 suites passed, 365 tests passed, 17 skipped |
| Skill exercise test | Pass | Dry-run Codex exercise verified no active unattended `request_user_input` path |
| Skill inventory audit | Pass | `node scripts/skill-inventory-audit.mjs --check`: clean, 536 items mapped |
| Prompt quality review | Pass | Prompt branches are explicit for unattended vs interactive mode |
| Behavioral contract review | Pass | Step 2 now fails before persisting completion state when no branch exists |

**Gate Summary**: 5/5 gates passed, 0 failed, 0 incomplete

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| High | Runner state contract | `scripts/sdlc-runner.mjs:2582` | Step 2 branch postcondition ran after `lastCompletedStep` persistence and skipped explicit `--issue` mode. | Moved the postcondition before state persistence and applied it to all `startIssue` runs. | direct |
| High | Regression coverage | `scripts/__tests__/sdlc-runner.test.mjs:1419` | No test proved no-branch Step 2 exits retry without marking Step 2 complete. | Added a dry-run unit regression for the failed-branch handoff. | direct |

## Remaining Issues

None.

## Recommendations Summary

Before PR:
- No blocking issues remain.

Short term:
- Run `$nmg-sdlc:open-pr #129` to create the pull request.
