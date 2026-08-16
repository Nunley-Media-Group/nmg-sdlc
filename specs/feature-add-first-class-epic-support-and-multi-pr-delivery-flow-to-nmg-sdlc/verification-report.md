# Verification Report: Coordination-Only Epic Lifecycle

**Date**: 2026-08-16
**Issue**: #177
**Reviewer**: Codex
**Scope**: Implementation verification against the issue #177 delivery slice

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **4.8** |

### Implementation Status: Pass
**Total Issues**: 31 found and fixed; 1 false-positive inventory claim disproved and revalidated; 0 remaining

Issue #177 is locally complete. Epics are excluded from executable selection,
epic lineage is informational, aggregate and child specification authority are
separate, pull-request delivery is terminal through exact-head merge and child
closure, eligible epic ancestors close leaf-to-root, and legacy backlog repair
is read-only until one exact digest-bound proposal is explicitly approved.

Local verification first fixed four gaps: real aggregate filenames were not all
discovered by the managed contribution gate, nested closure could accept a
prematurely closed inner epic with planned descendants, an exact legacy split
did not bind destinations or prove complete identifier transfer, and plugin
metadata still described the old PR endpoint. CodeRabbit then found seven valid
blocking defects plus twenty valid documentation, determinism, validation, and
coverage improvements. Those findings now have focused regressions, including
authority-only gate discovery, safe first-child readiness, action-free
ambiguous repair, authority-digest binding, strict PR-check provenance,
merge-base publication diffs, marker exclusivity, programmatic input guards,
and order-stable Project evidence. Its claimed 69-item inventory result was not
reproducible: the canonical audit mapped 506 items before and after a fresh
baseline regeneration.

---

## Issue Scope

- Active issue: #177
- Spec: `specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc`
- Manifest: `specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/issue-scope.json`
- Resolver status: `scoped`
- Delivery: AC [AC9, AC10, AC11, AC12, AC13, AC14, AC15, AC16, AC17, AC18, AC19, AC20]; FR [FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24, FR25]; tasks [T018, T019, T020, T021, T022, T023, T024, T025, T026, T027, T028, T029, T030, T031, T032, T033, T034]; scenarios [SCN024, SCN025, SCN026, SCN027, SCN028, SCN029, SCN030, SCN031, SCN032, SCN033, SCN034, SCN035]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":177,"specPath":"specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc","status":"scoped","delivery":{"acceptanceCriteria":["AC9","AC10","AC11","AC12","AC13","AC14","AC15","AC16","AC17","AC18","AC19","AC20"],"functionalRequirements":["FR9","FR10","FR11","FR12","FR13","FR14","FR15","FR16","FR17","FR18","FR19","FR20","FR21","FR22","FR23","FR24","FR25"],"tasks":["T018","T019","T020","T021","T022","T023","T024","T025","T026","T027","T028","T029","T030","T031","T032","T033","T034"],"scenarios":["SCN024","SCN025","SCN026","SCN027","SCN028","SCN029","SCN030","SCN031","SCN032","SCN033","SCN034","SCN035"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required by the active acceptance criteria
- Release/install evidence: follows merge and marketplace publication; it is not substituted for local verification

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC9 | Automatic discovery selects executable work only | Pass | `skills/start-issue/`, `start-issue-selection-contract.test.mjs`, and disposable shortlist exercises |
| AC10 | Explicit epic starts are coordination-only | Pass | `skills/start-issue/SKILL.md` and `exercise-start-issue-epic.test.mjs` prove no branch or state mutation |
| AC11 | Epic membership is visible but never an execution dependency | Pass | `scripts/epic-relationships.mjs` plus relationship and nested-lineage tests |
| AC12 | The first child establishes aggregate and child specifications | Pass | `skills/write-spec/`, aggregate templates, and disposable publication exercises |
| AC13 | Aggregate and child authority do not overlap | Pass | `scripts/epic-spec-authority.mjs` validates manifests, links, paths, ownership, and forbidden aggregate artifacts |
| AC14 | Later children receive independent spec packages | Pass | later-child write-spec and aggregate publication fixtures |
| AC15 | Pull-request delivery continues until merge | Pass | terminal `skills/open-pr/` contract and delivery-state exercises |
| AC16 | Merge evidence is complete and current | Pass | `scripts/pr-delivery-state.mjs` binds checks, reviews, threads, verification, and mergeability to one head |
| AC17 | The merged final child closes its epic | Pass | completion classifier and final-child disposable exercise |
| AC18 | Nested and unverifiable graphs fail safely | Pass | cycle/page/zero-child tests plus explicit rejection of prematurely closed nested epics with planned descendants |
| AC19 | Existing backlogs can be repaired explicitly | Pass | `scripts/epic-lifecycle-repair.mjs`, exact path/identifier binding, drift checks, and no-op rerun exercises |
| AC20 | Documentation and distributed templates match the contract | Pass | README, contribution guide, steering/onboarding templates, issue form, managed gate, and parity tests |

## Regression Obligations

The normalized issue scope declares no separate regression identifiers for
issue `#177`. Historical #149 obligations remain owned by #149 and were used only as
bounded neighboring context; they do not count toward #177 completion.

## Task Completion

| Task | Description | Status |
|------|-------------|--------|
| T018 | Finalize cumulative spec identity for #149 and #177 | Complete |
| T019 | Define aggregate and child specification authority assets | Complete |
| T020 | Implement the epic specification authority classifier | Complete |
| T021 | Extend epic lineage and completion classification | Complete |
| T022 | Make epic selection coordination-only | Complete |
| T023 | Generalize canonical publication for aggregate plus active-child specs | Complete |
| T024 | Implement first-child and later-child write-spec flows | Complete |
| T025 | Bind downstream lifecycle consumers to the active child package | Complete |
| T026 | Make open-pr a terminal exact-head delivery loop | Complete |
| T027 | Close eligible epics and cascade nested completion | Complete |
| T028 | Add read-only per-epic repair audit and exact proposals | Complete |
| T029 | Apply approved repairs with drift proof and idempotence | Complete |
| T030 | Align README, contribution guidance, steering, and templates | Complete |
| T031 | Add cross-surface semantic contract tests | Complete |
| T032 | Exercise selection and aggregate/child specification flows | Complete |
| T033 | Exercise terminal delivery, closure, and repair | Complete |
| T034 | Prove the implementation against PathCast and an installed candidate | Complete |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score | Notes |
|-----------|-------|-------|
| Single Responsibility | 5 | Relationship, authority, repair planning, publication, and PR-state classification remain separate modules. |
| Open/Closed | 5 | Existing ordinary-issue behavior is preserved while epic behavior is added through explicit roles and modes. |
| Liskov Substitution | 5 | Shared normalized result states are consumed consistently and fail closed on weaker evidence. |
| Interface Segregation | 5 | Read-only classifiers accept bounded snapshots; mutation remains in the owning skills. |
| Dependency Inversion | 5 | Skills depend on documented classifier contracts rather than duplicating GitHub relationship semantics. |

### Layer Separation and Dependency Flow

The Node helpers classify inert local/GitHub evidence and perform no lifecycle
mutation. Skill instructions own user gates and exact writes. Shared references
define cross-skill contracts, while managed repository assets are generated
from the same contract and checked for parity. Executable consumers resolve only
the active child's issue-scope slice; aggregates remain bounded context.

## Security Assessment

- Authentication/authorization: GitHub writes remain in authenticated owning workflow stages; classifiers are read-only.
- Input validation: issue numbers, paths, schemas, keys, OIDs, pagination, check identities, and bounded file sizes are validated.
- Injection prevention: GitHub/user content is treated as data; shell interpolation is not used for issue prose.
- Data protection: no secret-bearing output or new credential surface was introduced.
- Mutation safety: ambiguous, incomplete, drifted, cyclic, partial-page, and unbound ownership evidence stops before writes.

## Performance Assessment

All scans are bounded by explicit directory, file-size, pagination, shortlist,
or polling caps. Data is normalized once per snapshot and deterministic helpers
avoid network calls. The score is 4 rather than 5 because canonical publication
and authority checks intentionally perform bounded full-tree work for safety.

## Test Coverage

### BDD Scenarios

| Scenario range | Has Scenario | Executable Evidence | Passes |
|----------------|--------------|---------------------|--------|
| SCN024-SCN026: selection and lineage | Yes | Contract plus disposable repository tests | Yes |
| SCN027-SCN029: aggregate/child authority | Yes | Authority, write-spec, and publication fixtures | Yes |
| SCN030-SCN033: terminal delivery and closure | Yes | PR-state, completion, and nested-cascade fixtures | Yes |
| SCN034-SCN035: repair and documentation parity | Yes | Repair, managed-asset, and contribution exercises | Yes |

### Coverage Summary

- Feature file: 12/12 active scenarios covered
- Step definitions: implemented as deterministic Jest contract and disposable-repository exercises
- Full execution: 44 suites passed; 2 opt-in Agent SDK suites skipped as designed
- Tests: 472 passed; 5 opt-in tests skipped; 477 total
- Syntax: every changed `.mjs` file passed `node --check`

## Exercise Test Results

| Skill / Surface | Method | Result | Captured Evidence |
|-----------------|--------|--------|-------------------|
| `draft-issue` | deterministic skill rubric | Pass | 13 pass, 1 classification-inapplicable skip |
| `open-pr` | deterministic skill rubric | Pass | 15 pass, 0 fail |
| `status` | deterministic skill rubric | Pass | 14 pass, 0 fail |
| `verify-code` | deterministic skill rubric | Pass | 14 pass, 0 fail |
| start/write-spec/open-pr/upgrade epic flows | disposable Jest repositories and normalized GitHub snapshots | Pass | selection, publication, delivery, closure, drift, ambiguity, and rerun paths covered |
| installed development candidate | local cachebuster marketplace install | Pass | source/cache parity, 506-item inventory, compatibility, surface checks, and installed helper invocation |
| PathCast epic #108 | read-only live audit | Pass | relationship graph was consistent; legacy cumulative authority returned `repair_required`; ambiguous split returned no actions |

All mutable lifecycle exercises used disposable fixtures. PathCast remained
clean and unmodified. The temporary development marketplace/cache was removed;
the released marketplace installation remained intact for later real release
upgrade.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Full script test suite | Pass | 44 suites passed; 472 tests passed; only 5 documented opt-in tests skipped |
| Skill inventory audit | Pass | 506 tracked items; no drift |
| Codex compatibility | Pass | `node scripts/codex-compatibility-check.mjs` |
| Plugin surface | Pass | repository surface validation passed |
| Changed skill validation | Pass | all 12 changed skill roots passed `quick_validate.py` |
| Deterministic skill fixtures | Pass | all four changed skills with fixtures passed their rubrics |
| Prompt/contract quality | Pass | static and executable contract tests reject superseded epic behavior |
| Diff hygiene | Pass | changed-module syntax checks and `git diff --check` passed |

**Gate Summary**: 8/8 passed, 0 failed, 0 incomplete

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| Medium | Managed asset / Testing | `references/contribution-gate.md`, `.github/workflows/nmg-sdlc-contribution-gate.yml` | Aggregate discovery looked for `epic-requirements.md` and `epic-design.md` instead of the contract filenames. | Switched discovery to `requirements.md` and `design.md`; added real-filename regression coverage. | `skill-creator` + direct managed copy |
| High | Error handling / Lifecycle safety | `scripts/epic-relationships.mjs` | A closed nested epic with planned descendants could satisfy ancestor completion. | Require nested completion authority and reject planned or unverifiable nested state before ancestor closure. | direct |
| High | Data integrity / Repair safety | `scripts/epic-lifecycle-repair.mjs`, `skills/upgrade-project/references/epic-lifecycle-recovery.md` | Exact split evidence did not bind child issues to destination paths or prove full source identifier coverage. | Added issue/path bindings, source-tree agreement, complete native-child matching, and exact source-to-transfer set equality. | `skill-creator` + direct helper/tests |
| Medium | Documentation / Plugin metadata | `.codex-plugin/plugin.json` | The installed plugin description still ended delivery at PR creation and separate comment cleanup. | Updated the 2.1.0 manifest description to state epic coordination and terminal exact-head delivery; validated the manifest with `$plugin-creator`. | `plugin-creator` |
| High | Review / Lifecycle safety | contribution gate, epic relationship/repair helpers, PR delivery classifier, publication status, and upgrade recovery | Eight blocking review threads exposed authority-only discovery, contradictory first-child readiness, ambiguous repair actions, unbound authority digests, weak check provenance, merge-base drift, and incomplete CLI guidance. | Fixed all valid blockers with focused regressions; regenerated and revalidated the 506-item inventory baseline instead of accepting the reviewer's incorrect 69-item reconstruction. | `address-pr-comments` + `write-code` + `verify-code` |
| Medium | Review / Documentation and determinism | README, contribution exercise, steering/spec docs, lifecycle skills, authority/publication helpers, and tests | Twenty non-blocking findings identified nested-epic wording, stale status/path prose, unordered evidence, missing guards, marker ambiguity, lintable fences, and untested branches. | Corrected every reproducible finding, restored the automated-reviewer configuration in current and onboarding steering, and added deterministic coverage. | `skill-creator` + direct helpers/tests |

## Remaining Issues

None. CodeRabbit's repository-wide docstring-coverage warning is not applicable
to this Markdown-first plugin and was advisory rather than a failed required
check.

## Positive Observations

- The implementation preserves ordinary issue behavior and separates coordination from execution at every lifecycle boundary.
- New helpers return stable reason codes, bounded evidence, and deterministic digests without performing GitHub writes.
- Documentation, managed templates, and runtime contracts are covered by the same executable parity tests.
- Real-project evidence was used read-only, while all mutation behavior stayed inside disposable fixtures.

## Files Reviewed

| Surface | Issues | Notes |
|---------|--------|-------|
| `scripts/` | 11 fixed | Classifiers, publication/status helpers, inventory baseline, unit/contract/exercise tests |
| `skills/` | 0 remaining | All affected lifecycle skills and templates validated through `$skill-creator` rules |
| `references/` | 3 fixed | Epic identity/authority, publication, scope, verification, contribution, and repair contracts |
| `.github/workflows/nmg-sdlc-contribution-gate.yml` | 2 fixed | Version-3 managed contribution evidence gate |
| `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml` | 0 | Coordination-only epic issue form |
| `.codex-plugin/plugin.json`, `VERSION`, `CHANGELOG.md` | 1 fixed | 2.1.0 release metadata and migration guidance |
| `README.md`, `CONTRIBUTING.md`, `steering/` | 0 | Public, contributor, and generated steering guidance |
| Active #177 spec package | 0 | Requirements, design, tasks, Gherkin, issue scope, and this report |

## Recommendation

**Ready for PR.** All mapped #177 acceptance criteria, tasks, scenarios, steering
gates, deterministic exercises, and installed-candidate checks pass with no
remaining local finding.
