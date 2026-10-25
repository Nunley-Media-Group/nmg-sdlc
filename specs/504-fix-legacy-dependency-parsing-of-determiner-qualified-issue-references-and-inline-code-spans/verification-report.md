# Verification Report: Legacy dependency parsing keeps determiner-qualified local references and ignores inline code

**Date**: 2026-10-25
**Issue**: #504
**Reviewer**: Claude Code (architecture-reviewer, verify worker)
**Scope**: Implementation verification against spec
**Verification head**: 292a88f79e4b67b572ae1c9814941924d3d40e09

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

All five acceptance criteria, four functional requirements, three tasks, and five scenarios are satisfied. `qualifiedReference` now treats a capitalized run as local when a determiner comes directly before it. Punctuated names and capitalized words with no determiner stay foreign. `parseLegacyDependencyEvidence` blanks inline code spans before matching and keeps the original line as recorded evidence. Both manifest-registered required validations passed at the verification head.

---

## Issue Scope

- Active issue: #504
- Spec: `specs/504-fix-legacy-dependency-parsing-of-determiner-qualified-issue-references-and-inline-code-spans`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002, T003]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":504,"specPath":"specs/504-fix-legacy-dependency-parsing-of-determiner-qualified-issue-references-and-inline-code-spans","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs --project . --issue 504 --spec specs/504-… --base main --controller-run-id 3c3fdbe4-1f43-47cd-a47c-73040c5b9a32` exited 0 with `ok: true` and `ceiling: null`. `.nmg-sdlc/verification/504.json` has coverage `declared: 2, recorded: 2, complete: true`, with no missing, duplicate, or unknown results. Identity: head `292a88f79e4b67b572ae1c9814941924d3d40e09`, tree `clean`, steering `sha256:d2c85d61…`, spec `sha256:90b4200b…`.

| Validation | Provider | Required | Status | Summary |
|------------|----------|----------|--------|---------|
| `repository.tests` | `builtin.command` | Yes | passed | `npm test -- --runInBand` in `scripts/` exited 0 (52 suites passed, 1 skipped; 1174 tests passed, 2 skipped) |
| `repository.nmg-sdlc-smoke` | `project.nmg-sdlc-smoke` | Yes | passed | `nmg-sdlc-smoke delivered #269` |

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | `After the API issue #5 lands` → one `blockedBy` 5, no findings | Pass | `scripts/issue-dependencies.mjs` `qualifiedReference` determiner-run walk; test `keeps a determiner-qualified local descriptor…`; direct probe returned `{edges:[{blockedBy,5}],findings:[]}` |
| AC2 | `our Auth issue #7` and `the Auth API issue #8` → edges 7 and 8 | Pass | Same walk over the capitalized run `Auth API` reaches `the`; test `keeps a determiner before a run of capitalized words…`; probe confirmed |
| AC3 | `PennyScan issue #102…`, `nmg-pi issue #4`, `the nmg-pi issue #4` → no edges, no findings | Pass | The punctuation check (`/[-._]/`) runs before the determiner walk; with no determiner the walk ends at an empty or lowercase boundary → foreign; test `keeps undetermined and punctuated project qualifiers foreign` |
| AC4 | `` `Requires #9` `` → nothing; ``Requires `#9` and #10`` → only 10 | Pass | `INLINE_CODE_SPAN` blanks spans on a matching copy of each line; the `matches.length === 0 && /#[1-9]/.test(original)` skip suppresses span-only findings; test `ignores inline code spans while keeping a reference outside them` (also covers the `Depends on: \`#7\`` field line) |
| AC5 | Existing table/PR/owner-repo/field/fenced/quoted/ambiguous behavior unchanged | Pass | `git diff main...HEAD` adds tests only; the existing tests `keeps legacy text migration-only…` and `drops qualified references…` pass unchanged; probes for `Blocked by PR #3`, `Requires owner/repo#4`, `Depends on: #3, #4` and an ambiguous two-reference clause return the prior results |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Correct qualifier classification and strip inline code | Complete | `scripts/issue-dependencies.mjs`. The design placed span removal in `stripIgnoredProse`; the implementation instead blanks spans per line in a matching copy, so evidence `source`/`line` text stays faithful to the body. The behavior required by FR3 is identical. |
| T002 | Add behavioral regression coverage | Complete | Four new `toEqual` cases in `scripts/__tests__/issue-dependencies.test.mjs`; existing cases unchanged |
| T003 | Document the corrected parsing rules | Complete | `workflows/upgrade-project/references/v3-detectors.md` names inline code spans and the determiner rule with the `PennyScan`/`nmg-pi` foreign examples. The `CHANGELOG.md` `### Fixed` entry for #504 now sits under `[4.4.9]` after the delivery roll. Whether `skill-creator` was invoked for the earlier implementation edit cannot be checked after the fact; the resulting bundle passes plugin-surface and inventory validation. |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Qualifier classification stays in `qualifiedReference`; span handling stays in the parse loop |
| Open/Closed | 5 | Determiners are a named `QUALIFIER_DETERMINERS` set |
| Liskov Substitution | 5 | N/A beyond an unchanged exported signature |
| Interface Segregation | 5 | `parseLegacyDependencyEvidence` return shape unchanged |
| Dependency Inversion | 5 | No new imports; zero-dependency runtime preserved |

### Layer Separation

The change is confined to the script layer (`scripts/issue-dependencies.mjs`) and its detector reference. The only production consumer is upgrade detection, as the design describes.

### Dependency Flow

Unchanged. A new candidate edge still goes through the dangling-candidate and cycle checks.

---

## Security Assessment

- [x] Authentication: N/A
- [x] Authorization: N/A
- [x] Input validation: issue body text is treated as data; the regexes are linear (a lazy `[^\n]*?` bounded to one line, with no nested quantifiers)
- [x] Injection prevention: no shell or eval paths
- [x] Data protection: original issue text is preserved in evidence and never mutated

## Performance Assessment

- [x] Async patterns: N/A (pure sync parse)
- [x] Caching: N/A
- [x] Resource management: one extra per-line regex replace and a backward word scan bounded by line length
- [x] Query optimization: N/A

## Testability Assessment

Pure function with deterministic inputs. The new cases assert the full `{ edges, findings }` result.

## Error Handling Assessment

Ambiguous input still becomes a finding, not an edge. An unmatched backtick stays literal: `Requires \` #5` yields edge 5. A span-only `#N` is skipped silently rather than reported, which FR3 requires. Score 4 because that silent skip is a heuristic (any `#[1-9]` in the original line), though it is correct for every specified case.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Jest case | Yes |
| AC2 | Yes (SCN002) | Jest case | Yes |
| AC3 | Yes (SCN003) | Jest case | Yes |
| AC4 | Yes (SCN004) | Jest case | Yes |
| AC5 | Yes (SCN005) | Existing Jest cases | Yes |

### Coverage Summary

- Feature files: 5 scenarios
- Step definitions: Jest contract tests are the executable form (project convention)
- Unit tests: 4 new cases plus the existing `issue-dependencies` suite; full suite of 1174 tests passed
- Skipped: 1 suite and 2 tests, env-gated in pre-existing files; none are in the changed test file

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Reason** | The only workflow-bundled change is the reference text `workflows/upgrade-project/references/v3-detectors.md`. `/sdlc-upgrade-project` is an interactive plan-mode command that refuses `claude -p` ("Run /sdlc-upgrade-project in the TUI."), and no deterministic fixture exists (`skill-exercise-runner --skill upgrade-project`: fixture not found). The behavior the reference describes lives entirely in `parseLegacyDependencyEvidence`, which is proven by Jest and by direct probes. |
| **Recommendation** | None required; the documentation change describes script behavior that is already verified |

---

## Real Smoke Lifecycle Evidence

`repository.nmg-sdlc-smoke` (provider `project.nmg-sdlc-smoke`, required, applicable) **passed** at head `292a88f79e4b67b572ae1c9814941924d3d40e09`, after the local prerequisite `repository.tests` passed:

- Provisioning: fresh clone of `Nunley-Media-Group/nmg-sdlc-smoke`; a provider-owned Herdr pane with `NMG_SDLC_AUTOPILOT=1` loaded this checkout through `--plugin-dir` and ran `/sdlc-draft-issue`, then `/sdlc-write-spec 269`. Issue #269 was provisioned, and spec PR #270 is MERGED.
- Delivery: separate clone; recorded the closing-PR baseline for #269; ran `sdlc-execute run #269`; post-run proof shows issue #269 **CLOSED** and PR #271 **MERGED** at `472cfc4ec2954d9f42c1b98a26a109537c8e6a0e`, outside the baseline.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `repository.tests` passed; `npm test -- --runInBand` exited 0 |
| Live smoke project | Pass | `repository.nmg-sdlc-smoke` passed: nmg-sdlc-smoke #269 CLOSED via PR #271 MERGED |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check` exited 0 |
| Claude Code plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository` exited 0 |
| Skill creator validation | Pass | No skill-bundled edits during verification; the affected bundle passes surface and inventory validation |
| Skill exercise | N/A | No deterministic fixture for `upgrade-project` |
| Prompt quality | Pass | The `v3-detectors.md` bullets are unambiguous, name the exact determiner set, and give foreign and local examples |
| Git hygiene | Pass | `git diff --check main...HEAD` exited 0 |

**Gate Summary**: 7/7 applicable gates passed, 0 failed, 0 incomplete (1 N/A)

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None | — | — |

## Remaining Issues

### Critical Issues
None.

### High Priority
None.

### Medium Priority
None.

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Release hygiene |
| **Location** | `CHANGELOG.md` `[4.4.9]` |
| **Issue** | The delivery roll added a generated `### Changed` entry ("Fix legacy dependency parsing … (#504)") alongside the hand-written `### Fixed` entry for the same issue, so #504 appears twice |
| **Impact** | Cosmetic duplication in release notes; no functional effect |
| **Reason Not Fixed** | Outside this verify step's publication scope (only `verification-report.md` is writable). The roll was produced by the installed 4.4.0 controller, which predates the #503 duplicate-entry fix in 4.4.8. It can be corrected in a follow-up. |

---

## Positive Observations

- The evidence `source` and `line` keep the original text, including backticks, so the migration record stays faithful to the issue body.
- The determiner walk stops at the first determiner, so `The API issue #5` at the start of a line is still local.
- The tests assert the full result with `toEqual`, which catches stray findings as well as missing edges.

---

## Recommendations Summary

### Before PR (Must)
- [x] None

### Short Term (Should)
- [ ] Remove the duplicate `### Changed` #504 line from `CHANGELOG.md` `[4.4.9]`

### Long Term (Could)
- [ ] Add a deterministic `upgrade-project` exercise fixture for issue-dependency detection

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/issue-dependencies.mjs` | 0 | Qualifier and inline-code changes |
| `scripts/__tests__/issue-dependencies.test.mjs` | 0 | Four new regression cases |
| `workflows/upgrade-project/references/v3-detectors.md` | 0 | Detector contract updated |
| `CHANGELOG.md` | 1 | Duplicate #504 entry (Low) |
| `VERSION`, `package.json`, `.claude-plugin/plugin.json` | 0 | Synchronized at 4.4.9 |

---

## Recommendation

**Ready for PR**

Every delivery AC, FR, task, and scenario passes, with code and test evidence. Registered coverage is complete, and both required validations, including the real smoke lifecycle, passed at the exact verification head. The only open item is a cosmetic, low-severity changelog duplicate.
