# Tasks: Migrate v3 Oh My Pi references and move AGENTS.md to CLAUDE.md during /sdlc-upgrade-project

**Issue**: #469
**Date**: 2026-10-24
**Status**: Approved
**Author**: Rich Nunley

## Implementation Tasks

### T001: Detect and apply steering-v4-host-language

**File(s)**: `scripts/sdlc-upgrade.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC1/FR1: `detectUpgrade` emits one `steering-v4-host-language` item with per-occurrence `{ file, line, before, after }` or `{ validationId, field, before, after }` evidence for every mapped token in registered snippets and in manifest validation `config.program` / `config.args`, including program `omp`→`claude` with `--print`→`-p`.
- AC2/FR2: `Oh My Pi` and whole-word, case-sensitive `OMP` in registered snippets become `Claude Code`. Lowercase `omp` changes only inside mapped tokens, and bytes outside the matches are unchanged.
- AC3/FR3: apply re-plans from live state and writes only through `applySteeringRuntime` with an update-mode plan.
- AC5/FR6: an unsafe snippet yields `skipped:unverifiable` / `steering_host_language_unsafe_path` with no write, and a writer failure yields `failed:<message>` with the writer's reason code.
- AC4: no item is emitted when there are no occurrences.
- Apply priority is 10.5.

### T002: Detect and apply contributing-v4-host-language

**File(s)**: `scripts/sdlc-upgrade.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC3/FR4: the exact v3 sentence anywhere in a regular root `CONTRIBUTING.md` yields one `contributing-v4-host-language` item, and apply replaces every occurrence with the v4 sentence, leaving all other bytes unchanged.
- AC4/FR6: no item is emitted after apply or when the sentence is absent. A symlinked or unreadable file yields `skipped:unverifiable` / `contributing_unsafe_path` with no write.
- Apply priority is 10.5.

### T003: Detect and apply agents-to-claude-md

**File(s)**: `scripts/sdlc-upgrade.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC7/FR8: with no `CLAUDE.md`, a regular `AGENTS.md` is renamed to `CLAUDE.md` with identical bytes. It uses `git mv` when tracked, otherwise a filesystem rename.
- AC8/FR8: with a regular `CLAUDE.md`, the content of `AGENTS.md` is appended after exactly one blank line. The original `CLAUDE.md` bytes stay as the prefix, the spec-context managed section appears exactly once (the CLAUDE copy is kept when both have one), and `AGENTS.md` is deleted.
- AC8: a symlinked or unreadable `AGENTS.md` or `CLAUDE.md` yields `skipped:collision` with no change.
- AC9: detect emits no `agents-to-claude-md` item when `AGENTS.md` is absent.
- Apply priority is 7.75, after `agents-spike-language` and `agents-host-language`.

### T004: Switch the project instructions contract and onboarding to CLAUDE.md

**File(s)**: `references/project-agents.md`, `workflows/onboard-project/WORKFLOW.md`, `references/contribution-guide.md`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC9/FR9: `references/project-agents.md` creates, refreshes, and classifies the managed spec-context section in root `CLAUDE.md`, never in `AGENTS.md`. Its summary reports `CLAUDE.md:`, and it routes an existing `AGENTS.md` to `agents-to-claude-md`.
- AC9: `workflows/onboard-project/WORKFLOW.md` names `CLAUDE.md` as the managed asset.
- AC6/FR5: `references/contribution-guide.md` classifies a guide containing the exact v3 sentence as stale, refreshed by `contributing-v4-host-language`, and names `CLAUDE.md` as the project instructions file.

### T005: Document the three upgrade groups

**File(s)**: `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/v3-detectors.md`, `workflows/upgrade-project/references/detection.md`, `workflows/upgrade-project/references/upgrade-procedures.md`, `README.md`
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- AC6/FR7: each file names `steering-v4-host-language`, `contributing-v4-host-language`, and `agents-to-claude-md` with their signal, fixed mapping or move behavior, apply order, and fail-closed reason codes (`steering_host_language_unsafe_path`, `contributing_unsafe_path`, `skipped:collision`).
- The upgrade WORKFLOW's managed-artifact step reads `CLAUDE.md`, and the README "Upgrading from 3.x" and managed-assets text name root `CLAUDE.md`.

### T006: Move this repository to CLAUDE.md and drop the legacy ignore rule

**File(s)**: `AGENTS.md`, `CLAUDE.md`, `steering/snippets/project-structure.md`, `steering/snippets/project-tech.md`, `.gitignore`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC6/FR10: `AGENTS.md` is moved to `CLAUDE.md` with a git rename, with its H1 `# CLAUDE.md`, and no root `AGENTS.md` remains.
- Root-instructions references in the steering snippets name `CLAUDE.md`.
- AC6/FR7: `.gitignore` has no `.omp/sdlc/` line and keeps `.nmg-sdlc/`.

### T007: Upgrade behavior tests

**File(s)**: `scripts/__tests__/sdlc-upgrade.test.mjs`
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- AC1: a temp project initialized with `createInitializePlan` has snippets and a validation (`program: 'omp'`, args `['--print', 'scripts/exercise-omp.mjs']`) covering every mapped token. Detect lists each occurrence with exact before/after, and apply produces exactly the mapped text with a valid runtime afterward.
- AC2: `Oh My Pi`, `OMP`, and a non-word `OMPX` / lowercase `omp` fixture prove whole-word, case-sensitive prose replacement with unchanged surrounding bytes.
- AC3: a CONTRIBUTING sentence placed under a non-nmg-sdlc heading is replaced, with all other bytes equal.
- AC4: a repeat detect after apply, and a token-free project, report neither group. A declined group (not in the approved ids) leaves file bytes identical.
- AC5: a symlinked registered snippet yields `skipped:unverifiable`, and a tampered `steering/modules/product.mjs` yields a `failed:` status with reason code `steering_module_invalid`. Steering bytes are unchanged in both cases.
- AC7: an untracked and a git-tracked rename (`git status --porcelain` shows `R  AGENTS.md -> CLAUDE.md`) both keep identical bytes.
- AC8: merge cases cover both files having a managed section (exactly one section, the CLAUDE copy), a section only in AGENTS, a CLAUDE.md without a trailing newline (one blank line separator), and a symlinked `AGENTS.md` (`skipped:collision`, nothing changed).
- AC9: a repeat detect after the move reports no `agents-to-claude-md`.
- `cd scripts && npm test` exits 0.

### T008: Contract tests for docs, CLAUDE.md, and the repository move

**File(s)**: `scripts/__tests__/spec-context-contract.test.mjs`, `scripts/__tests__/exercise-spec-context.test.mjs`, `scripts/__tests__/upgrade-v4-host-language-contract.test.mjs`, `scripts/skill-inventory.baseline.json`
**Type**: Create | Modify
**Depends**: T004, T005, T006
**Acceptance**:
- AC9: `exercise-spec-context.test.mjs` creates and refreshes the managed section in `CLAUDE.md` for a project with no `AGENTS.md`, and never creates `AGENTS.md`. `spec-context-contract.test.mjs` asserts that `references/project-agents.md` names root `CLAUDE.md` as the target, with markers intact.
- AC6: the new contract test asserts that:
  - each upgrade doc listed in T005 names all three group ids;
  - `references/contribution-guide.md` contains the stale-v3 rule;
  - `references/project-agents.md` and `workflows/onboard-project/WORKFLOW.md` name `CLAUDE.md`;
  - the repository root has `CLAUDE.md` and no `AGENTS.md`;
  - `.gitignore` has no `.omp/sdlc` rule.
- `node scripts/skill-inventory-audit.mjs --check` and `node scripts/verify-plugin-surface.mjs --root . --label repository` exit 0, and `cd scripts && npm test` exits 0.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #469 | 2026-10-24 | Initial feature tasks |
