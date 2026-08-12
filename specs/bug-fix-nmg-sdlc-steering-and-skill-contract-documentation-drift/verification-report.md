# Verification Report: Fix nmg-sdlc Steering and Skill-Contract Documentation Drift

**Date**: 2026-08-12
**Issue**: #142
**Reviewer**: Codex
**Scope**: Defect-fix verification against the active specification

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Blast-Radius Architecture | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **5.0** |

**Implementation Status**: Pass — defect fix
**Total Issues**: 0

The stale standalone-project identity, inapplicable placeholder sections, and inactive Codex resource claims no longer reproduce. The implementation is limited to the three steering documents and one focused contract test described by the approved defect design.

## Spec Context

- activeSpec: `specs/bug-fix-nmg-sdlc-steering-and-skill-contract-documentation-drift/`
- relatedSpecs:
  - `specs/feature-setup-steering-skill/` (explicit `Related Spec` link; steering-document lineage)
- metadataOnlyCount: 83
- scannedSpecCount: 85
- loadedSpecCount: 2
- gaps: none

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Project naming drift is removed while intentional marketplace/cache references remain | Pass | `steering/product.md:1`, `steering/product.md:10`, `steering/tech.md:1`, `steering/structure.md:1`, `steering/structure.md:200`; contextual sweep found only intentional `README.md` marketplace commands and `skills/upgrade-project/references/verification.md:17` cache-path guidance |
| AC2 | Repo steering contains no unresolved or inapplicable database/UI placeholders | Pass | Database and UI/design-token sections are absent; placeholder sweep of `steering/tech.md` and `steering/structure.md` returned no `[convention]`, `[example]`, or `[token]` matches; protected by `scripts/__tests__/steering-contract.test.mjs:44` |
| AC3 | Skill, agent, and plugin contract guidance matches live files and is regression-tested | Pass | `steering/tech.md:127`, `steering/tech.md:144`, `steering/tech.md:154`, `steering/tech.md:224`; all 16 skills and 3 agent prompts expose only `name` and `description`; enforced by `scripts/__tests__/steering-contract.test.mjs:53` |

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Correct repo steering contracts | Complete | All three scoped steering files satisfy their acceptance checks; no skill-bundled files changed |
| T002 | Add steering drift regression coverage | Complete | Four focused Jest tests cover identity, placeholders, resource contracts, and preserved marketplace guidance |
| T003 | Verify documentation and contract consistency | Complete | Focused/full suites, inventory audit, contextual sweep, and diff checks pass |

## Defect Reproduction and Regression Evidence

| Check | Before Fix | After Fix |
|-------|------------|-----------|
| Standalone identity | Repo steering named the former `nmg-plugins` context | Product, technical, and structure steering identify `nmg-sdlc`; the manifest example uses the standalone repository URL |
| Placeholder standards | Database and UI/design-token template sections remained authoritative | Inapplicable sections and unresolved placeholder markers are absent |
| Resource contracts | Steering claimed inactive `allowedTools` and agent execution-control fields | Guidance matches live two-field skill/agent frontmatter and reusable prompt-contract behavior |

All 3 scenarios in `feature.gherkin` are tagged `@regression`, map one-to-one to AC1-AC3, and have executable Jest contract coverage.

## Architecture Assessment — Defect Blast Radius

- Shared callers: all SDLC skills read steering as project context, so corrected wording improves their inputs without changing their executable workflow contracts.
- Public contracts: no function signature, return type, CLI, manifest, or exception behavior changed.
- Data behavior: no stored or runtime data is dropped or reinterpreted.
- Minimal-change check: the implementation changes only `steering/product.md`, `steering/tech.md`, `steering/structure.md`, and `scripts/__tests__/steering-contract.test.mjs`; the active defect spec and this report are SDLC artifacts. No unrelated refactor or formatting churn is present.
- Security/performance/error handling: documentation and a read-only static contract test introduce no credential, input-execution, blocking-I/O, or runtime error-path changes.

## Test Coverage

| Acceptance Criterion | Has Scenario | Executable Contract Coverage | Passes |
|---------------------|--------------|------------------------------|--------|
| AC1 | Yes | Yes | Yes |
| AC2 | Yes | Yes | Yes |
| AC3 | Yes | Yes | Yes |

- Focused regression: 1 suite, 4 tests passed.
- Full Jest suite: 19 suites passed, 3 skipped; 410 tests passed, 17 skipped.
- Skill inventory audit: clean, 561 items mapped.
- `git diff --check`: passed.
- Exercise testing: not applicable; no `skills/*/SKILL.md` or `agents/*.md` file changed.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| SDLC runner tests | Pass | `npm test` from `scripts/` exited 0: 19 suites and 410 tests passed |
| Behavioral contract review | Pass | The new contract test has explicit repository-file preconditions, detects all specified drift postconditions, preserves intentional marketplace invariants, and stays within the approved steering/frontmatter boundary |

**Gate Summary**: 2/2 applicable gates passed, 0 failed, 0 incomplete. Three skill-change-only gates were not applicable.

## Fixes Applied During Verification

None. Verification found no implementation defect requiring an autofix.

## Remaining Issues

None.

## Positive Observations

- The regression test asserts stable contract facts rather than snapshotting entire documents.
- Intentional external marketplace and installed-cache references are preserved contextually instead of being banned globally.
- The fix adds no dependencies and follows the existing ESM/Jest pattern with Node.js built-ins.

## Recommendation

**Ready for PR.** All 3 acceptance criteria and all 3 regression scenarios are covered and passing, both applicable steering gates pass, and no remaining issue or blast-radius concern was found.
