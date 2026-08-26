# Requirements: Fix project runtime loading under compiled OMP host

**Issue**: #269
**Date**: 2026-08-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/213-add-a-prompt-snippet-registry-for-command-and-worker-composition/

---

## User Story

**As a** developer using project-aware nmg-sdlc commands in OMP
**I want** project steering fragments loaded by Node regardless of the extension host executable
**So that** valid project steering does not prevent `/sdlc-draft-issue` and related commands from running

## Background

Issue #213 added project prompt-fragment loading by spawning `scripts/sdlc-steering.mjs` through `process.execPath`. That value identifies Node during source tests, but identifies the compiled OMP executable when the extension runs in the distributed host. The OMP executable cannot act as the Node interpreter for the steering controller, so the child process fails and the extension reports `project_runtime_invalid`.

The package already requires Node 20 or newer and all controller instructions invoke `node`. Project prompt loading must use that supported runtime explicitly while retaining fail-closed validation of the controller result.

**Version bump**: minor

---

## Acceptance Criteria

### AC1: Compiled-host execution uses Node

**Given** `process.execPath` identifies a non-Node compiled OMP host
**When** a valid project steering manifest is loaded
**Then** the steering controller is launched with the supported `node` command
**And** project prompt fragments are registered successfully

### AC2: Draft issue renders with valid project steering

**Given** a project with a valid steering manifest and product snippet
**When** `/sdlc-draft-issue` is rendered through the packaged extension surface
**Then** the command enters native plan mode
**And** the project product guidance is included

### AC3: Invalid project steering still fails closed

**Given** a project with an invalid steering manifest or controller result
**When** a project-aware command is rendered
**Then** rendering fails with `project_runtime_invalid`
**And** no plugin-only fallback hides the invalid project runtime

### AC4: Installed surface is exercised

**Given** the packaged plugin candidate and a disposable project
**When** `/sdlc-draft-issue` is entered through the actual OMP TUI
**Then** native plan mode opens without `project_runtime_invalid`

### AC5: Unknown controller examples do not break extension context

**Given** a runtime context message contains `node <plugin-root>/scripts/missing.mjs` as data
**When** the extension materializes available packaged controller paths
**Then** the unknown example remains unchanged
**And** direct plugin-owned controller resolution still fails closed for missing files

### AC6: Project steering reflects the current runtime

**Given** the nmg-sdlc project steering snippets
**When** the managed steering runtime is validated
**Then** snippet byte bounds cover their registered content
**And** stale version pins and temporary v3 authoring exemptions are absent
**And** the current source, steering, extension, and contribution layout is documented

### AC7: Verification includes a live read-only consumer smoke

**Given** repository verification runs with network, Git, OMP, and the public smoke repository available
**When** the required `repository.nmg-sdlc-smoke` provider runs
**Then** it clones `Nunley-Media-Group/nmg-sdlc-smoke` without mutating that repository
**And** exercises `/sdlc-status --json` with this checkout loaded
**And** passes only when `nextAction.command` is a `/sdlc-` command
**And** classifies unavailable clone or launch prerequisites as incomplete

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Launch the project steering controller with `node`, not the extension host executable. | Must |
| FR2 | Preserve the existing controller arguments, timeout, JSON validation, and fail-closed reason code. | Must |
| FR3 | Cover a non-Node `process.execPath` and unknown controller context in focused behavioral tests. | Must |
| FR4 | Record installed/disposable-project exercise evidence before delivery. | Must |
| FR5 | Preserve unknown controller examples in arbitrary extension context while retaining strict direct resolution. | Must |
| FR6 | Keep registered project steering content, byte bounds, and current runtime guidance synchronized. | Must |
| FR7 | Register an always-required read-only live consumer smoke provider with deterministic pass, fail, and incomplete outcomes. | Must |

## Out of Scope

- Changing steering manifest or fragment schemas.
- Adding a fallback that ignores invalid project steering.
- Changing repair-command plugin-only behavior.
- Altering worker orchestration or delivery controllers.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #269 | 2026-08-25 | Initial bug-fix spec |
