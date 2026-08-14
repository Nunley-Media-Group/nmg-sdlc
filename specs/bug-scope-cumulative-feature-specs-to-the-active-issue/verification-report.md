# Verification Report: Scope Cumulative Feature Specs to the Active Issue

**Date**: 2026-08-14
**Issue**: #162
**Reviewer**: Codex
**Scope**: Implementation verification against the issue-bound defect spec

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
| **Overall** | **4.8** |

**Implementation Status**: Pass
**Total Issues**: 0 remaining

The implementation adds one strict read-only resolver, one versioned cumulative-spec manifest contract, stable Gherkin identifiers, and a shared issue-bound contract for every affected lifecycle consumer. Current delivery, adopted work, explicit regression evidence, earlier completed work, and future work remain distinct. Ambiguous cumulative ownership fails safely and routes to `write-spec` repair.

## Issue Scope

- Active issue: #162
- Spec: `specs/bug-scope-cumulative-feature-specs-to-the-active-issue`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8]; FR [FR1, FR2, FR3, FR4, FR5, FR6]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":162,"specPath":"specs/bug-scope-cumulative-feature-specs-to-the-active-issue","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Acceptance Criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC1: Issue ownership is machine-readable | Pass | `references/issue-spec-scope.md`, `skills/write-spec/templates/issue-scope.json`, and `scripts/issue-spec-scope.mjs` define and validate owned, adopted, and regression mappings. |
| AC2: Implementation executes only the active slice | Pass | `skills/write-code/SKILL.md`, `skills/write-code/references/plan-mode.md`, and the cumulative resolver fixture restrict planning to `delivery.tasks`. |
| AC3: Resumption preserves active scope | Pass | `skills/write-code/references/resumption.md` subtracts completed work only from mapped tasks; the fixture proves adopted T002 plus active T003 while excluding T001 and T004. |
| AC4: Verification separates delivery from regression | Pass | `skills/verify-code/SKILL.md` and `references/report-format.md` separate delivery completion from explicit regression AC/FR/scenario evidence. |
| AC5: Reports and status are issue-bound | Pass | `scripts/sdlc-status.mjs` exposes `spec.scope`, compares the verification scope marker, and refuses cross-issue verification evidence. |
| AC6: Pull requests remain issue-scoped | Pass | `skills/open-pr/SKILL.md` and `references/pr-body.md` filter mapped delivery, list regression separately, link the manifest, and emit one active-issue closing keyword. |
| AC7: Legacy ambiguity fails safely | Pass | Missing/incomplete cumulative maps return `repair_required`; malformed or contradictory inputs return `unverifiable`, both with exact gaps and no whole-spec fallback. |
| AC8: A cumulative fixture proves isolation | Pass | `scripts/__fixtures__/cumulative-issue-scope/` plus resolver, consumer-contract, and status tests cover earlier, active, adopted, regression, and future slices. |

## Regression Obligations

The singular issue #162 defect spec resolves through `implicit_single_issue` and declares no prior regression slice. Its eight `@regression` scenarios are the current defect's own delivery scenarios and all pass through deterministic contract coverage.

## Task Completion

| Task | Status | Evidence |
|------|--------|----------|
| T001: Deterministic contract and resolver | Complete | Strict schema/inventory resolver, non-symlink and bounded reads, shared reference, manifest template, and stable scenario tags. |
| T002: Scope lifecycle consumers | Complete | `write-spec`, `write-code`, resumption, `verify-code`, status, and `open-pr` all consume the shared result. |
| T003: Isolation fixtures and regression coverage | Complete | Committed cumulative fixture, 12 resolver tests, 6 cross-consumer contract tests, and status isolation/cross-issue tests. |
| T004: Document and verify | Complete | README/CHANGELOG updated; inventory baseline regenerated; all applicable gates pass; this report records exact evidence. |

## Architecture Review

| Area | Score (1-5) | Evidence |
|------|-------------|----------|
| SOLID Principles | 4 | The resolver owns one cohesive scope-classification responsibility and status imports it rather than duplicating rules. The validator is intentionally comprehensive in one module, which trades file size for a single authority. |
| Security | 5 | CLI scalars and paths are validated; reads are restricted to exact regular non-symlink artifacts inside the real project root; Markdown is bounded to 256 KiB and the manifest to 128 KiB; no shell interpolation, Git, GitHub, or mutation occurs. |
| Performance | 5 | Inventory scans are bounded to five exact files and stable linear passes over small identifier sets; no dependency or broad archive scan was added. |
| Testability | 5 | Pure classification is separate from file inspection, adapters support deterministic boundary tests, fixtures are network-independent, and stable diagnostics are asserted. |
| Error Handling | 5 | Argument errors use exit code 2; inspection returns stable statuses/reason codes/gaps; malformed, missing, oversized, symlink, cross-issue, and contradictory evidence all fail closed. |

## Test Coverage

- BDD scenarios: 8/8 acceptance criteria mapped to one unique `@SCN... @regression` scenario.
- Focused scope/consumer/status coverage: 54 passing tests.
- Complete Jest suite: 31 suites passed; 296 tests passed; 12 intentional exercise-only tests skipped; 0 failures.
- Syntax: `node --check` passed for `issue-spec-scope.mjs` and `sdlc-status.mjs`.
- JSON: plugin manifest, inventory baseline, manifest template, and cumulative fixture parsed successfully.
- Current defect resolver: `implicit_single_issue`, 8 ACs, 6 FRs, 4 tasks, 8 scenarios, no gaps.
- Cumulative fixture resolver for #20: delivery AC1/AC2, FR1/FR2, T002/T003, SCN002/SCN003; regression AC4/FR4/SCN005; earlier and future slices excluded.

## Exercise Test Results

| Field | Value |
|-------|-------|
| Deterministic source exercise | `node scripts/skill-exercise-runner.mjs --skill status` |
| Result | 14 pass, 0 fail, 0 skipped |
| Live `codex exec` source exercise | Gracefully unavailable |
| Reason | The available CLI is Codex 0.147.0 and loads installed nmg-sdlc 2.0.1 from the plugin cache, not this uncommitted source tree. Running it would prove the older installed artifact rather than issue #162. |
| Recommendation | Re-run a fresh-session installed-artifact exercise after this source change is merged, versioned, and published if installed-surface proof is required. |

Local deterministic evidence is intentionally not represented as installed-plugin proof.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | 31 suites and 296 tests passed; 12 explicitly exercise-only skips; no unexpected failures or orphaned imports. |
| Skill inventory | Pass | Baseline regenerated; `--check` reports 444 items mapped and clean. |
| Codex compatibility | Pass | `codex-compatibility-check.mjs` exited 0. |
| Active plugin surface | Pass | Repository plugin-surface validation exited 0. |
| Skill creator validation | Pass | `write-spec`, `write-code`, `verify-code`, `open-pr`, and `status` bundles all report `Skill is valid!`. |
| Skill exercise | Pass | The changed `status` skill's deterministic fixture satisfied all 14 rubric dimensions. |
| Prompt quality | Pass | Instructions have ordered evidence dependencies, explicit valid/repair/failure paths, safe argument handling, intact decision gates, downstream scope markers, resolvable references, and no historical-capability overstatement. |
| Git hygiene | Pass | `git diff --check` exited 0. |

**Gate Summary**: 8/8 passed, 0 failed, 0 incomplete

## Fixes Applied During Verification

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| High | Security | `scripts/issue-spec-scope.mjs`, `scripts/sdlc-status.mjs` | Initial inspection used normalized paths but did not explicitly reject symlink artifacts or enforce source-size limits. | Added real-root containment, regular non-symlink checks, 256 KiB Markdown and 128 KiB manifest limits, plus regression tests. | `direct` |
| Low | Error handling | `scripts/sdlc-status.mjs` | Verification evidence did not expose `scopeMatch` in every result shape. | Normalized missing/error shapes to `scopeMatch: null`. | `direct` |
| Low | Testing | `scripts/__tests__/status-skill-contract.test.mjs` | One legacy assertion expected the pre-scope status evidence sentence. | Updated it to require active issue scope and the invalid-scope repair boundary. | `direct` |
| Low | Documentation | `references/issue-spec-scope.md` | The shared contract needed the verified symlink and size boundaries. | Added the exact regular-path and bounded-read requirements. | `skill-creator` |
| Major | Review correctness | `scripts/issue-spec-scope.mjs` | Adjacent stable scenario-tag lines replaced rather than accumulated, allowing an ambiguous tag set to appear singular. | Accumulated raw stable tags, reject any count above one, and added a split-line regression test. | `direct` |
| Major | Review integration | `skills/write-code/references/plan-mode.md`, `skills/write-code/references/resumption.md` | Delegated and fresh-run paths still used cumulative or generic task wording. | Pass exact normalized `delivery.tasks` IDs to workers, prohibit other cumulative tasks, and start fresh runs at the first mapped identifier. | `skill-creator` |
| Minor | Documentation | `references/issue-spec-scope.md` | The functional-requirement source-form example contained unescaped Markdown table delimiters. | Replaced the cell with escaped HTML pipe entities. | `skill-creator` |

The required post-fix simplify review found no further worthwhile behavior-preserving cleanup. Focused and full validation were rerun after all fixes.

## Remaining Issues

None.

## Recommendation

**Ready for PR.** All eight acceptance criteria and four tasks are complete, all applicable verification gates pass, the exact active scope is recorded, and no unresolved implementation finding remains.
