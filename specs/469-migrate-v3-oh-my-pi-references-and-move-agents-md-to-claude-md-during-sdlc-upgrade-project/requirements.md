# Requirements: Migrate v3 Oh My Pi references and move AGENTS.md to CLAUDE.md during /sdlc-upgrade-project

**Issue**: #469
**Date**: 2026-10-24
**Status**: Approved
**Author**: Rich Nunley

## User Story

**As a** developer upgrading a v3 (Oh My Pi) nmg-sdlc consumer project to v4 (Claude Code)
**I want** `/sdlc-upgrade-project` to detect and rewrite the v3 host wording left in my registered steering snippets, my `steering/manifest.json` validation commands, and the nmg-sdlc CONTRIBUTING.md guidance, and to move my project instructions from `AGENTS.md` to `CLAUDE.md`
**So that** after upgrade my project's documents and validations describe and invoke Claude Code instead of Oh My Pi, and Claude Code loads my project instructions

## Background

`scripts/sdlc-upgrade.mjs` already detects and applies four v3 → v4 groups: `runtime-state-v4`, `nmg-sdlc-ignore`, `agents-v4-host-language`, and the detector-only `packaging-v4-claude-code-herdr`. Nothing detects OMP host tokens or prose in registered steering snippets or in manifest validation `config.program` / `config.args`. The v3 CONTRIBUTING.md bullet "drives Herdr omp worker panes through implementation, verification, and delivery" still meets the guide's "Complete guide" coverage rule, so upgrade reports it `already present` and never refreshes it. Onboarding and upgrade write the managed `<!-- nmg-sdlc-managed: spec-context -->` section to root `AGENTS.md`, which Claude Code doesn't load as project memory; Claude Code loads `CLAUDE.md`. This repository's own instructions are in `AGENTS.md`, and its `.gitignore` still carries the legacy `.omp/sdlc/` rule.

## Acceptance Criteria

### AC1: Steering host tokens are proposed and rewritten

**Given** a project whose registered steering snippets or `steering/manifest.json` validations contain exact v3 host tokens (`omp --print`, `--kind omp`, `--kind pi`, `.omp/sdlc/`, `.omp/sdlc`, `exercise-omp.mjs`, `omp-sdlc-ignore.mjs`, `herdr integration install omp`, or a validation whose `config.program` is `omp`)
**When** `/sdlc-upgrade-project` runs detect
**Then** it reports one actionable `steering-v4-host-language` group. The group lists every file and line, or validation id and field, with the exact before/after text from the fixed mapping: `omp --print`→`claude -p`, `--kind omp`/`--kind pi`→`--kind claude`, `.omp/sdlc/`→`.nmg-sdlc/`, `.omp/sdlc`→`.nmg-sdlc`, `exercise-omp.mjs`→`exercise-claude.mjs`, `omp-sdlc-ignore.mjs`→`nmg-sdlc-ignore.mjs`, `herdr integration install omp`→`herdr integration install claude`, and program `omp`→program `claude` with an arg `--print`→`-p`. Approved apply writes exactly those replacements through the shared steering writer in update mode.

### AC2: Steering host prose is proposed and rewritten

**Given** a registered steering snippet containing `Oh My Pi` or the whole-word, case-sensitive token `OMP`
**When** detect runs and the `steering-v4-host-language` group is approved
**Then** the proposal shows each occurrence as a before/after line, and apply replaces it with `Claude Code`. Bytes outside the replaced occurrences are unchanged, and the staged steering runtime validates before the write commits.

### AC3: v3 CONTRIBUTING.md wording is refreshed

**Given** a `CONTRIBUTING.md` that contains, anywhere in the file, the exact v3 sentence "drives Herdr omp worker panes through implementation, verification, and delivery"
**When** detect runs
**Then** it reports a `contributing-v4-host-language` item. Approved apply replaces each occurrence of that sentence with "drives Herdr Claude worker panes through implementation, verification, and delivery" and leaves every other byte of the file unchanged.

### AC4: Idempotent and declinable

**Given** a project where both groups were applied, or where neither file contains any mapped token, prose term, or known v3 sentence
**When** detect runs again
**Then** neither `steering-v4-host-language` nor `contributing-v4-host-language` is reported. A declined group leaves its files byte-for-byte unchanged.

### AC5: Unsafe or invalid steering fails closed

**Given** a registered steering snippet that is a symlink or unreadable, or a rewrite whose staged steering runtime fails validation
**When** apply runs for `steering-v4-host-language`
**Then** no steering file is written. The per-id outcome is `skipped:unverifiable` with `reasonCode: steering_host_language_unsafe_path`, or `failed:<message>` with the steering writer's stable reason code.

### AC6: Documentation matches the new groups

**Given** the upgrade documentation in this repository
**When** the change is complete
**Then** all of these hold:
- `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/v3-detectors.md` (v4 Detectors), `workflows/upgrade-project/references/detection.md`, `workflows/upgrade-project/references/upgrade-procedures.md`, and README "Upgrading from 3.x" describe the three new groups.
- `references/contribution-guide.md`, `references/project-agents.md`, and `workflows/onboard-project/WORKFLOW.md` name `CLAUDE.md` as the project instructions file.
- This repository's `AGENTS.md` has moved to `CLAUDE.md`, and the references to it are updated.
- This repository's `.gitignore` no longer carries the `.omp/sdlc/` rule.

### AC7: AGENTS.md is renamed to CLAUDE.md

**Given** a project with a regular root `AGENTS.md` and no `CLAUDE.md`
**When** `/sdlc-upgrade-project` runs detect and the `agents-to-claude-md` group is approved
**Then** `AGENTS.md` is renamed to `CLAUDE.md` with identical bytes (a git rename when the file is tracked), and no `AGENTS.md` remains.

### AC8: AGENTS.md is merged into an existing CLAUDE.md

**Given** a project with both a regular root `AGENTS.md` and a regular root `CLAUDE.md`
**When** the `agents-to-claude-md` group is approved
**Then** all of these hold:
- The content of `AGENTS.md` is appended to `CLAUDE.md` after one blank line.
- The `nmg-sdlc-managed: spec-context` section appears exactly once in the result. When both files have one, the copy already in `CLAUDE.md` is kept.
- The original `CLAUDE.md` bytes are unchanged.
- `AGENTS.md` is deleted.

A symlinked or unreadable `AGENTS.md` or `CLAUDE.md` changes nothing and reports `skipped:collision`.

### AC9: Onboarding and managed-section reconciliation use CLAUDE.md

**Given** a project with no `AGENTS.md`
**When** `/sdlc-onboard-project` or `/sdlc-upgrade-project` creates or refreshes the managed spec-context section
**Then** it creates or updates root `CLAUDE.md`, never `AGENTS.md`, and a repeat upgrade run after the move reports no `agents-to-claude-md` item.

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `detectUpgrade` emits `steering-v4-host-language` for exact v3 host tokens in registered snippets and in manifest validation program/args, with per-occurrence before/after evidence | Must |
| FR2 | The same group covers `Oh My Pi` and whole-word `OMP` prose in registered snippets, replaced with `Claude Code` | Must |
| FR3 | `applyUpgrade` writes approved steering rewrites only through the shared steering writer in update mode, after staged runtime validation | Must |
| FR4 | `detectUpgrade` emits `contributing-v4-host-language` for the exact known v3 CONTRIBUTING.md sentence anywhere in the file, and apply replaces only that sentence | Must |
| FR5 | `references/contribution-guide.md` treats a guide that contains a known v3 managed sentence as stale rather than complete | Must |
| FR6 | Both groups are idempotent and declinable, and fail closed on symlinked, unreadable, or invalid targets | Must |
| FR7 | The upgrade workflow, its references, and README document the new groups; this repository's `.gitignore` drops the `.omp/sdlc/` rule | Must |
| FR8 | `detectUpgrade` emits `agents-to-claude-md` when a root `AGENTS.md` exists. Apply renames it to `CLAUDE.md`, or appends it to an existing `CLAUDE.md` with one managed section and deletes `AGENTS.md` | Must |
| FR9 | The project instructions contract (`references/project-agents.md`) and onboarding create and reconcile the managed spec-context section in `CLAUDE.md` | Must |
| FR10 | This repository's `AGENTS.md` moves to `CLAUDE.md`, and in-repo references to the root instructions file name `CLAUDE.md` | Must |

## Out of Scope

- Rewriting OMP wording in consumer files other than registered steering snippets, `steering/manifest.json`, and the known CONTRIBUTING.md sentence (for example README.md, specs, CHANGELOG.md, or source code)
- Changes to the existing `runtime-state-v4`, `nmg-sdlc-ignore`, `agents-v4-host-language`, `agents-spike-language`, and `packaging-v4-claude-code-herdr` groups
- Changing the wording of the managed spec-context section beyond where it lives
- Rewriting released CHANGELOG.md entries or historical specs that mention `AGENTS.md`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #469 | 2026-10-24 | Initial feature spec |
