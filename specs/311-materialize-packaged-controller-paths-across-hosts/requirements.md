# Requirements: Materialize packaged controller paths across hosts

**Issue**: #311
**Date**: 2026-08-28
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/266-fix-controller-path-rewriting-of-project-commands/

---

## User Story

**As a** developer running a packaged nmg-sdlc command on a different host from the package author
**I want** every packaged plugin-owned controller path materialized from the active installed package
**So that** execute, verify, delivery, interactive, and worker prompts start the correct controller on Windows, macOS, and Linux

---

## Background

Issue #252 introduced the canonical `<plugin-root>/scripts/<name>.mjs` representation and runtime materialization so plugin controllers do not resolve from the consumer cwd. Issue #266 narrowed that materialization to explicit plugin ownership so project-local commands remain unchanged, and issue #269 retained strict failure for owned prompts while preserving unresolved examples in arbitrary extension context.

Packaged workflow sources and their synchronized `commands/*.md` artifacts currently contain absolute controller paths from the contributor host. `materializeControllerPaths` and `materializeAvailableControllerPaths` recognize the canonical token but not a foreign absolute path ending in the nmg-sdlc package's `scripts/` directory. The foreign path therefore survives on another OS and Node fails with `MODULE_NOT_FOUND` before the controller starts.

This change restores the canonical host-neutral source form, recognizes legacy/foreign absolute nmg-sdlc controller operands at runtime, and preserves every existing controller argument, failure, cwd, orchestration, handoff, and delivery contract.

**Version bump**: minor

---

## Acceptance Criteria

### AC1: Execute Uses the Installed Windows Controller

**Given** nmg-sdlc is installed on Windows and a packaged execute prompt contains a foreign POSIX path to the nmg-sdlc execute controller
**When** the user runs `/sdlc-execute 19`
**Then** Node invokes `scripts/sdlc-execute.mjs` beneath the active installed package root
**And** the emitted invocation contains no foreign contributor-host path
**And** controller startup does not fail with `MODULE_NOT_FOUND`

### AC2: Every Packaged Controller Uses the Active Package Root

**Given** any packaged execute, verify, delivery, interactive, or worker prompt invokes an nmg-sdlc-owned controller
**When** the prompt is materialized on Windows, macOS, or Linux
**Then** the invocation uses the corresponding controller beneath the active installed nmg-sdlc package root
**And** its existing arguments and workflow behavior are preserved

### AC3: Packaged Artifacts Stay Host-Neutral

**Given** packaged workflow and file-command artifacts are generated or validated
**When** the repository contract checks run
**Then** every plugin-owned controller invocation is stored in the canonical host-neutral representation
**And** no contributor-host absolute controller path is accepted in generated workflow or command artifacts
**And** generated command artifacts remain synchronized with their workflow sources

### AC4: Project-Local Commands Remain Unchanged

**Given** prompt text contains a project-local command such as `node scripts/check-gate.mjs` or a project-owned absolute script path
**When** plugin-controller path materialization runs
**Then** that project-local command remains byte-for-byte unchanged
**And** it is not redirected into the nmg-sdlc package

### AC5: Missing Packaged Controllers Still Fail Closed

**Given** a plugin-owned controller reference names a controller that is not shipped by the active package
**When** strict packaged-prompt materialization runs
**Then** resolution fails with the existing `controller_unresolved` contract
**And** no consumer-cwd or project-local fallback is consulted

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Represent every packaged nmg-sdlc-owned controller invocation in the exact canonical form `<plugin-root>/scripts/<name>.mjs`. | Must | Keep existing shell and quoted-argv encodings. |
| FR2 | Materialize canonical and recognized foreign-source plugin-controller paths to the active installed package root with current-host path semantics. | Must | Recognize POSIX and Windows absolute syntax independently of the current host. |
| FR3 | Preserve project-local relative and absolute commands byte-for-byte. | Must | Never claim a path that does not identify the `nmg-sdlc/scripts/<name>.mjs` ownership suffix. |
| FR4 | Reject host-specific absolute controller paths in packaged workflow and generated command artifacts while retaining workflow/command synchronization. | Must | Audit only active packaged surfaces, not historical specs or recorded verification evidence. |
| FR5 | Preserve strict missing-controller validation and existing execute, verify, delivery, handoff, and argument behavior. | Must | Keep `controller_unresolved`, exit code 2, and no cwd fallback. |

---

## Out of Scope

- Rewriting arbitrary absolute paths that do not identify packaged nmg-sdlc controllers.
- Changing project-local command resolution.
- Changing Herdr orchestration, controller ownership, handoff schemas, or delivery semantics.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #311 | 2026-08-28 | Initial feature spec |
