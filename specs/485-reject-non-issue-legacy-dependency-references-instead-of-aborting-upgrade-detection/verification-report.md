# Verification Report: Non-issue legacy dependency references abort upgrade detection

**Date**: 2026-10-25
**Issue**: #485
**Reviewer**: Claude Code (architecture-reviewer, verify worker)
**Scope**: Implementation verification against spec

**Verification head**: 020d0205da51e74d2ddd22f2b6821131c7e83354

---

## Executive Summary

Implementation commit `86a2a2a` makes three changes. `parseLegacyDependencyEvidence` now skips markdown table rows. It also drops `#N` references qualified as a pull request or by another project or repository. `detectIssueDependencyUpgrade` turns legacy candidates whose endpoint is not a repository issue into report-only `dependency_dangling_candidate` findings instead of throwing. Validation of existing official edges and of approved edges at apply still fails closed. The upgrade-project workflow and references document the behavior. Regression tests cover every acceptance criterion. Both registered validations pass at the exact head: the full Jest suite and the live `repository.nmg-sdlc-smoke` run. All five acceptance criteria pass.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | 4.8 |

### Implementation Status: Pass
**Total Issues**: 2 (both low severity, non-blocking, out of this issue's implementation scope)

---

## Issue Scope

- Active issue: #485
- Spec: `specs/485-reject-non-issue-legacy-dependency-references-instead-of-aborting-upgrade-detection`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":485,"specPath":"specs/485-reject-non-issue-legacy-dependency-references-instead-of-aborting-upgrade-detection","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 485 --spec specs/485-… --base main --controller-run-id 59a1b2a1-6bf3-4e97-b7b8-8451e4d3c1bf` exited 0
- Artifact: `.nmg-sdlc/verification/485.json`. Identity: head `020d0205da51e74d2ddd22f2b6821131c7e83354`, clean tree, spec `sha256:22c8c8e8…`, steering `sha256:d2c85d61…`
- Ceiling: `null`
- Coverage: declared 2, recorded 2, complete `true`; nothing missing, duplicated, or unknown

| Validation | Provider | Required | Status | Evidence |
|------------|----------|----------|--------|----------|
| `repository.tests` | `builtin.command` | Yes | Passed | `npm test -- --runInBand` (cwd `scripts`) exited 0: 52 suites passed and 1 skipped; 1147 tests passed and 2 skipped. These skips are pre-existing; this diff adds no skip |
| `repository.nmg-sdlc-smoke` | `project.nmg-sdlc-smoke` | Yes | Passed | Provisioned fresh smoke issue #251 through autopilot draft-issue/write-spec. The closing-PR baseline was empty. `sdlc-execute run #251` ran start → implement → verify → deliver, all passed. Proof: PR https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/253 `MERGED` at `4c1577cc3cc0eaacf91d8db6b01522bfa6bdb7a2`, issue #251 `CLOSED` |

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | PR and table-row references create no candidate | Pass | `scripts/issue-dependencies.mjs`: a `^\s*\|` table-row skip, plus `qualifiedReference` for the `PR` / `pull request` prefix. Tests: `body-relationships.test.mjs` ("ignores table rows and pull-request…") and `issue-dependencies.test.mjs` ("drops qualified references…"). Direct run: both inputs return `{edges:[],findings:[]}` |
| AC2 | References qualified by another project or repository create no candidate | Pass | `qualifiedReference` matches the `owner/repo` prefix, and `<Project> issue` with a capitalized or punctuated word that is not a stop word. Direct run: `PennyScan issue #102 therefore fails` and `depends on Other-Org/other-repo#12` yield no edge. Live repository: `main` proposed the false edge `278 blockedBy 102` from "PennyScan issue #102"; the branch does not |
| AC3 | A dangling legacy candidate becomes a finding and detection completes | Pass | `scripts/sdlc-upgrade.mjs` `detectIssueDependencyUpgrade` filters candidates against `graph.nodes` and pushes `{issue, line, reason:'dependency_dangling_candidate', edge}`. Test: `sdlc-upgrade.test.mjs` "reports dangling legacy candidates as findings and completes detection" (PR #307 and absent #404 become findings; valid additions remain; the `steering-runtime` category is still present; no POST). Live: `node scripts/sdlc-upgrade.mjs detect --root .` exited 0 over 255 issues and 7 categories, with one `dependency_dangling_candidate` (#485 → #307) |
| AC4 | Genuine sequencing clauses and field lines are preserved | Pass | `After` is in `QUALIFIER_STOP_WORDS`. Tests assert edges `blockedBy 394`, `10`, and `11`, and that `Requires #10 and #11` stays `ambiguous_dependency_evidence` |
| AC5 | Dangling existing official edges still fail closed | Pass | `preflightBlockedByEdges` and `validateDependencyGraph` are unchanged for official and approved edges. Tests: "still fails closed on an existing official edge to a non-repository target" (`sdlc-upgrade.test.mjs`) and "still rejects a dangling approved edge…" (`issue-dependencies.test.mjs`) both throw `dependency_dangling` |

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Ignore table rows and qualified references in legacy parsing | Complete | `scripts/issue-dependencies.mjs` |
| T002 | Report dangling legacy candidates as findings | Complete | `scripts/sdlc-upgrade.mjs`; the source is carried through `evidenceByEdge` candidates |
| T003 | Document report-only dangling candidates | Complete | `workflows/upgrade-project/WORKFLOW.md` step 7, `references/detection.md` step 6, `references/v3-detectors.md` §7. The `### Fixed` entry for #485 was written under `[Unreleased]` and has since been rolled into `[4.4.3]` by delivery |
| T004 | Regression coverage | Complete | `body-relationships.test.mjs` +2, `issue-dependencies.test.mjs` +2, `sdlc-upgrade.test.mjs` +2 |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Parsing heuristics stay in the adapter (`issue-dependencies.mjs`); graph membership and report shaping stay in the upgrade detector |
| Open/Closed | 4 | The qualifier heuristic is a fixed stop-word set and regexes; a new qualifier form needs a code edit. That is acceptable for migration-only evidence |
| Liskov Substitution | 5 | N/A; the report shape is additive (a new finding reason) |
| Interface Segregation | 5 | The public function signatures are unchanged |
| Dependency Inversion | 4 | Detection still receives `run` by injection; tests stub `gh` |

### Layer Separation

The script-layer change stays within the issue-dependencies adapter and the upgrade detector, as `steering/snippets/project-tech.md` (Issue Dependencies) requires. Body relations remain migration evidence inside upgrade detection only.

### Dependency Flow

No new imports or dependencies. Zero-dependency runtime preserved.

---

## Security Assessment

- [x] Authentication: unchanged (`gh` CLI)
- [x] Authorization: no new remote writes. Dangling candidates are never POSTed, and apply still preflights the approved exact edge set
- [x] Input validation: issue bodies are treated as data; regexes are linear and anchored at the end of a bounded prefix
- [x] Injection prevention: no shell interpolation added
- [x] Data protection: no secrets touched

## Performance Assessment

- [x] Async patterns: unchanged
- [x] Caching: N/A
- [x] Resource management: one `Set` of issue numbers per detection, O(nodes + candidates)
- [x] Query optimization: no added `gh` calls

## Testability and Error Handling

- Testability (5): deterministic parser tests plus a stubbed-`gh` detection test cover every AC, including the negative fail-closed paths.
- Error handling (5): the previous single-candidate abort is now a named, report-only finding that carries the source line and edge. Fail-closed behavior is kept for official edges, approved edges, unreadable pages, and cycles.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Jest equivalent | Yes |
| AC2 | Yes (SCN002) | Jest equivalent | Yes |
| AC3 | Yes (SCN003) | Jest equivalent | Yes |
| AC4 | Yes (SCN004) | Jest equivalent | Yes |
| AC5 | Yes (SCN005) | Jest equivalent | Yes |

### Coverage Summary

- Feature file: 5 scenarios (`feature.gherkin`), each mapped to Jest contract tests
- Targeted suites (`issue-dependencies`, `body-relationships`, `sdlc-upgrade`): 154/154 passed
- Full suite (registered): 1147 passed, 2 skipped (pre-existing), 0 failed
- `git diff --check origin/main...HEAD`: clean

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `upgrade-project` (detection CLI behind it) |
| **Test Project** | This repository's live issue graph (read-only `detect`), compared with `origin/main` in a separate disposable worktree |
| **Exercise Method** | `node scripts/sdlc-upgrade.mjs detect --root .`. `/sdlc-upgrade-project` is an interactive plan-mode command, and `claude -p` prints `Run /sdlc-upgrade-project in the TUI.`, so the deterministic detector that the workflow calls is the exercise surface |
| **Interactive gate handling** | N/A (automated worker; no apply) |
| **Result** | Branch: exit 0, 7 categories, 255 issues, 2 additions, 1 `dependency_dangling_candidate`. `main`: exit 0, 3 additions including the false `278 blockedBy 102` from "PennyScan issue #102", which the fix removes |

---

## Fixes Applied

None. The lease's writable scope is limited to this report.

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Low | Delivery / versioning | `VERSION`, `package.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md` | The branch carries two delivery version commits (`78139d9` 4.4.1→4.4.2 before implementation existed, then `020d020` 4.4.2→4.4.3). `[4.4.2]` holds only the `Changed` title line, and `[4.4.3]` repeats it alongside the `Fixed` entry. One patch fix therefore consumes two patch numbers | Outside this verify lease's writable scope, and outside #485's ACs. A hand edit would break `hasSynchronizedDeliveryState` and trigger a third bump. The root cause is a delivery-ordering issue in the plugin pipeline and should be tracked separately |
| Low | Heuristic precision | `scripts/issue-dependencies.mjs` `qualifiedReference` | A capitalized non-stop-word before `issue` (for example `After the API issue #5`) is treated as a project qualifier, so the edge is not proposed | Conservative by design: a false negative only omits a migration proposal and never creates a wrong edge. Inline code spans are not stripped, which is pre-existing behavior |

## Recommendation

Ready for PR.
