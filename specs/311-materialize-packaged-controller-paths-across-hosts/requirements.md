# Defect Report: Materialize packaged controller paths across hosts

**Issue**: #311
**Date**: 2026-08-28
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/266-fix-controller-path-rewriting-of-project-commands/

---

## Reproduction

1. Install the current nmg-sdlc package on Windows through Oh My Pi.
2. From a consumer project, invoke `/sdlc-execute 19`.
3. Observe the packaged prompt invoke Node with `/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/sdlc-execute.mjs`.
4. Observe `MODULE_NOT_FOUND` before the execute controller starts.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Every packaged plugin-owned controller invocation resolves to the active installed nmg-sdlc package root using a valid path for the current host OS. Packaged workflow and command artifacts remain host-neutral. Project-local commands remain unchanged. |
| **Actual** | The Windows invocation preserves a macOS absolute controller path from the packaged prompt. Node cannot resolve that path and exits with `MODULE_NOT_FOUND` before controller execution. |

## Acceptance Criteria

### AC1: Execute Uses the Installed Windows Controller

**Given** nmg-sdlc is installed on Windows and a packaged execute prompt contains a foreign POSIX path to the nmg-sdlc execute controller
**When** the user runs `/sdlc-execute 19`
**Then** Node invokes `scripts/sdlc-execute.mjs` beneath the active installed package root
**And** the emitted invocation contains no foreign contributor-host path
**And** controller startup does not fail with `MODULE_NOT_FOUND`

### AC2: Every Packaged Controller Uses the Active Package Root

**Given** any packaged execute, verify, deliver, interactive, or worker prompt invokes an nmg-sdlc-owned controller
**When** the prompt is materialized on Windows, macOS, or Linux
**Then** the invocation uses the corresponding controller beneath the active installed nmg-sdlc package root
**And** its existing arguments and workflow behavior are preserved

### AC3: Packaged Artifacts Stay Host-Neutral

**Given** packaged workflow and file-command artifacts are generated or validated
**When** the repository contract checks run
**Then** every plugin-owned controller invocation is stored in the canonical host-neutral representation `<plugin-root>/scripts/<name>.mjs`
**And** no contributor-host absolute controller path is accepted in generated workflow or command artifacts
**And** generated command artifacts remain synchronized with their workflow sources

### AC4: Project-Local Commands Remain Unchanged

**Given** prompt text contains a project-local command such as `node scripts/check-gate.mjs` or a project-owned absolute script path that does not identify `nmg-sdlc/scripts/<name>.mjs`
**When** plugin-controller path materialization runs
**Then** that project-local command remains byte-for-byte unchanged
**And** it is not redirected into the nmg-sdlc package

### AC5: Missing Packaged Controllers Still Fail Closed

**Given** a plugin-owned controller reference names a controller that is not shipped by the active package
**When** strict packaged-prompt materialization runs
**Then** resolution fails with the existing `controller_unresolved` contract
**And** no consumer-cwd or project-local fallback is consulted

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Represent every packaged nmg-sdlc-owned controller invocation in one canonical host-neutral form: `<plugin-root>/scripts/<name>.mjs` in both shell (`node <plugin-root>/scripts/<name>.mjs`) and quoted-argv (`"<plugin-root>/scripts/<name>.mjs"`) shapes. | Must |
| FR2 | Materialize canonical `<plugin-root>` tokens and recognized foreign-source plugin-controller paths to the active installed package root with current-host path semantics via existing `resolvePluginController`. | Must |
| FR3 | Preserve project-local relative commands and absolute paths that do not identify packaged nmg-sdlc controllers byte-for-byte. | Must |
| FR4 | Reject host-specific absolute controller paths in packaged `workflows/` and generated `commands/` artifacts while retaining `renderAutomatedCommandMarkdown` synchronization. | Must |
| FR5 | Preserve strict missing-controller validation (`reasonCode: controller_unresolved`, `exitCode: 2`) and existing execute, verify, delivery, handoff, and argument behavior. | Must |

## Out of Scope

- Rewriting arbitrary absolute paths that do not identify packaged nmg-sdlc controllers.
- Changing project-local command resolution.
- Changing Herdr orchestration, controller ownership, handoff schemas, or delivery semantics.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #311 | 2026-08-28 | Initial defect report |
