# Tasks: Add Lifecycle Status Command for Active SDLC Work

**Issues**: #145
**Date**: 2026-08-12
**Status**: Implemented — amended
**Author**: Codex

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Backend | 3 | [x] |
| Skill | 1 | [x] |
| Integration | 1 | [x] |
| Testing | 4 | [x] |
| **Total** | **9** | |

Skill-bundled files under `skills/status/` must be authored through `$skill-creator`. There is no direct-edit fallback.

The automated SDLC runner is scheduled for removal in milestone 2. No task may modify or test runner code, read runner artifacts, or add a shared runner/status contract.

---

## Phase 1: Backend Implementation

### T001: Implement Bounded Manual-Lifecycle Evidence Collection

**File(s)**: `scripts/sdlc-status.mjs`
**Type**: Create
**Depends**: None
**Acceptance**:

- [x] Collect project root, branch, worktree status, base-relative commits, strict spec match, required spec files, and verification report.
- [x] Perform only read-only, field-bounded GitHub issue, pull-request, and check probes when prerequisite context exists.
- [x] Return normalized evidence plus named gaps for absent, malformed, unsupported, or unreachable optional sources.
- [x] Use injected or isolated command/filesystem adapters for mutation-free tests.
- [x] Do not read runner source, state, sentinels, logs, configuration, or PIDs.

### T002: Implement Conservative Lifecycle Inference

**File(s)**: `scripts/sdlc-status.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:

- [x] Classify `idle`, `started`, `specified`, `implemented`, `verified`, `pull-request-open`, `complete`, and `unknown`.
- [x] Stop advancement at the last consistent lifecycle boundary when sources conflict and record the conflict as a gap.
- [x] Produce completed artifacts, missing artifacts, and an exact manual nmg-sdlc command or manual-repair action.
- [x] Never recommend runner resume, runner cleanup, or `$nmg-sdlc:end-loop`.

### T003: Implement the Read-Only CLI and Renderers

**File(s)**: `scripts/sdlc-status.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:

- [x] Support `--project <repo-root>`, optional `--json`, and `--help` through `node:util` `parseArgs`.
- [x] Human output leads with stage, ends with exact next action, and presents issue/branch, artifacts, and gaps in stable order.
- [x] JSON output uses `schemaVersion: 1` and always includes every documented top-level field.
- [x] JSON mode writes no diagnostic prose to stdout; recoverable probe failures appear only in structured gaps.
- [x] Invalid invocation or a non-git project exits non-zero; optional evidence failures return degraded output successfully.
- [x] Importing the module for tests does not execute the CLI entrypoint.

---

## Phase 2: Skill

### T004: Author the Lifecycle Status Skill Through `$skill-creator`

**File(s)**: `skills/status/SKILL.md`
**Type**: Create
**Depends**: T003
**Acceptance**:

- [x] `$skill-creator` guidance drives the skill-bundled edit and validation.
- [x] Frontmatter contains only `name` and a trigger-complete `description`.
- [x] Accept only empty arguments or `--json`, resolve project root and installed plugin root, and invoke `scripts/sdlc-status.mjs` with argument-safe construction.
- [x] Be explicitly read-only and never call `request_user_input`.
- [x] Include an `Integration with SDLC Workflow` section and stay within repository size/pointer conventions.
- [x] Contain no runner-state, log, sentinel, PID, resume, cleanup, or unattended-loop behavior.

---

## Phase 3: Integration

### T005: Document the Lifecycle Status Surface

**File(s)**: `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T003, T004
**Acceptance**:

- [x] README documents `$nmg-sdlc:status` and `$nmg-sdlc:status --json`, their read-only guarantee, output fields, and evidence gaps.
- [x] README places status as a diagnostic utility without renumbering shipping stages.
- [x] README explains that status recommends owning commands and never verifies, delivers, or merges by itself.
- [x] README and the spec state that automated-runner integration is out of scope ahead of milestone-2 runner removal.
- [x] `CHANGELOG.md` `[Unreleased]` records issue #145 without rolling a release heading.

---

## Phase 4: BDD Testing and Verification

### T006: Add Lifecycle Status Unit and Integration Tests

**File(s)**: `scripts/__tests__/sdlc-status.test.mjs`
**Type**: Create
**Depends**: T003
**Acceptance**:

- [x] Table-driven cases cover every manual lifecycle stage.
- [x] Cases cover dirty worktrees, missing specs/reports, GitHub unavailable, failed/pending/absent CI, and conflicting evidence.
- [x] Tests map one-to-one to all five acceptance scenarios, with a separate static guard for the out-of-scope runner scenario.
- [x] Before/after filesystem and git snapshots plus command spies prove text and JSON modes perform no mutation.
- [x] Tests prove runner files and artifacts are never probed.
- [x] Renderer tests validate stable field presence, `schemaVersion: 1`, valid JSON, and stdout purity.

### T007: Add Status Skill Contract and Exercise Coverage

**File(s)**: `scripts/__tests__/status-skill-contract.test.mjs`, `scripts/__fixtures__/skill-exercise/status/`, `scripts/__fixtures__/skill-exercise/rubrics/status.md`, `scripts/skill-exercise-runner.mjs`, `scripts/__tests__/skill-exercise-runner.test.mjs`
**Type**: Create and Modify
**Depends**: T004, T006
**Acceptance**:

- [x] Static contract tests assert trigger coverage, argument surface, installed-root resolution, exact CLI delegation, non-interactivity, and read-only prohibitions.
- [x] Disposable fixture states exercise a complete specified branch, GitHub-unavailable fallback, conflicting evidence, and read-only text/JSON parity.
- [x] Exercise output is captured as verification evidence without creating or changing GitHub resources.
- [x] The fixture is repeatable and the evaluator contains no placeholder rubric skips.
- [x] Skill and fixture contain no automated-runner integration.

### T008: Refresh Intentional Inventory and Run Verification Gates

**File(s)**: `specs/feature-add-lifecycle-status-command-for-active-sdlc-work/feature.gherkin`, `scripts/skill-inventory.baseline.json` only if audit requires
**Type**: Verify and conditional modify
**Depends**: T005, T006, T007
**Acceptance**:

- [x] All five acceptance scenarios remain mapped one-to-one to AC1-AC5, plus one explicit out-of-scope runner guard.
- [x] Run `cd scripts && npm test`; all tests pass.
- [x] Run `node scripts/skill-inventory-audit.mjs --check`; inspect and refresh the baseline only for intentional drift, then rerun to green.
- [x] Run `node scripts/skill-exercise-runner.mjs --skill status`; captured criteria contain no placeholder skips.
- [x] Run `node scripts/codex-compatibility-check.mjs` and `git diff --check` successfully.
- [x] Verify the final diff contains no runner source/test changes or runner inspection path and records `$skill-creator` routing.

### T009: Prove Verification Freshness from Git Provenance

**File(s)**: `scripts/sdlc-status.mjs`, `scripts/__tests__/sdlc-status.test.mjs`, `README.md`, `CHANGELOG.md`, active spec files
**Type**: Modify
**Depends**: T006
**Acceptance**:

- [x] Resolve the latest commit containing the active `verification-report.md` using read-only Git commands.
- [x] Treat a passing report as current only when its commit is in the current branch history, the report is unchanged, and no implementation path changed after that commit.
- [x] Keep documentation-only commits after verification current.
- [x] Treat uncommitted reports and post-verification implementation changes as named gaps and retain the `implemented` stage.
- [x] Add no automated-runner source, test, state, sentinel, log, configuration, PID, resume, or cleanup behavior.

---

## Dependency Graph

```text
T001 → T002 → T003 → T004 → T005
                  │      └──→ T007 ──┐
                  └──→ T006 ─────────┼──→ T008
                         └──→ T009 ───┘
```

**Critical path**: T001 → T002 → T003 → T004 → T007 → T008; verification hardening: T006 → T009

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #145 | 2026-08-12 | Initial feature tasks |
| #145 | 2026-08-12 | Removed runner integration tasks ahead of milestone-2 runner removal |
| #145 | 2026-08-12 | Added and completed commit-proven verification freshness hardening |
