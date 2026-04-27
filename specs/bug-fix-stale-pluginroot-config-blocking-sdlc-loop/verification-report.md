# Verification Report: Fix stale pluginRoot config blocking SDLC loop

**Date**: 2026-04-27
**Issue**: #124
**Reviewer**: Codex
**Scope**: Defect-fix implementation verification against spec

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | 4.8 |

**Status**: Pass
**Total Issues**: 0

The implementation satisfies the defect spec. The runner validates the selected plugin-root shape before child skill reads, recovers stale versioned nmg-sdlc cache roots through the current valid runner root when available, preserves valid custom roots and legacy `pluginsPath` behavior, and documents durable repair through `$nmg-sdlc:upgrade-project`.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Stale `pluginRoot` is detected before a temporary config is needed | Pass | `scripts/sdlc-runner.mjs:345` validates and recovers usable roots; `scripts/sdlc-runner.mjs:2653` logs recovered stale roots. Dry-run evidence: stale `/Users/dev/.codex/plugins/cache/nmg-plugins/nmg-sdlc/1.59.0` recovered to the current checkout and told the user to run `$nmg-sdlc:upgrade-project`. |
| AC2 | `$nmg-sdlc:upgrade-project` repairs stale cache roots safely | Pass | `skills/upgrade-project/references/verification.md:14` defines stale path-refresh findings; `skills/upgrade-project/references/upgrade-procedures.md:80` applies only the affected path fields after replacement validation. |
| AC3 | Valid custom plugin roots are preserved | Pass | `scripts/sdlc-runner.mjs:349` returns a valid selected root unchanged; `scripts/__tests__/sdlc-runner.test.mjs:3700` covers valid custom-root preservation; `skills/upgrade-project/references/verification.md:16` preserves valid custom roots. |
| AC4 | Existing path compatibility does not regress | Pass | `scripts/__tests__/sdlc-runner.test.mjs:3710` covers legacy `pluginsPath`; `scripts/__tests__/sdlc-runner.test.mjs:3721` covers `pluginRoot` precedence; full runner tests pass. |

---

## Defect Reproduction Check

| Reproduction Step | Result |
|-------------------|--------|
| Configure stale versioned cache root | Pass: disposable config used stale `/Users/dev/.codex/plugins/cache/nmg-plugins/nmg-sdlc/1.59.0`. |
| Ensure a valid current plugin root exists | Pass: current checkout validates with `.codex-plugin/plugin.json`, `skills/`, and `scripts/sdlc-runner.mjs`. |
| Start runner | Pass: `node scripts/sdlc-runner.mjs --config <temp>/sdlc-config.json --dry-run --step 1` printed `Recovered stale pluginRoot=... using /Volumes/Fast Brick/source/repos/nmg-sdlc for this invocation. Run $nmg-sdlc:upgrade-project to repair sdlc-config.json.` |
| Invalid custom root without replacement | Pass: dry-run with `/tmp/not-a-valid-plugin-root` failed early with `Invalid plugin root from pluginRoot=...`, the missing artifact path, expected root shape, and repair guidance. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add runner plugin-root validation and stale-root diagnostics | Complete | Shape validation checks `.codex-plugin/plugin.json`, `skills/`, and `scripts/sdlc-runner.mjs`; startup and child prompt paths use `resolveUsableSkillsBase()`. |
| T002 | Update run-loop stale-root recovery instructions | Complete | `skills/run-loop/SKILL.md:60` verifies plugin-root shape and `skills/run-loop/SKILL.md:73` describes replacement discovery and output. |
| T003 | Teach upgrade-project to detect and repair stale cache roots | Complete | Verification and apply references distinguish path refresh from generic drift and preserve unrelated config values. |
| T004 | Add regression coverage and BDD scenarios | Complete | Four `@regression` scenarios cover all ACs; Jest tests cover runner-side stale roots, valid roots, recovery, and path precedence. |
| T005 | Update user-facing config guidance | Complete | `README.md:180` and `README.md:261` document stale versioned `pluginRoot` repair through `$nmg-sdlc:upgrade-project`. |
| T006 | Verify runner, skill, and config behavior | Complete | Tests, inventory audit, diff check, runner dry-run substitute, and static upgrade-project verification completed. |

---

## Architecture Assessment

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID Principles | 4 | New root-shape helpers are focused and testable. The existing runner remains a large orchestration module, but this change does not worsen that structure. |
| Security | 5 | No secrets added. No shell execution with user-controlled config values was introduced; validation uses Node `fs`/`path`. |
| Performance | 5 | Validation is three filesystem checks at startup/skill-read boundaries and has bounded cost. |
| Testability | 5 | New helpers are exported for tests, and regression cases mock filesystem state deterministically. |
| Error Handling | 5 | Failure messages name the selected field, configured value, missing artifact, expected shape, and repair path. |

### Blast Radius

- Shared callers: `readSkill()`, `buildCodexArgs()`, and runner startup now resolve through the validated usable base.
- Public contract changes: none to config shape or command-line arguments.
- Data changes: no automatic project config writes from the runner; durable writes are restricted to approved or unattended upgrade-project path-refresh findings.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Covered By | Passes |
|---------------------|-------------|------------|--------|
| AC1 | Yes | Runner dry-run substitute plus `scripts/__tests__/sdlc-runner.test.mjs:3683` | Yes |
| AC2 | Yes | Static upgrade-project verification against changed references | Yes |
| AC3 | Yes | `scripts/__tests__/sdlc-runner.test.mjs:3700` plus static upgrade-project verification | Yes |
| AC4 | Yes | `scripts/__tests__/sdlc-runner.test.mjs:3710` and `scripts/__tests__/sdlc-runner.test.mjs:3721` | Yes |

### Verification Commands

| Command | Result |
|---------|--------|
| `cd scripts && npm test` | Pass: 13 suites passed, 361 tests passed, 17 skipped. |
| `node scripts/skill-inventory-audit.mjs --check` | Pass: `Skill inventory audit: clean (536 items mapped).` |
| `git diff --check origin/main...HEAD` | Pass |
| `git status --short` | Clean before report creation |

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill/Path Exercised** | Runner stale-root startup path |
| **Test Project** | Disposable temp project under `/var/folders/.../nmg-sdlc-verify-*` |
| **Exercise Method** | `node scripts/sdlc-runner.mjs --config <temp>/sdlc-config.json --dry-run --step 1` |
| **Result** | Pass: stale versioned cache root recovered for current invocation and durable repair guidance was printed. |

### Notes

Full live `$nmg-sdlc:run-loop` and `$nmg-sdlc:upgrade-project` Codex exercises were not run because they would spawn nested model sessions and, for upgrade-project, enter interactive project-upgrade gates. The required behavior was verified through a dry-run runner substitute, full runner unit tests, inventory audit, prompt-quality review, and static verification of the upgrade-project path-refresh contract.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| SDLC runner tests | Pass | `cd scripts && npm test` exited 0. |
| Skill exercise test | Pass | Dry-run substitute exercised the runner stale-root path; report documents manual full-skill exercise follow-up rationale. |
| Skill inventory audit | Pass | `node scripts/skill-inventory-audit.mjs --check` exited 0. |
| Prompt quality review | Pass | Changed skills use Codex-native wording, define happy/error paths, preserve unattended behavior, and keep durable writes in upgrade-project. |
| Behavioral contract review | Pass | Preconditions validate root shape; postconditions preserve downstream skill-root resolution; invariants preserve custom roots and `pluginsPath`; boundaries avoid runner config writes. |

**Gate Summary**: 5/5 passed, 0 failed, 0 incomplete

---

## Fixes Applied

No verification findings required code changes.

---

## Remaining Issues

None.

---

## Recommendations Summary

### Before PR (Must)

- [x] No blocking items remain.

### Short Term (Should)

- [ ] Optional: run a full manual `$nmg-sdlc:upgrade-project` exercise in a disposable project before or during PR review if reviewer wants transcript-level evidence of the interactive path.

### Long Term (Could)

- [ ] Consider extracting runner plugin-root discovery into a shared script helper if future issues require both `init-config` and `run-loop` to execute identical discovery code outside prompt instructions.
