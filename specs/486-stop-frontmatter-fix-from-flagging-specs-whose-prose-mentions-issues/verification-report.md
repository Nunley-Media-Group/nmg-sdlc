# Verification Report: frontmatter-fix flags specs whose prose mentions Issues

**Date**: 2026-10-25
**Issue**: #486
**Reviewer**: Claude Code (architecture-reviewer, verify worker)
**Scope**: Implementation verification against spec

**Verification head**: 4a482c3d042a94e0002f099d51375f873fccf7e3

---

## Executive Summary

Implementation commit `55759f5` makes two changes to `scripts/sdlc-upgrade.mjs`:

- `detectUpgrade` now treats a package as plural only when it has a `**Issues**:` field line (`/^\*\*Issues\*\*:/m`). Before, any occurrence of the word "Issues" in `requirements.md` counted.
- `rewriteFrontmatter` now updates `# Issue:` / `# Issues:` / `# Status:` comment headers in place, keeping their comment syntax. It counts `# Field:` comment lines as existing fields, and adds any missing field in the style the file already uses.

The upgrade-project detector reference documents both rules, and four regression tests cover AC1–AC4. A side-by-side run of the `main` and branch versions of `rewriteFrontmatter` gives byte-identical output for five bold-only inputs. On the exact #404-style gherkin, it shows `main` producing the duplicated bold header and the branch preserving the comment header. A live `detect --root .` on this repository reports no `frontmatter-fix` items. Both registered validations pass at the exact head: the full Jest suite and the live `repository.nmg-sdlc-smoke` run. All four acceptance criteria pass.

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
**Total Issues**: 1 (low severity, non-blocking, outside the verify worker's writable scope)

---

## Issue Scope

- Active issue: #486
- Spec: `specs/486-stop-frontmatter-fix-from-flagging-specs-whose-prose-mentions-issues`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":486,"specPath":"specs/486-stop-frontmatter-fix-from-flagging-specs-whose-prose-mentions-issues","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 486 --spec specs/486-… --base main --controller-run-id 59a1b2a1-6bf3-4e97-b7b8-8451e4d3c1bf` exited 0 with `ok: true`
- Artifact: `.nmg-sdlc/verification/486.json`. Identity: head `4a482c3d042a94e0002f099d51375f873fccf7e3`, clean tree, spec `sha256:6e899858…`, steering `sha256:d2c85d61…`
- Ceiling: `null`
- Coverage: declared 2, recorded 2, complete `true`; nothing missing, duplicated, or unknown

| Validation | Provider | Required | Status | Evidence |
|------------|----------|----------|--------|----------|
| `repository.tests` | `builtin.command` | Yes | Passed | `npm test -- --runInBand` (cwd `scripts`) exited 0: 52 suites passed and 1 skipped; 1151 tests passed and 2 skipped. These skips are pre-existing; this diff adds no skip |
| `repository.nmg-sdlc-smoke` | `project.nmg-sdlc-smoke` | Yes | Passed | Provisioned fresh smoke issue #254 through autopilot draft-issue/write-spec; its spec PR #255 is `MERGED`. The closing-PR baseline was empty. `sdlc-execute run #254` ran start → implement → verify → deliver, all passed. Proof: PR https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/256 `MERGED` at `1539ecb74300cf312c0a5f0aa8bc7d9fe316a48f`, issue #254 `CLOSED` |

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Prose "Issues" does not trigger frontmatter-fix | Pass | `scripts/sdlc-upgrade.mjs` `detectUpgrade`: `isPlural = /^\*\*Issues\*\*:/m.test(req)`. Test: "does not flag a singular package whose prose or heading contains \"Issues\" (AC1)" uses `specs/404-restrict-drafted-issues-and-specs` and the heading "Restrict Drafted Issues and Specs". Live: `node scripts/sdlc-upgrade.mjs detect --root .` exited 0 with 0 `frontmatter-fix:` items |
| AC2 | A plural Issues field still triggers frontmatter-fix | Pass | Same condition; `numsInFm` and `extractPrimaryN` are unchanged. Test: "still flags a plural **Issues** field… (AC2)" asserts `{kind:'frontmatter-fix', rel:'specs/7-x', primaryN:7}` |
| AC3 | Gherkin comment headers are updated in place without duplicates | Pass | `rewriteFrontmatter` rewrites `^#[ \t]*Issues?:` → `# Issue: #N` and `^#[ \t]*Status:` → `# Status: T`. `has()` accepts the bold and comment forms, and `commentStyle` selects the syntax for inserted lines. Test (AC3) asserts the exact header `# Issue: #7` / `# Date: 2026-01-01` / `# Status: Draft` / `# Author: NMG` and no bold field lines. A direct run on the #404 gherkin shows `main` producing four inserted bold lines plus the leftover comment lines, while the branch output equals the input |
| AC4 | Bold-form frontmatter behavior is preserved | Pass | Test (AC4) asserts byte-exact output `**Issue**: #7` / `**Status**: Draft` with the other lines unchanged. The `main` and branch functions give identical output for five bold-only inputs: plural with all fields, `Amended` status, no frontmatter, Issue only, and Status missing |

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Detect plural Issues only from the field line | Complete | `scripts/sdlc-upgrade.mjs` `detectUpgrade` |
| T002 | Normalize gherkin comment headers in place | Complete | `scripts/sdlc-upgrade.mjs` `rewriteFrontmatter` |
| T003 | Document frontmatter normalization | Complete | `workflows/upgrade-project/references/v3-detectors.md` §8 has two new statements. The `### Fixed` entry for #486 was written under `[Unreleased]`; delivery commit `4a482c3` has since rolled it into `[4.4.4]` |
| T004 | Regression coverage | Complete | `scripts/__tests__/sdlc-upgrade.test.mjs`: new describe block "sdlc-upgrade frontmatter-fix normalization (#486)" with 4 tests |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Detection and rewrite each stay in their existing function |
| Open/Closed | 5 | Small `fieldPattern` / `has` / `fieldLine` / `insertAfter` helpers replace four near-duplicate blocks; adding a field is a single line |
| Liskov Substitution | 5 | N/A |
| Interface Segregation | 5 | `rewriteFrontmatter(content, targetN, targetStatus)` keeps its signature; all four callers (rename, frontmatter-fix, split, flatten) are unchanged |
| Dependency Inversion | 5 | Pure string transform; no new dependencies |

### Layer Separation

The change is confined to the script layer (`scripts/sdlc-upgrade.mjs`) and its on-demand reference. No workflow entrypoint or runtime library is touched.

### Dependency Flow

No new imports. The runtime stays zero-dependency.

---

## Security Assessment

- [x] Authentication: N/A
- [x] Authorization: no new remote or filesystem writes; apply still requires approved item ids
- [x] Input validation: spec content is treated as data. Regexes are line-anchored with no nested quantifiers, so there is no ReDoS risk. `fieldPattern` interpolates only the fixed literals `Issue` / `Date` / `Status` / `Author`
- [x] Injection prevention: no shell use added
- [x] Data protection: N/A

## Performance Assessment

- [x] Async patterns: unchanged (synchronous bounded CLI)
- [x] Caching: N/A
- [x] Resource management: a constant number of regex passes per file. `today` is now computed once rather than up to three times
- [x] Query optimization: no added `gh` calls

## Testability Assessment

The rewrite is deterministic, and the default date applies only to inserted fields. The tests assert whole-file byte equality rather than substrings.

## Error Handling Assessment

The behavior of the fail-closed paths is unchanged. Score 4: a markdown H1 that literally begins `# Status:` or `# Issue:` would now be treated as a comment field. No spec template produces such a heading, so this is not filed as a finding.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Yes (Jest) | Yes |
| AC2 | Yes (SCN002) | Yes (Jest) | Yes |
| AC3 | Yes (SCN003) | Yes (Jest) | Yes |
| AC4 | Yes (SCN004) | Yes (Jest) | Yes |

### Coverage Summary

- Feature files: 4 scenarios
- Step definitions: implemented as Jest contract tests in `scripts/__tests__/sdlc-upgrade.test.mjs`
- Unit tests: 4 new; full suite 1151 passed and 2 skipped (pre-existing)

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Reason** | The only workflow file changed is the reference `workflows/upgrade-project/references/v3-detectors.md`, a documentation statement for the interactive `/sdlc-upgrade-project`. That command needs the TUI: under `claude -p` it prints `Run /sdlc-upgrade-project in the TUI.` No deterministic upgrade fixture exists under `scripts/__fixtures__/skill-exercise/` |
| **Substitute evidence** | Detect and apply were run directly against the changed script. The live `node scripts/sdlc-upgrade.mjs detect --root .` exited 0 with 0 `frontmatter-fix` items. The `main` and branch `rewriteFrontmatter` functions were compared side by side, and Jest exercised the full `detectUpgrade` → `applyUpgrade` path |
| **Recommendation** | None required; the behavior change lives entirely in the deterministic script |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `repository.tests`: `npm test -- --runInBand` exited 0 (1151 passed, 2 pre-existing skips) |
| Live smoke project | Pass | `repository.nmg-sdlc-smoke`: smoke issue #254 `CLOSED`, PR #256 `MERGED` at `1539ecb74300cf312c0a5f0aa8bc7d9fe316a48f`, outside an empty baseline |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: "clean (90 items mapped)", exit 0 |
| Claude Code plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository`: "Plugin surface validation passed", exit 0 |
| Skill creator validation | Pass | The implement stage owned the single skill-bundled edit (`v3-detectors.md`). The verify worker made no skill-bundled edits |
| Skill exercise | N/A | No deterministic fixture for upgrade-project; see Exercise Test Results |
| Prompt quality | Pass | The two added reference statements are single-interpretation, testable, and consistent with the script |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |

**Gate Summary**: 7/7 applicable gates passed, 0 failed, 0 incomplete (1 N/A)

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | No fixes were needed | — | — |

## Remaining Issues

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Documentation |
| **Location** | `CHANGELOG.md` `[4.4.4]` |
| **Issue** | Delivery commit `4a482c3` added a `### Changed` bullet ("Stop frontmatter-fix from flagging specs whose prose mentions Issues (#486)"). It duplicates the `### Fixed` entry for the same defect |
| **Impact** | Cosmetic redundancy in the release notes |
| **Reason Not Fixed** | Outside the verify worker's publication scope (only `verification-report.md` is writable). It comes from delivery's changelog generation, not from this issue's implementation |

---

## Positive Observations

- The detection fix is a minimal one-line change, applied exactly where the root cause sits.
- The rewrite refactor removes duplication, and both the tests and the side-by-side comparison show bold-only output is unchanged.
- The tests reproduce the original #404 shape and assert whole-file output.

---

## Recommendations Summary

### Before PR (Must)
- [x] None

### Short Term (Should)
- [ ] Have delivery skip the generic `### Changed` bullet when the issue already has a `### Fixed` entry

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-upgrade.mjs` | 0 | `detectUpgrade` `isPlural`; `rewriteFrontmatter` |
| `scripts/__tests__/sdlc-upgrade.test.mjs` | 0 | 4 new tests |
| `workflows/upgrade-project/references/v3-detectors.md` | 0 | §8 documentation |
| `CHANGELOG.md` | 1 | Redundant `### Changed` bullet (low) |
| `VERSION`, `package.json`, `.claude-plugin/plugin.json` | 0 | All synchronized at 4.4.4 (patch for `bug`) |

---

## Recommendation

**Ready for PR**

All acceptance criteria, tasks, and applicable gates pass at the exact head `4a482c3d042a94e0002f099d51375f873fccf7e3`. Coverage of the registered results is complete and the ceiling is null.
