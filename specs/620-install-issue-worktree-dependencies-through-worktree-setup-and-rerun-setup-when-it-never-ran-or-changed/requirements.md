# Defect Report: Install issue worktree dependencies through worktree setup and rerun setup when it never ran or changed

**Issue**: #620
**Date**: 2026-11-25
**Status**: Approved
**Author**: Claude Code

## Reproduction

1. Run the start stage for an issue so a new worktree is created under `<repo>-wt/<N>`.
2. Check for `scripts/node_modules` in that worktree. It is missing.
3. Run the `repository.tests` validation there. `npm test` in `scripts/` starts `node_modules/.bin/jest` and fails with `MODULE_NOT_FOUND`.
4. Declare a `worktree.setup` command in `steering/manifest.json` and reuse the same worktree. The record already says setup succeeded, so the command does not run.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The start stage installs the worktree's dependencies through the declared setup command, so `repository.tests` can start Jest without a manual install. A reused worktree whose recorded setup ran no command, or ran a different command than the one now declared, runs the declared setup again |
| **Actual** | No dependencies are installed, `repository.tests` fails with `MODULE_NOT_FOUND`, and a reused worktree never picks up a newly declared or changed setup command |

## Acceptance Criteria

### AC1: This repository declares a dependency-installing setup

**Given** this repository's `steering/manifest.json`
**When** it is validated
**Then** it declares `worktree.setup` as `npm ci` with `cwd` `scripts`
**And** the manifest passes steering validation

### AC2: A never-run setup runs on reuse

**Given** an issue worktree whose record shows setup succeeded without running a command
**And** steering now declares a setup command
**When** the worktree is reused by the start stage
**Then** the declared setup command runs in the worktree and its result is recorded

### AC3: A changed setup command runs on reuse

**Given** an issue worktree whose record shows a successful run of a different setup command than the one now declared
**When** the worktree is reused
**Then** the declared setup command runs and its result is recorded

### AC4: An unchanged successful setup is not repeated

**Given** an issue worktree whose record shows a successful run of the same setup command that is declared now
**When** the worktree is reused
**Then** setup does not run again

### AC5: Existing setup behavior is preserved

**Given** a spec worktree (`spec/<N>-<slug>`), or a failed recorded setup
**When** the worktree is created or reused
**Then** a spec worktree runs neither setup nor teardown, and a failed setup still fails the start with `worktree_setup_failed` and runs again on the next reuse

### AC6: The documentation describes when setup reruns

**Given** `references/steering-schema.md` and `README.md`
**When** they describe the worktree `setup` command
**Then** each contains the sentence "On a reused issue worktree, setup runs again when the recorded setup failed, ran no command while one is now declared, or ran a different command than the one now declared."

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `steering/manifest.json` declares `worktree.setup` `{ "program": "npm", "args": ["ci"], "cwd": "scripts" }` | Must |
| FR2 | The worktree record stores the identity of the setup command that ran | Must |
| FR3 | On reuse, setup runs when the record shows no command ran while one is declared, or a different command than the one declared | Must |
| FR4 | `references/steering-schema.md` and `README.md` describe when setup reruns on a reused worktree | Must |

## Out of Scope

- Classifying a missing-dependency validation failure differently from other command failures
- Per-validation setup or install fields

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #620 | 2026-11-25 | Initial defect report |
