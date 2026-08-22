# Verification Report: Replace execute simplify with two branch-to-main review and fix panes

**Date**: 2026-08-22
**Issue**: #208
**Reviewer**: Codex architecture-reviewer
**Scope**: Implementation verification against the approved specification
**Source HEAD**: `7b3c4ee7c481a1993f05a08e73a9986b02eb1dc7` plus the verification fixes listed below

---

## Executive Summary

Issue #208 is complete locally. Execute now runs `review1`, `fix1`, `review2`, and `fix2` between implementation and verification; host `/review` interaction is sequenced through distinct menu transitions; review/apply controllers own their handoffs and git mutations; implementation publishes before review; retained-worker and failure behavior remains fail-closed; and the live simplify workflow is removed.

Verification found stale active simplify wording in the rewrite contract and address-PR fix-loop guidance. Those local documentation-contract defects were removed and all applicable gates were rerun successfully.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | **4.5** |

### Implementation Status: Pass
**Total Remaining Issues**: 0

---

## Issue Scope

- Active issue: #208
- Spec: `specs/208-replace-execute-simplify-with-two-branch-to-main-review-and-fix-panes`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9]; tasks [T001, T002, T003, T004, T005, T006, T007, T008]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: AC [194-AC2, 194-AC4, 195-AC1]; FR []; scenarios [194-SCN002, 194-SCN004, 195-SCN001]

<!-- nmg-sdlc-issue-scope: {"issueNumber":208,"specPath":"specs/208-replace-execute-simplify-with-two-branch-to-main-review-and-fix-panes","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":["194-AC2","194-AC4","195-AC1"],"functionalRequirements":[],"scenarios":["194-SCN002","194-SCN004","195-SCN001"]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required by issue #208

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Two review/fix pane pairs run after implement and before verify, with separate host review menu inputs, publication boundary, complete handoffs, and retained-worker resume | Pass | Step order and mappings: `scripts/sdlc-execute.mjs:26-40,370-395`; menu/state orchestration: `scripts/sdlc-execute.mjs:456-472,510-528,738-819`; eight-worker, distinct-menu, no-nested-OMP, and realistic retained-worker tests: `scripts/__tests__/sdlc-execute.test.mjs:513-551,685-711`; implementation publication: `workflows/write-code/WORKFLOW.md:62-91` |
| AC2 | Clean reviews still launch fix workers without empty commits or pushes | Pass | No-findings controller branch: `scripts/sdlc-apply-review.mjs:70-75`; zero-git and applied-clean tests: `scripts/__tests__/sdlc-apply-review.test.mjs:28-66`; queue-order test launches both fix workers: `scripts/__tests__/sdlc-execute.test.mjs:513-529` |
| AC3 | Failed, blocked, unknown, missing, or intervention review/fix results keep the pane and stop later work | Pass | Central stop/notification and handoff gates: `scripts/sdlc-execute.mjs:531-541,797-826`; review-stop and menu-transition tests: `scripts/__tests__/sdlc-execute.test.mjs:603-647` |
| AC4 | Simplify is removed from the live plugin and public execute/write-code surfaces | Pass | `workflows/simplify/` absent; prompt contract: `scripts/__tests__/simplify-contract.test.mjs:10-14`; implement prompt exclusion: `scripts/__tests__/sdlc-execute.test.mjs:198-209`; public pipeline: `README.md:119,176`; product pipeline: `steering/product.md:87,164-170`; final live-surface grep found no bundled/in-process simplify instruction |

## Regression Obligations

| Obligation | Status | Evidence |
|------------|--------|----------|
| 194-AC2 / 194-SCN002: execute retains preflight, state, pane, handoff, resume, and fail-closed queue ownership | Pass | Full controller suite passed; `scripts/sdlc-execute.mjs:592-845`; `scripts/__tests__/sdlc-execute.test.mjs:497-711` |
| 194-AC4 / 194-SCN004: sibling `--kind omp`, split, prompt-wait, close-vs-keep, and notification behavior remains intact | Pass | `scripts/sdlc-execute.mjs:426-447,714-736,769-826`; controller tests passed |
| 195-AC1 / 195-SCN001: terminal delivery remains a sibling deliver worker with open-pr/address-pr-comments prompt composition | Pass | Deliver mapping/extras remain at `scripts/sdlc-execute.mjs:37-41`; prompt test at `scripts/__tests__/sdlc-execute.test.mjs:198-211`; full delivery regression suite included in 350 passing tests |

---

## Task Completion

| Task | Status | Notes |
|------|--------|-------|
| T001 Extend execute step machine | Complete | Eight-step order, mappings, CLI usage, and handoff validation implemented and tested. |
| T002 Add review-main controller | Complete | `scripts/sdlc-review-main.mjs` and injected controller/CLI tests cover findings, empty artifacts, missing artifacts, and failed review. |
| T003 Add apply-review controller | Complete | `scripts/sdlc-apply-review.mjs` and tests cover exit 3, no-findings, clean applied state, exact commits, non-force push, path handling, and failures. |
| T004 Compact review/apply workflows | Complete | Both private workflows exist, are controller-centered, forbid nested review/OMP and model-owned handoffs/git, and render through worker prompts. |
| T005 Stop implement from running simplify | Complete | Write-code publishes non-runtime changes before `next: review1`; spec-implementer no longer invokes simplify. |
| T006 Delete simplify and retarget inventory | Complete | Live directory absent; historical spec/capability retained; current-spec verification passes with 15 capabilities and 14 mappings. |
| T007 Remove simplify from public/steering surfaces | Complete | README, product steering, automated workflow inventory, contribution strings, and skill baseline updated; stale verification findings also removed. |
| T008 Cover queue/controller paths | Complete | Relevant Jest suites are present; full suite passes 350 tests across 37 suites with the one documented opt-in exercise suite skipped. |

---

## Architecture Assessment

### Scores and Findings

| Area | Score (1-5) | Findings |
|------|-------------|----------|
| SOLID Principles | 4 | Review persistence, apply/commit behavior, and orchestration remain separate modules. `run`/`fs` injection preserves dependency inversion and testability. `sdlc-execute.mjs` is large, but the new git/handoff responsibilities were correctly extracted rather than added to it. |
| Security | 5 | CLI inputs use strict issue/step allowlists; external commands use `spawnSync` program/argument arrays without shell composition; git staging uses literal porcelain paths and excludes `.omp/`; pushes do not force. No secrets or new network trust boundary. |
| Performance | 4 | Branch and status scans are bounded; the branch-menu observation loop is capped at 50 reads; no unbounded memory structure or avoidable payload copy was introduced. Herdr polling is synchronous by design and limited to the interactive transition. |
| Testability | 5 | Controller side effects are injected; fixtures cover exact commands, exit statuses, handoff schema, menu sequencing, retained state shapes, dirty/clean paths, and failure transitions. BDD scenarios map directly to deterministic tests. |
| Error Handling | 4 | Stable exit codes and named reason codes fail closed; missing/mismatched handoffs keep panes open; controller failures cannot synthesize passes. Notification failure is intentionally non-fatal because the authoritative orchestrator sentence remains. |

**Architecture average**: 4.4 / 5

### SOLID Detail

| Principle | Score | Notes |
|-----------|-------|-------|
| Single Responsibility | 4 | New review and apply controllers own distinct persistence and mutation responsibilities. |
| Open/Closed | 4 | Step mappings extend the queue without forking the shared lifecycle. |
| Liskov Substitution | 5 | Injected `run`/`fs` contracts are exercised with test doubles. |
| Interface Segregation | 5 | Controller dependency surfaces remain small and purpose-specific. |
| Dependency Inversion | 5 | Business paths depend on injected command/filesystem adapters; CLI wrappers supply concrete defaults. |

### Prompt Quality

All eight criteria in `steering/tech.md` pass: instructions are unambiguous; success/empty/failure paths are explicit; tool references are valid; menu and artifact ordering is evidence-dependent; workers forbid `ask`; each handoff satisfies the next step; referenced scripts exist; and historical `specs/106-simplify-skill/` remains archival rather than live behavior.

---

## Test Coverage

### BDD Scenarios

| Scenario | AC | Deterministic Coverage | Result |
|----------|----|------------------------|--------|
| SCN001 | AC1 | Queue order, separate menu key submissions, branch-menu transition, state-shape resume, full handoff validation | Pass |
| SCN002 | AC2 | Blank/canonical no-findings and applied-clean branches assert zero commit/push | Pass |
| SCN003 | AC3 | Failed review and menu failures stop later panes and retain failed pane | Pass |
| SCN004 | AC4 | Deleted workflow and prompt/public surface contracts | Pass |

### Full Test Execution

- Command: `cd scripts && npm test -- --runInBand`
- Result: exit 0
- Suites: 37 passed, 1 skipped opt-in exercise suite, 38 total
- Tests: 350 passed, 1 skipped, 351 total
- Skipped suite: `exercise-start-issue-backfill.test.mjs`, gated by the pre-existing `RUN_EXERCISE_TESTS=1` environment contract; not an unexpected issue #208 skip
- Prompt smoke: `node scripts/sdlc-execute.mjs worker-prompt --step review1 --issue 42` rendered the private Review Main workflow, controller call, exact handoff path, and no nested `/review` instruction

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| Skill Exercised | `/sdlc-execute #208` |
| Test Project | Disposable `/tmp/nmg-sdlc-exercise-208.*` project, removed after capture |
| Exercise Method | `node scripts/exercise-omp.mjs --cwd <project> --timeout-ms 300000 -- /sdlc-execute #208` |
| Duration | 42.54 seconds |
| Result | Exit 0; output `Run /sdlc-write-spec #208` |

The disposable project intentionally lacked an approved #208 spec. The published plugin surface loaded and failed closed at the approved-spec gate without mutation. Herdr-only interactive menu behavior cannot execute in this non-Herdr RPC harness; deterministic controller fixtures provide the acceptance evidence for that path and assert the exact two-stage menu event sequence.

### Exercise AC Evaluation

| AC | Verdict | Evidence |
|----|---------|----------|
| AC1 | Partial in live exercise; Pass overall | RPC exercise reached the spec gate; full Herdr interaction is covered by deterministic controller tests at `scripts/__tests__/sdlc-execute.test.mjs:513-551`. |
| AC2 | Pass | Controller tests prove clean findings launch the fix step and produce no commit/push. |
| AC3 | Pass | Exercise proved fail-closed spec handling; controller tests prove failed review/fix pane handling. |
| AC4 | Pass | Loaded extension surface plus static prompt and inventory gates contain no live simplify stage. |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `cd scripts && npm test -- --runInBand`: 37 suites and 350 tests passed; only the documented opt-in exercise suite skipped. |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: clean, 43 items mapped. |
| OMP plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository`: repository surface passed. |
| Skill creator validation | Pass | Resolved and read `skill://skill-creator` before verification fixes; reviewed affected WORKFLOW/reference bundles against its authoring rules. Its bundled `validate-skill.mjs` targets `SKILL.md` directories and is not applicable to this repository's `WORKFLOW.md` bundle format; plugin-surface and inventory validators passed. |
| Skill exercise | Not applicable | No deterministic `skill-exercise-runner` fixture exists for `review-main` or `apply-review`; live RPC exercise was performed through `/sdlc-execute` instead. |
| Prompt quality | Pass | All criteria at `steering/tech.md:297-308` reviewed; rendered prompt smoke and contract tests pass. |
| Git hygiene | Pass | `git diff --check main...HEAD`: exit 0, no output. |
| Current spec inventory | Pass | `node scripts/verify-current-specs.mjs`: 22 genuine issue specs, 15 capabilities, 14 active workflow mappings, 1 deprecated stub. |

**Gate Summary**: 7 applicable gates passed, 0 failed, 0 incomplete; 1 conditionally inapplicable deterministic-fixture gate.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| Medium | Contract consistency | `references/rewrite-contract.json`, `references/rewrite-contract.md` | Active write-code purpose and acceptance still claimed in-process simplify after the live stage was removed. | Replaced stale simplify claims with the implementation commit/publish boundary required before review1. | `skill-creator` |
| Medium | Workflow consistency | `workflows/address-pr-comments/references/fix-loop.md` | The active PR finding loop still instructed workers to “bundle simplify,” referring to deleted behavior. | Removed the stale step while preserving steering, scoped fix, and self-verification requirements. | `skill-creator` |

Affected gates and the full contract suite passed after these fixes.

## Remaining Issues

None.

## Positive Observations

- Review findings intentionally pass into dedicated fix workers rather than dead-ending the queue.
- All review/fix handoffs use the existing schema and are validated through the shared validator.
- Menu interaction tests enforce temporal separation, not merely the presence of key calls.
- No-findings and no-change paths explicitly prevent empty commits and pushes.
- Historical simplify ownership remains in `specs/106-simplify-skill/` without leaking into the live workflow surface.

## Files Reviewed

| File group | Issues | Notes |
|------------|--------|-------|
| `scripts/sdlc-execute.mjs` and execute tests | 0 | Queue, menu, resume, stop, and handoff behavior conform. |
| `scripts/sdlc-review-main.mjs` and tests | 0 | Review artifact and handoff lifecycle conform. |
| `scripts/sdlc-apply-review.mjs` and tests | 0 | Apply packet, staging, commit, push, and no-op paths conform. |
| `workflows/review-main/`, `workflows/apply-review/`, `workflows/write-code/` | 0 | Compact responsibilities and publication boundary conform. |
| `agents/spec-implementer.md` | 0 | No simplify stage; publication boundary retained. |
| README, steering, rewrite contracts, workflow references | 2 fixed | Stale active simplify wording removed. |
| Inventory and surface validators | 0 | Historical capability preserved and live mappings updated. |

---

## Recommendation

**Ready for PR**

All delivery acceptance criteria, functional requirements, tasks, and BDD scenarios have local evidence. Applicable verification gates pass after the two safe contract-text fixes. No PR-only obligation or remaining blocker exists.
