# Verification Report: Migrate v3 Oh My Pi references and move AGENTS.md to CLAUDE.md during /sdlc-upgrade-project

**Date**: 2026-10-24
**Issue**: #469
**Reviewer**: Claude Code (architecture-reviewer, verify worker)
**Scope**: Implementation verification against spec

**Verification head**: be0264112662085620477551b952875f2a7f03ab

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 3 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 5 |
| Testability | 4 |
| Error Handling | 2 |
| **Overall** | 3.7 |

### Implementation Status: Fail
**Total Issues**: 1 (High)

Both registered validations passed at the verification head (`repository.tests`, `repository.nmg-sdlc-smoke`; coverage 2/2 complete, no ceiling). The inline review found a reproducible defect in `agents-to-claude-md` merge mode. When `AGENTS.md` is tracked and has working-tree changes, including the changes the earlier `agents-v4-host-language` group makes in the documented apply order, the group appends `AGENTS.md` into `CLAUDE.md` and then fails at `git rm`. `AGENTS.md` stays in place. Every retry appends the same content again. AC8 fails, so the overall status is Fail.

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

- Local verification: Not complete (AC8 defect)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 469 --base main --controller-run-id a6c73e6e-4dab-4037-92e6-4b7a93fba395` → `ok: true`, `ceiling: null`, exit 0
- Artifact: `.nmg-sdlc/verification/469.json`. Coverage `declared: 2, recorded: 2, complete: true`, nothing missing, duplicated, or unknown
- Identity: head `be0264112662085620477551b952875f2a7f03ab`, tree clean

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Steering host tokens proposed and rewritten | Pass | `scripts/sdlc-upgrade.mjs` `V3_STEERING_TOKEN_MAP` (longest-first), `planSteeringHostLanguage` (snippet lines plus validation `config.program`/`config.args`, `omp`→`claude`, `--print`→`-p`), and `applySteeringHostLanguage` via `applySteeringRuntime` in update mode. Covered by tests in `sdlc-upgrade.test.mjs`. |
| AC2 | Steering host prose rewritten | Pass | `V3_STEERING_PROSE_RE = /Oh My Pi\|\bOMP\b/g`. The rewrite works line by line and keeps the bytes of unchanged lines. The staged runtime validates through the steering writer. |
| AC3 | CONTRIBUTING.md v3 sentence refreshed | Pass | `detectContributingHostLanguage` / `applyContributingHostLanguage` replace only the exact sentence. `references/contribution-guide.md` adds the "Stale v3 wording" row (FR5). |
| AC4 | Idempotent and declinable | Pass | No item is emitted when there are no occurrences. Apply re-plans and returns `already-current`. A group that isn't approved is not applied. |
| AC5 | Unsafe/invalid steering fails closed | Pass | An unsafe snippet returns `skipped:unverifiable` with `steering_host_language_unsafe_path`. A writer failure returns `failed:<message>` with the writer's reason code, now parsed from JSON stdout in `applySteeringRuntime`. |
| AC6 | Documentation matches | Pass | The upgrade WORKFLOW, v3-detectors, detection, upgrade-procedures, and README describe the three groups. `project-agents.md`, `contribution-guide.md`, and onboarding name `CLAUDE.md`. `AGENTS.md` has moved to `CLAUDE.md`, and `.gitignore` no longer has the `.omp/sdlc/` rule. |
| AC7 | AGENTS.md renamed to CLAUDE.md | Pass | Rename mode uses `git mv` when the file is tracked and `renameSync` otherwise. `git mv` tolerates working-tree modifications. |
| AC8 | AGENTS.md merged into existing CLAUDE.md | **Fail** | The merge path writes `CLAUDE.md` first and then runs `git rm -q -- AGENTS.md`. That command refuses a tracked file with local modifications, so the result is `failed:` with `CLAUDE.md` already appended and `AGENTS.md` still present. Reproduced below. |
| AC9 | Managed-section reconciliation uses CLAUDE.md | Pass | `references/project-agents.md` forbids creating the managed section in `AGENTS.md` and routes it through `agents-to-claude-md` to `CLAUDE.md`. Onboarding writes `CLAUDE.md`. Detection emits no item when `AGENTS.md` is absent. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | steering-v4-host-language | Complete | |
| T002 | contributing-v4-host-language | Complete | |
| T003 | agents-to-claude-md | Incomplete | Merge mode is not atomic and fails on a dirty tracked `AGENTS.md` |
| T004 | CLAUDE.md contract and onboarding | Complete | |
| T005 | Document the three groups | Complete | |
| T006 | Repository move and `.gitignore` cleanup | Complete | |
| T007 | Upgrade behavior tests | Complete | No test combines merge mode with a tracked, modified `AGENTS.md` |
| T008 | Contract tests | Complete | Skill inventory audit is clean (90 items) with no baseline change needed |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Each group has its own detect/apply pair. Planning is shared between detect and apply, so apply re-plans from live state. |
| Open/Closed | 4 | New kinds are added to the existing order table and dispatch. |
| Liskov Substitution | 5 | N/A |
| Interface Segregation | 4 | Item shapes are consistent with the existing groups. |
| Dependency Inversion | 4 | Steering writes go through the shared writer. |

### Layer Separation

The script layer stays deterministic. The workflow and reference docs describe the groups and don't duplicate logic.

---

## Security Assessment

- [x] Input validation: snippet paths must be under `steering/snippets/` with no `..`. Symlinks are rejected by `lstat`.
- [x] Injection prevention: git calls use argument arrays with `shell: false` and `--` separators.
- [x] Data protection: no secrets touched.

## Performance Assessment

- [x] Bounded scans: only registered snippets, the manifest, `CONTRIBUTING.md`, and the root instructions files are read.

## Error-Handling Assessment

Error handling is scored 2. The merge path in `applyAgentsToClaudeMd` mutates `CLAUDE.md` before it knows `AGENTS.md` can be removed, and it has no rollback. This violates the fail-closed and preservation invariant for upgrade groups.

---

## Test Coverage

| Acceptance Criterion | Has Scenario | Has Test | Passes |
|---------------------|-------------|-----------|--------|
| AC1–AC7, AC9 | Yes | Yes | Yes |
| AC8 | Yes | Yes (clean-tree merge only) | Clean tree yes. Dirty tracked `AGENTS.md`: no |

- `repository.tests` (`npm test -- --runInBand` in `scripts/`): passed, command exited 0

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | upgrade-project detect/apply runtime (`scripts/sdlc-upgrade.mjs`), called directly |
| **Test Project** | Disposable git repo in the worker scratchpad |
| **Exercise Method** | `detectUpgrade` then `applyUpgrade` with `agents-v4-host-language` and `agents-to-claude-md` approved, no network |

### Captured Output Summary

Fixture: tracked `AGENTS.md` (`agents/  # OMP task agents (a, b)` plus `notes`) and tracked `CLAUDE.md` (`# Claude`).

1. First apply: `agents-v4-host-language` returned `applied`. `agents-to-claude-md` returned `failed:error: the following file has local modifications: AGENTS.md (use --cached to keep the file, or -f to force removal)`. `CLAUDE.md` was appended to, and `AGENTS.md` remained.
2. Second apply: `agents-to-claude-md` failed again, and `CLAUDE.md` now held the `AGENTS.md` content twice.

### AC Evaluation

| AC | Verdict | Evidence |
|----|---------|----------|
| AC8 | Fail | `AGENTS.md` is not deleted. `CLAUDE.md` gets more than the original bytes plus one copy of `AGENTS.md`, and retries duplicate it. |

The interactive `/sdlc-upgrade-project` TUI was not exercised. The defect is in the deterministic apply runtime, so a direct call is sufficient evidence.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests (`repository.tests`) | Pass | `command exited 0` at `be02641` |
| Live smoke (`repository.nmg-sdlc-smoke`) | Pass | `nmg-sdlc-smoke delivered #224`, with a fresh issue provisioned through autopilot draft-issue/write-spec |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check` → clean (90 items mapped), exit 0 |
| Claude Code plugin surface | Pass | `verify-plugin-surface.mjs --root . --label repository` → passed, exit 0 |
| Skill creator validation | N/A | No fixes were made in this verification. Publication scope is the report only. |
| Prompt quality | Pass | The new doc steps are unambiguous and the order is documented |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |

**Gate Summary**: 6/6 applicable gates passed, 0 failed, 0 incomplete. The overall status is still Fail because of the AC8 review finding.

---

## Fixes Applied

None. This verify publication may write only `verification-report.md`, so the code defect is routed back to implementation.

## Remaining Issues

### High Priority

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Error Handling |
| **Location** | `scripts/sdlc-upgrade.mjs` `applyAgentsToClaudeMd`, merge branch (`fs.writeFileSync(claude, …)` followed by `gitCommand(root, ['rm', '-q', '--', 'AGENTS.md'])`) |
| **Issue** | Merge mode appends to `CLAUDE.md` before removing `AGENTS.md`. `git rm` refuses a tracked file that has working-tree or index changes. That always happens when `agents-v4-host-language` or `agents-spike-language` is approved in the same run, because both apply earlier and rewrite `AGENTS.md`. It also happens whenever a user has local edits. |
| **Impact** | A common v3 upgrade leaves both files in place, reports `failed:`, and duplicates the content in `CLAUDE.md` on every retry. AC8 ("AGENTS.md is deleted", "original CLAUDE.md bytes are unchanged" plus a single appended copy) is violated. |
| **Suggested fix** | Remove `AGENTS.md` safely before or atomically with the write: for example `git rm --cached -q` plus `unlinkSync`, or `git rm -f` once the content has been captured. Restore the original `CLAUDE.md` bytes if removal fails. Add a test for merge with a tracked, modified `AGENTS.md`, and one for `agents-v4-host-language` combined with `agents-to-claude-md`. |
| **Reason Not Fixed** | The verify publication scope allows only the report path |

---

## Positive Observations

- The steering rewrite re-plans from live state and goes through the shared writer, with staged validation and stable reason codes.
- `applySteeringRuntime` now reports the writer's own `reasonCode` instead of a generic one.
- The documentation updates are thorough and consistent across workflow, references, and README.

---

## Recommendations Summary

### Before PR (Must)
- [ ] Make `agents-to-claude-md` merge mode atomic and tolerant of a modified tracked `AGENTS.md`, then add the regression tests

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-upgrade.mjs` | 1 | Merge-mode atomicity |
| `scripts/__tests__/sdlc-upgrade.test.mjs` | 0 | Missing the dirty-merge case |
| `references/project-agents.md`, `references/contribution-guide.md` | 0 | |
| `workflows/upgrade-project/**`, `workflows/onboard-project/WORKFLOW.md`, `README.md` | 0 | |
| `CLAUDE.md`, `.gitignore`, `steering/snippets/*` | 0 | |

---

## Recommendation

**Needs fixes**

All registered gates are green, but AC8 fails in a realistic, reproducible upgrade scenario that corrupts `CLAUDE.md` on retry. Return to implementation for the merge-mode fix and its tests, then rerun the full gate.
