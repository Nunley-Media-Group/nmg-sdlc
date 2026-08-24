# Requirements: Resolve plugin controllers independently of target project cwd

**Issue**: #252
**Date**: 2026-08-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

---

## User Story

**As a** developer running nmg-sdlc from an unrelated Oh My Pi / Herdr project
**I want** every public command and worker workflow to reach the installed plugin controller
**So that** start, execute, status, review, publication, and upgrade work without a project-local `scripts/` directory

---

## Background

#194 / PR #210 moved start and execute orchestration into deterministic controllers. Those controllers work when reached and must not be redesigned here.

Public command and worker surfaces still tell the agent to run `node scripts/<name>.mjs`. Node resolves that path against `process.cwd()`. Consumer projects correctly keep `process.cwd()` as the product root and typically have no plugin `scripts/` tree, so the installed controller is never opened (`MODULE_NOT_FOUND`).

OMP discovers `commands/*.md` from the enabled plugin root and expands only `$ARGUMENTS` / prompt-template fields (`args`, `ARGUMENTS`, `arguments`). It does not inject the plugin root into `node scripts/...`. Linked marketplace/npm installs expose the package through `node_modules` symlinks or Windows junctions. Executable controllers then compare lexical `process.argv[1]` with `fileURLToPath(import.meta.url)` and skip `runCli()` when those strings differ, exiting 0 with no output.

This issue covers only that installed-dispatch gap. Do not reopen #194 orchestration, do not change Herdr main-pane / sibling-worker isolation, and do not require consumers to vendor plugin scripts.

**Version bump**: minor

---

## Acceptance Criteria

Each criterion becomes a Gherkin scenario.

### AC1: Explicit execute reaches the installed controller

**Given** nmg-sdlc is installed through OMP and Herdr starts OMP from an unrelated project without `scripts/sdlc-execute.mjs`
**When** the operator runs `/sdlc-execute #N`
**Then** the installed plugin controller starts without `MODULE_NOT_FOUND`
**And** the target project remains `process.cwd()` for approved-spec and product-state reads

### AC2: Execute selection paths share one authoritative controller

**Given** an installed plugin is invoked from an unrelated target project
**When** the operator uses either empty `/sdlc-execute` selection or explicit `/sdlc-execute #N`
**Then** both paths resolve and invoke the same authoritative installed execute controller
**And** neither path consults a project-local `scripts/` file

### AC3: Every applicable public controller call is package-root safe

**Given** start, status, review, apply-review, write-spec publication, upgrade, and other installed command or worker workflows invoke plugin-owned controllers
**When** those stages run with the target project as cwd
**Then** every applicable controller resolves through the same package-root-safe contract
**And** auditing every public command and worker workflow containing `node scripts/*.mjs` finds no remaining cwd-relative plugin entrypoint

### AC4: Linked CLIs run exactly once and imports remain inert

**Given** an installed package copy, Windows junction, or Unix symlink points to an nmg-sdlc executable controller
**When** Node invokes that linked controller as the entry module
**Then** its CLI runs exactly once
**And** importing the controller as a module does not run its CLI

### AC5: Controller-resolution failure is explicit and non-mutating

**Given** the installed plugin controller cannot be resolved or executed
**When** a public command or worker reaches that boundary
**Then** it emits an explicit non-zero failure naming the controller-resolution problem
**And** it does not silently exit, fall back to a project-local file, start a worker, or mutate product state

### AC6: Installation topology regressions are covered

**Given** separate disposable target projects
**When** regression tests invoke public controller entrypoints through both a copied/package installation and a linked local-repository installation
**Then** both installations preserve the target cwd and execute the intended CLI exactly once
**And** the tests cover Windows junction semantics and Unix symlink semantics on their applicable platforms

### AC7: Live OMP proof uses the installed plugin topology

**Given** the packaged candidate is installed through OMP's supported plugin mechanism
**When** a disposable-project live OMP exercise invokes the changed public command
**Then** the installed command reaches the plugin controller from the unrelated target project
**And** the proof does not rely only on `--plugin-dir` plus `--add-dir` source-tree visibility

### AC8: Herdr isolation remains unchanged

**Given** controller resolution succeeds
**When** execute runs through the Herdr main pane and sibling workers
**Then** existing main-pane non-mutation, sibling-worker ownership, cwd, handoff, pane-retention, and exact-head delivery contracts remain unchanged

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Resolve every plugin-owned public controller entrypoint from the installed package independently of the target project's cwd. | Must | Shared helper; no equivalent exists today. |
| FR2 | Keep the target project as controller cwd; never require consumer projects to copy, generate, or link a `scripts/` directory. | Must | |
| FR3 | Make executable-controller detection correct for package copies, Windows junctions, and Unix symlinks while keeping module imports side-effect free. | Must | Shared `isCliEntry`; replace every applicable inline guard. |
| FR4 | Fail explicitly and without mutation when the authoritative installed controller cannot be resolved; never use model inference or accidental workspace visibility. | Must | No cwd `scripts/` fallback. |
| FR5 | Audit all public command and worker workflow controller invocations and apply the same contract wherever applicable. | Must | See design inventory. |
| FR6 | Prove copied and linked installation behavior from separate disposable target projects, including a live installed-topology OMP exercise. | Must | AC7 is not satisfied by `--plugin-dir`/`--add-dir` alone. |

---

## Out of Scope

- Attributing the defect to `/sdlc-upgrade-project` or using upgrade as the repair.
- Reopening, rolling back, or redesigning the controller orchestration delivered by #194 and PR #210.
- Diagnosing a validated supported installation as corrupt or requiring a different install method.
- Requiring consumer projects to vendor, generate, copy, or link plugin scripts.
- Changing the target project cwd to the plugin repository.
- Resolving controller paths through model inference or incidental workspace visibility.
- Changing existing Herdr main-pane or sibling-worker isolation semantics.
- Rewriting repository CI invocations that already run with the plugin checkout as cwd (`node scripts/verify-plugin-surface.mjs` in `.github/workflows`).

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #252 | 2026-08-24 | Initial feature spec |
