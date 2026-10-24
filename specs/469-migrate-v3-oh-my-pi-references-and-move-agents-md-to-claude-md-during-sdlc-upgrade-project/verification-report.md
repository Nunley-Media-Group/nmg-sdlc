# Verification Report: Migrate v3 Oh My Pi references and move AGENTS.md to CLAUDE.md during /sdlc-upgrade-project

**Date**: 2026-10-24
**Issue**: #469
**Reviewer**: Claude Code (architecture-reviewer, verify worker)
**Scope**: Implementation verification against spec

**Verification head**: 2edc0de41848f1033b8557f6ef2418aec564590d

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | 4.5 |

### Implementation Status: Pass
**Total Issues**: 0

Both registered validations passed at the verification head: `repository.tests` and `repository.nmg-sdlc-smoke`. Coverage is 2/2 complete, with no ceiling. The AC8 defect from the previous verification at `be02641` is fixed in `2edc0de`. Merge mode now force-removes a tracked `AGENTS.md` after its content is captured, and if removal fails it restores the original `CLAUDE.md` bytes. Regression tests cover both cases, and a disposable-repo exercise of the scenario that failed before now passes and stays idempotent. Every AC, task, and scenario is satisfied.

---

## Issue Scope

- Active issue: #469
- Spec: `specs/469-migrate-v3-oh-my-pi-references-and-move-agents-md-to-claude-md-during-sdlc-upgrade-project`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9]; FR [FR1–FR10]; tasks [T001–T008]; scenarios [SCN001–SCN009]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":469,"specPath":"specs/469-migrate-v3-oh-my-pi-references-and-move-agents-md-to-claude-md-during-sdlc-upgrade-project","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 469 --spec specs/469-… --base main --controller-run-id a6c73e6e-4dab-4037-92e6-4b7a93fba395` → `ok: true`, `ceiling: null`, exit 0
- Artifact: `.nmg-sdlc/verification/469.json`. Coverage `declared: 2, recorded: 2, complete: true`, with nothing missing, duplicated, or unknown
- Identity: head `2edc0de41848f1033b8557f6ef2418aec564590d`, tree clean, spec hash `sha256:233d595c…`, steering hash `sha256:85b966d4…`

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Steering host tokens proposed and rewritten | Pass | `scripts/sdlc-upgrade.mjs`: `V3_STEERING_TOKEN_MAP` (longest-first) uses one escaped alternation, so replacements are never rescanned. `planSteeringHostLanguage` covers snippet lines plus validation `config.program`/`config.args` (`omp`→`claude`, `--print`→`-p`). `applySteeringHostLanguage` writes through `applySteeringRuntime` with an update-mode plan. Covered in `sdlc-upgrade.test.mjs`. |
| AC2 | Steering host prose rewritten | Pass | `V3_STEERING_PROSE_RE = /Oh My Pi\|\bOMP\b/g` is case-sensitive and whole-word. The rewrite works line by line, so the bytes of unchanged lines are kept. The staged runtime validates through the steering writer. |
| AC3 | CONTRIBUTING.md v3 sentence refreshed | Pass | `detectContributingHostLanguage` / `applyContributingHostLanguage` replace only the exact sentence, anywhere in the file (`split`/`join`). |
| AC4 | Idempotent and declinable | Pass | No item is emitted when there are no occurrences. Apply re-plans from live state and returns `already-current`. A group that isn't approved is never dispatched. |
| AC5 | Unsafe/invalid steering fails closed | Pass | An unsafe snippet returns `skipped:unverifiable` / `steering_host_language_unsafe_path` without writing. A writer failure returns `failed:<message>` with the writer's reason code (tested with `steering_module_invalid`). |
| AC6 | Documentation matches | Pass | The upgrade WORKFLOW, v3-detectors, detection, upgrade-procedures, and README each name all three group ids. `references/project-agents.md`, `references/contribution-guide.md` (which adds the "Stale v3 wording" row), and onboarding name `CLAUDE.md`. The root `AGENTS.md` was git-renamed to `CLAUDE.md` with H1 `# CLAUDE.md`. `.gitignore` has no `.omp` rule. |
| AC7 | AGENTS.md renamed to CLAUDE.md | Pass | Rename mode uses `git mv` when the file is tracked, otherwise `renameSync`. Bytes are identical. |
| AC8 | AGENTS.md merged into existing CLAUDE.md | Pass | `applyAgentsToClaudeMd` merge branch (`scripts/sdlc-upgrade.mjs:1410-1425`): the separator gives exactly one blank line, the CLAUDE copy of the managed section is kept, the original bytes form the prefix, and the file is removed with `git rm -q -f` (tracked) or `unlinkSync`. If removal fails, `CLAUDE.md` is restored. New tests: dirty tracked merge, `agents-v4-host-language` followed by merge in the same run (including an idempotent second apply), and restore on removal failure. A symlink returns `skipped:collision`. |
| AC9 | Managed-section reconciliation uses CLAUDE.md | Pass | `references/project-agents.md` forbids writing the managed section to `AGENTS.md` and routes an existing `AGENTS.md` through `agents-to-claude-md`. `exercise-spec-context.test.mjs` creates and refreshes the section in `CLAUDE.md`. A repeat detect emits no item. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | steering-v4-host-language | Complete | Apply priority 10.5 |
| T002 | contributing-v4-host-language | Complete | Apply priority 10.5 |
| T003 | agents-to-claude-md | Complete | Apply priority 7.75. The merge-mode fix landed in `2edc0de` |
| T004 | CLAUDE.md contract and onboarding | Complete | |
| T005 | Document the three groups | Complete | |
| T006 | Repository move and `.gitignore` cleanup | Complete | |
| T007 | Upgrade behavior tests | Complete | Includes the dirty-merge regression tests |
| T008 | Contract tests | Complete | `upgrade-v4-host-language-contract.test.mjs`. Skill inventory is clean (90 items) |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Each group has its own detect/apply pair. Detect and apply share one pure planner. |
| Open/Closed | 4 | New kinds are added to the existing priority table and dispatch chain. |
| Liskov Substitution | 5 | N/A |
| Interface Segregation | 4 | Item shapes match the existing groups. |
| Dependency Inversion | 4 | Steering writes go through the shared writer. Git calls use a small local helper. |

### Layer Separation

The script layer stays deterministic. Workflow and reference docs describe the groups without duplicating logic.

## Security Assessment

- [x] Input validation: snippet paths must be under `steering/snippets/` with no `..` segment. Symlinks and non-regular files are rejected through `lstat`.
- [x] Injection prevention: git calls use argument arrays with `shell: false` and `--` separators.
- [x] Data protection: no secrets are touched.

## Performance Assessment

- [x] Bounded scans: only registered snippets, the manifest, `CONTRIBUTING.md`, and the root instructions files are read.

## Testability Assessment

- [x] Every AC has a focused Jest test that uses a disposable temp root and a no-network runner. The new regression tests reproduce the earlier failure boundary.

## Error-Handling Assessment

Score 4. Merge mode now captures `AGENTS.md` before removing it with force, and on removal failure it restores the original `CLAUDE.md` bytes, so a retry can't append twice. Unsafe targets return stable `skipped:*` reason codes. A small window remains where a crash between the `CLAUDE.md` write and the removal leaves both files. That needs process loss rather than an error, and isn't required by the spec.

---

## Test Coverage

| Acceptance Criterion | Has Scenario | Has Test | Passes |
|---------------------|-------------|-----------|--------|
| AC1–AC9 | Yes (SCN001–SCN009) | Yes | Yes |

- `repository.tests` (`npm test -- --runInBand` in `scripts/`): passed. Test Suites: 51 passed, 1 skipped. Tests: 1084 passed, 2 skipped, 1086 total.

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | upgrade-project detect/apply runtime (`scripts/sdlc-upgrade.mjs`), called directly |
| **Test Project** | Disposable git repo in the worker scratchpad |
| **Exercise Method** | `applyUpgrade` twice with `agents-v4-host-language` and `agents-to-claude-md` approved, no network |

### Captured Output Summary

Fixture: tracked `AGENTS.md` (`agents/  # OMP task agents (a, b)` plus `notes`) and tracked `CLAUDE.md` (`# Claude`, no trailing newline). This is the scenario that failed at `be02641`.

1. First apply: `agents-v4-host-language` returned `applied`, and `agents-to-claude-md` returned `applied` / `merge`. `CLAUDE.md` = `# Claude\n\nagents/  # Claude Code plugin subagents (a, b)\nnotes\n`. `AGENTS.md` is gone, and git shows `D  AGENTS.md`.
2. Second apply: neither group was emitted or applied, and `CLAUDE.md` was unchanged.

### AC Evaluation

| AC | Verdict | Evidence |
|----|---------|----------|
| AC8 | Pass | One blank-line separator, a single appended copy, `AGENTS.md` deleted, and an idempotent retry |

The interactive `/sdlc-upgrade-project` TUI was not exercised. The behavior under change lives in the deterministic apply runtime, so a direct call is sufficient evidence.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests (`repository.tests`) | Pass | `command exited 0` at `2edc0de`, 1084 tests passed |
| Live smoke (`repository.nmg-sdlc-smoke`) | Pass | `nmg-sdlc-smoke delivered #227`. A fresh issue #227 was provisioned through autopilot draft-issue/write-spec (spec PR #228 MERGED). Execute delivered PR #229, which is MERGED at `4b91560acd033fb9f9d8f47903435d479b98976f`, and issue #227 is CLOSED |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check` → clean (90 items mapped), exit 0 |
| Claude Code plugin surface | Pass | `verify-plugin-surface.mjs --root . --label repository` → passed, exit 0 |
| Skill creator validation | N/A | No skill-bundled fixes were made in this verification |
| Prompt quality | Pass | The new doc steps are unambiguous, and the apply order is documented |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |

**Gate Summary**: 6/6 applicable gates passed, 0 failed, 0 incomplete.

---

## Fixes Applied

None in this verification. The previous finding (AC8 merge atomicity) was fixed by implementation in `2edc0de` and re-verified here.

## Remaining Issues

None.

---

## Positive Observations

- The steering rewrite re-plans from live state and goes through the shared writer, with staged validation and stable reason codes.
- The merge fix is minimal and adds a rollback path, and its regression tests cover the exact failure boundary.
- The documentation updates are consistent across the workflow, references, and README.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-upgrade.mjs` | 0 | |
| `scripts/__tests__/sdlc-upgrade.test.mjs` | 0 | Dirty-merge regression tests added |
| `scripts/__tests__/upgrade-v4-host-language-contract.test.mjs`, `spec-context-contract.test.mjs`, `exercise-spec-context.test.mjs` | 0 | |
| `references/project-agents.md`, `references/contribution-guide.md` | 0 | |
| `workflows/upgrade-project/**`, `workflows/onboard-project/WORKFLOW.md`, `README.md` | 0 | |
| `CLAUDE.md`, `.gitignore`, `steering/snippets/*` | 0 | |

---

## Recommendation

**Ready for PR**

All acceptance criteria pass, all registered gates are green at the exact head, and the earlier AC8 defect is fixed and covered by regression tests.
