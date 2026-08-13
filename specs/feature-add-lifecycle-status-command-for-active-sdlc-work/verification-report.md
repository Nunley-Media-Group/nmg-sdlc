# Verification Report: Add Lifecycle Status Command for Active SDLC Work

**Date**: 2026-08-12
**Issue**: #145
**Reviewer**: Codex
**Scope**: Implementation verification against the approved amended spec

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 4 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | **4.3** |

**Implementation Status**: Partial
**Total Issues**: 3 remaining, 1 fixed

The manual lifecycle status command, stable JSON contract, read-only collectors, conservative stage inference, documentation, and test suite are implemented. A post-review fix now treats closed issue or closed-unmerged-PR evidence as an `unknown` lifecycle requiring manual repair. Verification remains Partial because a passing local verification report has no commit/HEAD identity, so `collectVerification()` cannot prove that the report is current after later implementation changes. The branch also contains an unrelated committed `CONTRIBUTING.md` change that is outside issue #145.

## Spec Context

- activeSpec: `specs/feature-add-lifecycle-status-command-for-active-sdlc-work/`
- relatedSpecs: `specs/feature-refactor-skill-md-progressive-disclosure/` (reasons: changed `scripts/skill-exercise-runner.mjs`; status evaluator must preserve deterministic pass/fail/no-placeholder-skip contracts)
- metadataOnlyCount: 84
- scannedSpecCount: 86
- loadedSpecCount: 2
- gaps: the historical progressive-disclosure spec also lists issue #145; active title/branch and current changed paths disambiguate the lifecycle-status spec as primary

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Infer the current manual SDLC stage | Pass | `scripts/sdlc-status.mjs`; table-driven stage tests; live `codex exec` exercise inferred `specified` from a dirty disposable project and recommended `$nmg-sdlc:write-code #42` |
| AC2 | Remain read-only | Partial | Before/after filesystem, refs, and status snapshots pass; command spies reject mutations; live exercise left the fixture unchanged. A stale `Pass` report can still be labelled current because reports do not identify the verified commit. |
| AC3 | Handle partial and unavailable context | Pass | GitHub-unavailable, missing artifact, CI-state, verification-conflict, and closed-lifecycle cases degrade to gaps or manual repair without false completion. |
| AC4 | Never prompt or act | Pass | `skills/status/SKILL.md` is non-interactive; the live exercise invoked only read-only git/GitHub probes and the bundled CLI. |
| AC5 | Provide stable automation output | Pass | JSON schema version 1, stable top-level fields, JSON-only stdout, invalid invocation handling, deterministic fixture rubric S1-S6, and live JSON output all passed. |

## Original Issue Alignment

The live GitHub issue still asks for runner interruption/state handling in AC2. The approved amended spec deliberately removes runner integration ahead of milestone-2 removal. Verification uses the amended spec as the primary pass/fail source and records the stale issue body as a traceability gap; this report comment documents the divergence without silently treating the original runner criterion as implemented.

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Bounded manual-lifecycle evidence collection | Complete | Read-only git/GitHub adapters, strict branch/issue spec discovery, required file checks, and named gaps are present. |
| T002 | Conservative lifecycle inference | Complete | All eight stages are covered; closed lifecycle contradictions were fixed during verification. |
| T003 | CLI and renderers | Complete | `--project`, `--json`, `--help`, stable output, import safety, and non-zero hard errors are tested. |
| T004 | Status skill through `$skill-creator` | Complete with provenance gap | Skill contract and compatibility checks pass; repository contents do not independently prove the authoring-session routing. |
| T005 | README and CHANGELOG integration | Complete | Status is documented as a diagnostic utility and `[Unreleased]` records issue #145. |
| T006 | Unit and integration tests | Complete | 23 focused status tests pass within 461 total tests. |
| T007 | Skill contract and exercise coverage | Complete | Deterministic rubric: 14 pass, 0 fail, 0 skipped; explicit live `codex exec` source-tree exercise also passed. |
| T008 | Verification gates | Complete | All extracted gates and compatibility/diff checks pass. |

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Collection, inference, rendering, and CLI entry are separated into functions, though the zero-dependency CLI remains one 550-line module. |
| Open/Closed | 4 | Evidence adapters and pure inference are extensible; lifecycle changes still modify the central inference function. |
| Liskov Substitution | 5 | Injected filesystem and command adapters are substitutable in tests. |
| Interface Segregation | 4 | Adapter surface is intentionally small (`fs`, `run`). |
| Dependency Inversion | 5 | External commands and filesystem access are isolated behind injected adapters. |

The skill delegates deterministic behavior to the script, and the script preserves the steering contract: Node.js ESM, built-ins only, `node:path`, argument arrays, no runner coupling, and no mutation.

## Security Assessment

- External repository and GitHub values are passed as child-process arguments, never interpolated into shell source.
- File reads are capped; error details are single-line and bounded.
- GitHub probes are limited to `gh issue view`, `gh pr list`, and `gh pr checks`.
- No secrets, credentials, or full issue bodies are emitted.

**Score**: 5/5

## Performance Assessment

- Local reads are targeted and capped; GitHub subprocesses have 30-second timeouts.
- Synchronous subprocesses are acceptable for the short-lived CLI but execute sequentially.
- Spec metadata discovery reads bounded requirement prefixes but can still scale linearly with the number of spec directories.

**Score**: 4/5

## Testability and Error Handling

- Pure inference/render functions and injected adapters support deterministic unit tests.
- Disposable git repositories verify collection and mutation-free behavior.
- Optional probe failures become named gaps; invalid invocation and non-git projects return non-zero with actionable stderr.
- No custom error hierarchy is needed for this CLI, but report freshness cannot be classified reliably without stronger report metadata.

**Testability**: 5/5
**Error Handling**: 4/5

## Test Coverage

| Acceptance Criterion | Gherkin Scenario | Automated Evidence | Result |
|---------------------|------------------|--------------------|--------|
| AC1 | Yes | Stage table, collectors, live exercise | Pass |
| AC2 | Yes | Snapshot/read-only tests and live exercise | Partial: freshness gap |
| AC3 | Yes | Optional failure and conflict cases | Pass |
| AC4 | Yes | Skill contract and live execution trace | Pass |
| AC5 | Yes | Renderer/CLI tests and deterministic rubric | Pass |

- BDD scenarios: 5/5 acceptance criteria covered, plus one explicit runner-out-of-scope guard
- Step definitions: executable behavior is covered through Jest integration tests and exercise fixtures; Gherkin remains a design/verification artifact per `steering/tech.md`
- Full test execution: 21/24 suites passed, 3 skipped; 461/478 tests passed, 17 skipped; 0 failures

## Exercise Test Results

| Field | Value |
|-------|-------|
| Skill exercised | `status` |
| Deterministic method | `node scripts/skill-exercise-runner.mjs --skill status` |
| Deterministic result | 14 pass, 0 fail, 0 skipped |
| Live method | `codex exec` in a disposable read-only-sandbox project, explicitly loading this branch's `skills/status/SKILL.md` because installed 1.71.0 predates the new skill |
| Live result | JSON-only output; stage `specified`; dirty spec fixture preserved; GitHub unavailable recorded as named gaps; next action `$nmg-sdlc:write-code #42` |
| Prompt handling | N/A — status never prompts |
| Cleanup | Disposable project moved to Trash after recursive deletion was rejected by command policy |

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| SDLC runner tests | Pass | `cd scripts && npm test -- --runInBand`: 461 passed, 17 skipped, 0 failed |
| Skill exercise test | Pass | Status deterministic rubric: 14 passed, 0 failed, 0 skipped; live source-tree exercise passed |
| Skill inventory audit | Pass | 569 inventory items mapped |
| Prompt quality review | Pass | 65-line skill; unambiguous arguments, runtime path resolution, JSON boundary, no prompt, correct reference pointer, and integration section |
| Behavioral contract review | Pass | Preconditions, outputs, read-only invariants, unavailable-evidence handling, and no-runner boundaries are addressed; freshness limitation remains documented |

**Gate Summary**: 5/5 passed, 0 failed, 0 incomplete

Additional checks:

- `node scripts/codex-compatibility-check.mjs` — Pass
- `git diff --check main...HEAD` and `git diff --check` — Pass
- Direct text and JSON CLI execution on the active repository — Pass (`implemented`, issue #145, complete spec, no PR)

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| Medium | Reliability | `scripts/sdlc-status.mjs` | Closed issue or closed-unmerged-PR evidence added a gap but still advanced to a delivery recommendation. | Stage now becomes `unknown` with a manual-repair action; two regression cases added. | direct |

The bundled `$nmg-sdlc:simplify` pass reviewed the two modified files and found no further worthwhile behavior-preserving cleanup.

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| High | Reliability | `scripts/sdlc-status.mjs` / verification report contract | Any report containing `Implementation Status: Pass` is marked `current: true` without a verified commit/HEAD identity, so later code changes can be misreported as `verified`. | A reliable fix requires a broader `$nmg-sdlc:verify-code` report schema that records verified commit identity and status-side validation; timestamp heuristics would be unsafe. |
| Medium | Scope | `CONTRIBUTING.md`, commit `1ce6bb7` | The branch includes an unrelated contribution-evidence documentation commit not mapped to issue #145 or its tasks. | Preserved as user-owned committed work; split or rebase it before opening the issue #145 PR. |
| Medium | Traceability | GitHub issue #145 | The issue body still requires runner interruption handling while the approved amended spec explicitly excludes it. | Verification comments can document the mismatch, but rewriting the issue contract is outside this verification pass. |

## Recommendation

**Needs fixes before PR.** The implementation and all gates are green, but delivery should wait until verification-report freshness has a commit-linked contract and the unrelated `CONTRIBUTING.md` commit is removed from this feature branch or delivered separately. The issue/spec runner-scope divergence should also be reconciled for reviewer clarity.
