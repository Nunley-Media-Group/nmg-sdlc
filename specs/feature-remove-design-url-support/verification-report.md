# Verification Report: Remove Legacy Design URL Support

**Date**: 2026-04-26
**Issue**: #105
**Reviewer**: Codex
**Scope**: Implementation verification against spec

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 4 |
| Error Handling | 5 |
| **Overall** | 4.8 |

**Status**: Pass
**Total Issues**: 0

The implementation removes the legacy Design URL workflow from the live `draft-issue` and `onboard-project` surfaces, preserves archival specs/history, updates public docs, and keeps version artifacts aligned at `1.63.0`. Static repo gates passed. A live nested `codex exec` exercise was attempted but blocked by sandbox/session-store permissions and escalation policy; this report records the manual exercise follow-up required by the steering gate.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Draft issue no longer exposes design URL support | Pass | `skills/draft-issue/SKILL.md` Step 1 now accepts only the optional description and product steering; Step 1a and downstream design context use are removed. Targeted live-surface `rg` found no Design URL/design archive/state matches. |
| AC2 | Onboard project no longer exposes design URL support | Pass | `skills/onboard-project/SKILL.md` and `skills/onboard-project/references/greenfield.md` now start greenfield flow with interview/steering, omit `--design-url`, and remove design fetch summaries/errors. |
| AC3 | Public docs match the active workflow | Pass | `README.md` command table lists `$nmg-sdlc:draft-issue [description]` and `$nmg-sdlc:onboard-project` without design URL arguments; targeted live-surface `rg` found no stale support wording. |
| AC4 | Archival specs are not bulk-rewritten | Pass | Diff is scoped to live docs/skills, inventory baseline, version files, and the new #105 spec. Historical specs were not bulk-normalized. |
| AC5 | Verification catches stale live support | Pass | `npm --prefix scripts run compat`, `node scripts/skill-inventory-audit.mjs --check`, `npm test`, and targeted stale-reference searches passed. |
| AC6 | Skill-bundled edits route through skill-creator | Pass | The active write-code routing contract still requires `$skill-creator` for skill-bundled edits with no direct-edit fallback; no verification autofixes touched skill-bundled files. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Establish live-surface stale-reference baseline | Complete | Targeted live-surface search returned no matches. |
| T002 | Route skill-bundled edits through skill-creator | Complete | Contract remains enforced in steering/write-code references; no verify autofixes were needed. |
| T003 | Remove Design URL support from draft-issue workflow skeleton | Complete | Step 1a, `session.designUrl`, `session.designContext`, and design failure summary paths removed. |
| T004 | Remove design URL reference material from draft-issue bundle | Complete | `skills/draft-issue/references/design-url.md` deleted; related references cleaned. |
| T005 | Remove Design URL support from onboard-project workflow skeleton | Complete | Description, Step 2G summary, Step 5 summary, error states, and diagram updated. |
| T006 | Remove design context from onboard-project greenfield references | Complete | Greenfield starts at interview; candidate synthesis uses interview context only. |
| T007 | Update public README command and workflow docs | Complete | README no longer advertises design URL inputs. |
| T008 | Add changelog entry for the removal | Complete | `CHANGELOG.md` includes the #105 removal in version `1.63.0`. |
| T009 | Update skill inventory baseline | Complete | Inventory audit reports clean with 521 items mapped. |
| T010 | Run compatibility validation | Complete | Compatibility check passed. |
| T011 | Run targeted stale-reference verification | Complete | Live-surface search found no unsupported matches. |
| T012 | Review workflow continuity | Complete | Draft-issue Step 1 -> Step 1b -> Step 2 and onboard Step 2G flow remain coherent. |
| T013 | Create BDD feature file | Complete | `feature.gherkin` contains six scenarios for six ACs. |

---

## Architecture Assessment

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID Principles | 5 | Skill responsibilities remain focused; removal simplifies existing workflows without adding replacement branches. |
| Security | 5 | The live external design archive fetch/decode path is removed; no new ingestion surface or secrets added. |
| Performance | 5 | Removal eliminates an optional network/decode branch and adds no runtime dependency. |
| Testability | 4 | Static and script gates passed; live nested Codex exercise was blocked by environment policy and is documented as follow-up. |
| Error Handling | 5 | Removed design-fetch error states cleanly; existing onboarding failure handling remains intact. |

## Test Coverage

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes | N/A, design artifact | Yes |
| AC2 | Yes | N/A, design artifact | Yes |
| AC3 | Yes | N/A, design artifact | Yes |
| AC4 | Yes | N/A, design artifact | Yes |
| AC5 | Yes | N/A, design artifact | Yes |
| AC6 | Yes | N/A, design artifact | Yes |

Coverage summary:

- Feature file: 6 scenarios for 6 acceptance criteria.
- Step definitions: N/A for this prompt-contract plugin; Gherkin is used as verification criteria.
- Test execution:
  - `npm --prefix scripts run compat` passed.
  - `node scripts/skill-inventory-audit.mjs --check` passed.
  - `npm test` passed: 5 active suites, 312 tests passed, 14 skipped.
  - Targeted stale-reference searches passed.

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `draft-issue` attempted against local branch source |
| **Exercise Method** | `codex exec --cd <temp-project> --add-dir <repo>` dry-run |
| **Result** | Skipped by environment policy after attempt |
| **Reason** | Sandbox denied access to `/Users/rnunley/.codex/sessions`; escalation for nested Codex/API access was rejected as external-API data exposure risk. |
| **Recommendation** | Manual exercise testing recommended as follow-up if a reviewer requires live Codex transcript evidence. |

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| SDLC runner tests | Pass | `npm test` exited 0 with 312 passed, 14 skipped. |
| Skill exercise test | Pass | Live exercise attempted but blocked by environment policy; manual exercise follow-up explicitly noted per gate pass criteria. |
| Skill inventory audit | Pass | `node scripts/skill-inventory-audit.mjs --check` exited 0: 521 items mapped. |
| Prompt quality review | Pass | Changed skills have coherent step order, Codex-native references, and no stale Design URL workflow text. |
| Behavioral contract review | Pass | Preconditions/postconditions remain aligned with downstream SDLC flow; live external fetch boundary removed. |

**Gate Summary**: 5/5 passed, 0 failed, 0 incomplete

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| N/A | N/A | N/A | No findings required code changes during verification. | N/A | N/A |

## Remaining Issues

None.

## Recommendations Summary

### Before PR (Must)

- [ ] None.

### Short Term (Should)

- [ ] Run a live manual Codex exercise transcript for `draft-issue` or `onboard-project` if review policy requires evidence beyond static gates.

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `README.md` | 0 | Public command docs cleaned. |
| `skills/draft-issue/SKILL.md` | 0 | Design URL workflow removed. |
| `skills/draft-issue/references/*` | 0 | Deleted design-url branch and removed design context consumers. |
| `skills/onboard-project/SKILL.md` | 0 | Greenfield summary/error/diagram surfaces cleaned. |
| `skills/onboard-project/references/*` | 0 | Interview and candidate generation no longer use design context. |
| `scripts/skill-inventory.baseline.json` | 0 | Audit baseline current. |
| `specs/feature-remove-design-url-support/*` | 0 | Requirements, design, tasks, and Gherkin coverage reviewed. |

## Recommendation

**Ready for PR**

All acceptance criteria pass, no blocking findings remain, and the only residual risk is the environment-blocked live Codex exercise, which is documented as a follow-up.
