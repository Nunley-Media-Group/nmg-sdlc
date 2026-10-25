# Verification Report: steering-v4-host-language rewrites Oh My Pi prose into contradictory steering

**Date**: 2026-10-25
**Issue**: #487
**Reviewer**: Claude Code (nmg-sdlc:architecture-reviewer, verify worker)
**Scope**: Implementation verification against spec
**Verification head**: e2412358a10b7b50a2feef602a8edf380b3cafbc

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | 4.8 |

### Implementation Status: Pass
**Total Issues**: 1 (Low, non-blocking)

The defect is fixed. `scripts/sdlc-upgrade.mjs` no longer substitutes `Oh My Pi` / whole-word `OMP` prose with `Claude Code`. Snippet lines that contain that prose are recorded as report-only `proseFindings { file, line, text }`, and a category with only prose findings is `actionable: false`; applying it returns `already-current` with no write. Command-token and validation `config.program` / `config.args` mapping is unchanged. Both registered required validations passed at the verification head, including the live `repository.nmg-sdlc-smoke` delivery.

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 487 --spec specs/487-… --base main --controller-run-id 3c3fdbe4-1f43-47cd-a47c-73040c5b9a32`, which exited 0 with `ok: true` and `ceiling: null`
- Artifact: `.nmg-sdlc/verification/487.json`, identity `headSha` `e2412358a10b7b50a2feef602a8edf380b3cafbc`, tree `clean`
- Coverage: `declared: 2`, `recorded: 2`, `complete: true`, with no missing, duplicate, or unknown results

---

## Issue Scope

- Active issue: #487
- Spec: `specs/487-remove-the-oh-my-pi-prose-rewrite-from-steering-v4-host-language`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002, T003]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":487,"specPath":"specs/487-remove-the-oh-my-pi-prose-rewrite-from-steering-v4-host-language","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Prose host names are not rewritten | Pass | `scripts/sdlc-upgrade.mjs` `planSteeringHostLanguage` pushes `proseFindings` and rewrites only tokens. `detectSteeringHostLanguage` sets `actionable = occurrences.length > 0`. Covered by the test "reports a prose-only Oh My Pi mention…" (`scripts/__tests__/sdlc-upgrade.test.mjs`). Disposable repro: `actionable:false`, `occurrences:[]`, `proseFindings:[{file:"steering/snippets/project-product.md",line:1,text:"It is not a Codex or Oh My Pi plugin."}]`; apply returned `already-current` and the snippet was byte-identical |
| AC2 | Applying the category leaves prose byte-for-byte | Pass | Disposable repro: the snippet became `herdr integration install claude\nOh My Pi and OMP agree\n`. The existing apply test now expects line 5 unchanged and token occurrences on lines 1–4 only |
| AC3 | Validation config mapping is preserved | Pass | Disposable repro: `{"program":"claude","args":["-p","x"],…}`. The apply test asserts `{ program: 'claude', args: ['-p', 'scripts/exercise-claude.mjs'], … }` |
| AC4 | Contract documentation matches behavior | Pass | `workflows/upgrade-project/WORKFLOW.md` step 12a, `references/v3-detectors.md` §14, `references/detection.md` §12, and `references/upgrade-procedures.md` describe token/validation mapping plus report-only `proseFindings`. The new contract test in `scripts/__tests__/upgrade-v4-host-language-contract.test.mjs` asserts `proseFindings` and `report-only prose`, and asserts the absence of the `Oh My Pi`/`OMP` → `Claude Code` substitution |

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | `rewriteV3SnippetText` removed; snippets go through `rewriteV3HostTokens` only |
| FR2 | Pass | `proseFindings` emitted; prose alone gives a non-actionable item |
| FR3 | Pass | Token map and validation mapping are untouched; AC3 evidence |
| FR4 | Pass | Docs and tests updated as listed under AC4 |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Stop rewriting prose and report it instead | Complete | Includes the `already-current` no-write path when no occurrences exist |
| T002 | Update the upgrade contract documentation | Complete | All four workflow files updated. CHANGELOG `### Fixed` entry for #487 is present; delivery has already rolled it from `[Unreleased]` to `[4.4.6]` |
| T003 | Regression coverage | Complete | Expectations for AC1, AC2/AC3, and AC4 are present, and `npm test` exits 0 |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Planning collects evidence, detection classifies actionability, and apply writes; each keeps its existing role |
| Open/Closed | 5 | Additive `proseFindings` field; existing item shape preserved |
| Liskov Substitution | 5 | Non-actionable items follow the existing upgrade-item pattern used by other detectors |
| Interface Segregation | 5 | Consumers that ignore `proseFindings` are unaffected |
| Dependency Inversion | 5 | No new dependencies |

### Layer Separation

The change stays inside the `scripts/` deterministic layer and the upgrade-project workflow references. Lifecycle decisions remain in the workflow.

### Dependency Flow

Unchanged.

---

## Security Assessment

- [x] Authentication: N/A
- [x] Authorization: N/A
- [x] Input validation: the prose regex is non-global, so `test()` carries no `lastIndex` state across lines. The unsafe-path checks (`steering_host_language_unsafe_path`) are retained
- [x] Injection prevention: no shell or interpolation added
- [x] Data protection: the fix removes an unintended content mutation; prose is never written

---

## Performance Assessment

- [x] Async patterns: N/A (synchronous bounded CLI inspection, unchanged)
- [x] Caching: N/A
- [x] Resource management: one extra regex test per snippet line
- [x] Query optimization: N/A

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Yes (Jest) | Yes |
| AC2 | Yes (SCN002) | Yes (Jest) | Yes |
| AC3 | Yes (SCN003) | Yes (Jest) | Yes |
| AC4 | Yes (SCN004) | Yes (Jest contract test) | Yes |

### Coverage Summary

- Feature files: 4 scenarios
- Step definitions: Implemented as Jest tests (the project's contract-test layer)
- Full suite: 52 suites passed, 1 skipped; 1156 tests passed, 2 skipped (pre-existing skips)
- Focused suites (`sdlc-upgrade`, `upgrade-v4-host-language`): 2 passed, 144 tests passed

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | upgrade-project detectors (`scripts/sdlc-upgrade.mjs` `detectUpgrade` / `applyUpgrade`) |
| **Test Project** | Disposable `mktemp -d` git project with a copy of this repository's `steering/`, removed afterwards |
| **Exercise Method** | Direct calls to the exported `detectUpgrade` / `applyUpgrade` with network disabled (`includeIssueDependencies: false`). `/sdlc-upgrade-project` is an interactive plan-mode command, and `claude -p` prints `Run /sdlc-upgrade-project in the TUI.` The CLI `detect` without a GitHub remote stops at `dependency_unreadable`, which is unrelated to this change |
| **Interactive gate handling** | N/A (deterministic detector/apply exercise) |

### Captured Output Summary

- AC1 detect: `actionable:false`, `occurrences:[]`, and one `proseFindings` entry at line 1. Apply returned `already-current` and the snippet was unchanged
- AC2/AC3 apply: `status: applied` through the shared steering writer (`mode: update`). The snippet became `herdr integration install claude\nOh My Pi and OMP agree\n` and the config became `{"program":"claude","args":["-p","x"]}`

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC1 | Prose not rewritten | Pass | See above |
| AC2 | Prose byte-for-byte on apply | Pass | See above |
| AC3 | Validation mapping preserved | Pass | See above |

No deterministic `skill-exercise` fixture exists for `upgrade-project`, so the "Skill exercise" gate does not apply.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (contract tests, required) | Pass | `npm test -- --runInBand` exited 0 at `e2412358…`. 1156 passed, 2 skipped |
| `repository.nmg-sdlc-smoke` (live smoke, required) | Pass | Provisioned fresh smoke issue #260 (spec PR #261 MERGED) and ran `sdlc-execute run #260` from this checkout. Issue #260 is CLOSED and PR #262 is MERGED at `ab42e7cc0aac273abbd4e7ec8a92c00161f39d4d`, matching the invocation's pre-merge delivery proof |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check` exited 0 |
| Claude Code plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository` exited 0 |
| Git hygiene | Pass | `git diff --check main...HEAD` exited 0 |
| Skill exercise | N/A | No `upgrade-project` fixture under `scripts/__fixtures__/skill-exercise/`. Covered by the direct detector exercise above |
| Prompt quality | Pass | Step 12a and the references give one testable interpretation: tokens and validations are rewritten, prose is reported only. Cross-references are valid |

**Gate Summary**: 2/2 registered required validations passed (coverage complete). All applicable supplementary gates passed.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None required | — | — |

## Remaining Issues

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Documentation |
| **Location** | `CHANGELOG.md` `[4.4.6]` |
| **Issue** | The delivery-generated `### Changed` bullet "Remove the Oh My Pi prose rewrite from steering-v4-host-language (#487)" duplicates the `### Fixed` entry for the same bug |
| **Impact** | Cosmetic redundancy in release notes. No behavioral effect |
| **Reason Not Fixed** | Outside this verify step's publication scope (only the verification report is writable) |

---

## Positive Observations

- Minimal, targeted change that reuses the existing non-actionable-item pattern
- The apply path re-plans from live state and short-circuits to `already-current`, so a prose-only category can never write
- The regression test pins the exact AC1 fixture line and the exact `proseFindings` value

---

## Recommendations Summary

### Before PR (Must)
- [x] None

### Short Term (Should)
- [ ] Optionally drop the duplicate `### Changed` CHANGELOG bullet in a later docs change

### Long Term (Could)
- [ ] Consider a deterministic `skill-exercise` fixture for `upgrade-project` detectors

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-upgrade.mjs` | 0 | Core fix |
| `scripts/__tests__/sdlc-upgrade.test.mjs` | 0 | AC1–AC3 coverage |
| `scripts/__tests__/upgrade-v4-host-language-contract.test.mjs` | 0 | AC4 coverage |
| `workflows/upgrade-project/WORKFLOW.md` | 0 | Step 12a |
| `workflows/upgrade-project/references/v3-detectors.md` | 0 | §14 |
| `workflows/upgrade-project/references/detection.md` | 0 | §12 |
| `workflows/upgrade-project/references/upgrade-procedures.md` | 0 | Procedure table |
| `CHANGELOG.md` | 1 | Low: duplicate bullet |
| `VERSION`, `package.json`, `.claude-plugin/plugin.json` | 0 | Synchronized at 4.4.6 |

---

## Recommendation

**Ready for PR**

Every delivery AC, FR, task, and scenario is satisfied with direct evidence. Coverage is complete, and both required registered validations, including the live smoke delivery, passed at the verification head.
