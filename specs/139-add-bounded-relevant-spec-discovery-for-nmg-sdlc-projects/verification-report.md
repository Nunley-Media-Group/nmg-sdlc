# Verification Report: Add Bounded Relevant-Spec Discovery for nmg-sdlc Projects

**Date**: 2026-04-30
**Issue**: #139
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
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | 5 |

**Status**: Pass
**Total Issues**: 0

Issue #139 is implemented. The branch adds the shared bounded spec-context contract, project `AGENTS.md` contract, skill wiring, public docs, changelog entry, static contract tests, and disposable-project exercise coverage required by the spec. No fixes were required during verification.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | SDLC always establishes active-plus-neighboring spec context | Pass | `references/spec-context.md` defines canonical `specs/` context and active-plus-neighboring loading; affected skills reference it. |
| AC2 | Legacy `.codex/specs/` and `.codex/steering/` are not used as context | Pass | `references/spec-context.md` excludes legacy context and defers to the existing legacy-layout gate. |
| AC3 | Metadata-first discovery prevents context bloat | Pass | `references/spec-context.md` defines compact metadata extraction, thresholds, caps, metadata-only specs, and no full-archive loading by default. |
| AC4 | `write-spec` considers existing surrounding contracts | Pass | `skills/write-spec/references/discovery.md` keeps parent-link resolution first, then applies bounded ranking with threshold-qualified amendment candidates. |
| AC5 | Ambiguous spec context requires a gate | Pass | `references/spec-context.md` and `skills/write-spec/references/discovery.md` define ranked candidate presentation in interactive mode and deterministic threshold behavior in unattended mode. |
| AC6 | Project guidance makes spec context the default | Pass | `references/project-agents.md`, onboarding, and upgrade-project define managed root `AGENTS.md` creation/update while preserving project-authored content. |
| AC7 | Idempotent coverage and verification prove the balance | Pass | `scripts/__tests__/spec-context-contract.test.mjs` and `scripts/__tests__/exercise-spec-context.test.mjs` cover caps, ranking, generic-term rejection, idempotent AGENTS handling, malformed markers, docs, and changelog. |

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Create bounded spec-context contract | Complete | `references/spec-context.md` created. |
| T002 | Create managed project AGENTS contract | Complete | `references/project-agents.md` created. |
| T003 | Wire bounded context into draft-issue investigation | Complete | `skills/draft-issue/SKILL.md` updated. |
| T004 | Upgrade write-spec discovery to shared ranking contract | Complete | `skills/write-spec/SKILL.md` and `skills/write-spec/references/discovery.md` updated. |
| T005 | Add active-plus-neighboring context to implementation planning | Complete | `skills/write-code/SKILL.md` updated. |
| T006 | Add surrounding-spec verification context | Complete | `skills/verify-code/SKILL.md` updated. |
| T007 | Wire managed AGENTS.md into onboarding flows | Complete | Onboard skill plus greenfield/brownfield references updated. |
| T008 | Wire managed AGENTS.md into upgrade flow | Complete | Upgrade skill and procedures updated. |
| T009 | Update public docs and changelog | Complete | `README.md` and `CHANGELOG.md` updated. |
| T010 | Add static contract tests | Complete | `scripts/__tests__/spec-context-contract.test.mjs` added. |
| T011 | Add exercise tests for ranking and AGENTS idempotency | Complete | `scripts/__tests__/exercise-spec-context.test.mjs` added. |
| T012 | Refresh inventory and run verification gates | Complete | Inventory baseline refreshed; all gates passed. |

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Shared spec-context and project-AGENTS concerns are separated into focused references. |
| Open/Closed | 5 | Skills consume shared contracts through reference pointers instead of duplicating ranking logic. |
| Liskov Substitution | 5 | Not materially applicable to Markdown contracts; no substitutability issue found. |
| Interface Segregation | 5 | Result shapes are small and specific: Spec Context and Project AGENTS status. |
| Dependency Inversion | 5 | Skill behavior depends on shared contracts and steering, not hardcoded project details. |

### Layer Separation

The implementation follows the repo architecture: shared cross-skill contracts live in `references/`, per-skill workflow hooks stay in `skills/`, and validation lives in `scripts/__tests__/`.

### Dependency Flow

Skills point to shared references; tests validate contract content and wiring. No cyclic workflow dependency or generated persistent index was introduced.

## Security Assessment

- Authentication: N/A for this prompt-contract feature.
- Authorization: N/A.
- Input validation: Pass; spec-derived content is explicitly text-only.
- Injection prevention: Pass; the contract forbids executing or interpolating spec-derived strings in shell commands.
- Data protection: Pass; AGENTS guidance must not copy secrets, internal URLs, credentials, or long steering excerpts.

## Performance Assessment

- Async patterns: N/A for Markdown contracts.
- Caching: N/A; persistent `specs/INDEX.md` is explicitly out of scope.
- Resource management: Pass; metadata-first scan and cap of 3 related full spec loads bounds context usage.
- Query optimization: Pass; strong signals outrank generic terms and unrelated spec bodies remain metadata-only.

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes | Design artifact | Yes |
| AC2 | Yes | Design artifact | Yes |
| AC3 | Yes | Design artifact | Yes |
| AC4 | Yes | Design artifact | Yes |
| AC5 | Yes | Design artifact | Yes |
| AC6 | Yes | Design artifact | Yes |
| AC7 | Yes | Design artifact | Yes |

### Coverage Summary

- Feature files: 7 scenarios in `feature.gherkin`
- Step definitions: N/A; project uses Gherkin as design artifact plus Jest contract/exercise tests
- Unit/contract tests: 398 passed, 17 skipped
- Integration/exercise tests: `exercise-spec-context.test.mjs` passed

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill/Contract Exercised** | Bounded spec context and project AGENTS contracts |
| **Test Project** | Temporary directories created by Jest under the OS temp directory |
| **Exercise Method** | `npm --prefix scripts test -- --runInBand` |
| **request_user_input gate Handling** | N/A; contract exercise validates deterministic ranking and idempotent managed-artifact behavior |
| **Duration** | 1.448s |

### Captured Output Summary

The exercise tests created disposable projects, generated multiple specs, verified active-plus-capped-related loading, proved strong path/symbol signals outrank generic project terms, and exercised missing, incomplete, equivalent, malformed, and rerun `AGENTS.md` states without duplicate managed sections.

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC1 | Active spec plus neighboring specs | Pass | `loadedSpecCount` is active spec plus 3 related specs. |
| AC3 | Metadata-first and capped loading | Pass | 6 specs scanned, 4 loaded, 2 metadata-only in exercise. |
| AC5 | Ranked candidates and deterministic ordering | Pass | Ranking reasons and path/symbol precedence asserted. |
| AC6 | Managed AGENTS guidance | Pass | Created, updated, already-present, and equivalent states covered. |
| AC7 | Idempotency and no full-archive loading | Pass | Reruns produce one managed section and unrelated specs remain metadata-only. |

### Notes

The verification used the branch's Jest exercise harness rather than spawning a nested `codex exec` skill session. This matches the issue's test strategy for bounded ranking and managed `AGENTS.md` behavior and avoids exercising an installed plugin cache that may not include the branch changes.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| SDLC runner tests | Pass | `npm --prefix scripts test -- --runInBand` exited 0. |
| Skill exercise test | Pass | Branch exercise coverage passed in `scripts/__tests__/exercise-spec-context.test.mjs`. |
| Skill inventory audit | Pass | `node scripts/skill-inventory-audit.mjs --check` exited 0: 561 items mapped. |
| Prompt quality review | Pass | Skill pointers are explicit, shared references are bounded and deterministic, and manual/unattended behavior is documented. |
| Behavioral contract review | Pass | Preconditions, postconditions, invariants, and boundaries are addressed in `references/spec-context.md` and `references/project-agents.md`. |

**Gate Summary**: 5/5 gates passed, 0 failed, 0 incomplete

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| N/A | N/A | N/A | No findings | None | N/A |

## Remaining Issues

None.

## Positive Observations

- The shared-contract design avoids per-skill ranking drift.
- The exercise coverage directly targets the highest-risk behaviors: caps, generic-term filtering, and AGENTS idempotency.
- The implementation keeps project-authored `AGENTS.md` content outside the managed section protected.

## Recommendations Summary

### Before PR (Must)

- [x] No remaining critical or high-priority items.

### Short Term (Should)

- [x] No deferred medium-priority items.

### Long Term (Could)

- [ ] Consider a live nested Codex skill exercise after the branch is installed into the local plugin cache, if reviewers want end-to-end prompt-session evidence beyond the Jest exercise harness.

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `references/spec-context.md` | 0 | Shared bounded discovery contract. |
| `references/project-agents.md` | 0 | Managed root AGENTS contract. |
| `skills/*/SKILL.md` and related references | 0 | Affected skill pointers and workflow hooks. |
| `scripts/__tests__/spec-context-contract.test.mjs` | 0 | Static contract and wiring coverage. |
| `scripts/__tests__/exercise-spec-context.test.mjs` | 0 | Disposable-project exercise coverage. |
| `README.md` / `CHANGELOG.md` | 0 | Public docs and release note. |

## Recommendation

**Ready for PR**

Implementation matches the issue, spec, steering contracts, and verification gates. No remaining blocking issues were found.
