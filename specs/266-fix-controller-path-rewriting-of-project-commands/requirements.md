# Requirements: Fix controller path rewriting of project commands

**Issue**: #266
**Date**: 2026-08-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/252-resolve-plugin-controllers-independently-of-target-project-cwd/

---

## User Story

**As a** developer loading nmg-sdlc in a project with its own scripts
**I want** only explicit plugin-controller placeholders rewritten
**So that** project commands in prompts and verification evidence cannot break extension loading

## Background

Issue #252 introduced `materializeControllerPaths` to make packaged controller dispatch independent of the consumer cwd. Its compatibility branch also rewrites every unqualified `node scripts/*.mjs` occurrence. The extension applies this function to all runtime messages, so ordinary project evidence such as `node scripts/check-gate.mjs` is treated as a required plugin controller and throws `controller unresolved`.

The clean contract is explicit ownership: nmg-sdlc controller dispatch uses `<plugin-root>/scripts/<name>.mjs`; project-local commands remain untouched.

**Version bump**: patch

---

## Acceptance Criteria

### AC1: Project-local commands remain project-local

**Given** runtime text containing `node scripts/check-gate.mjs`
**When** controller paths are materialized
**Then** the text remains unchanged
**And** materialization does not require `check-gate.mjs` in the plugin package

### AC2: Explicit plugin placeholders still resolve

**Given** runtime text containing `node <plugin-root>/scripts/sdlc-execute.mjs`
**When** controller paths are materialized for an installed package
**Then** the placeholder becomes the JSON-quoted absolute packaged controller path

### AC3: Missing packaged controllers fail closed

**Given** an explicit `<plugin-root>` controller placeholder names a missing file
**When** controller paths are materialized
**Then** resolution fails with `controller_unresolved`
**And** no project-local fallback is consulted

### AC4: Installed extension loading remains safe

**Given** session context contains project-local script commands
**When** the installed extension processes runtime messages
**Then** extension loading and context materialization do not throw because those project scripts are absent from the plugin package

### AC5: Bootstrap may reinstall an existing pinned source

**Given** bootstrap installs the remote nmg-sdlc commit over an existing Git plugin entry
**When** it invokes OMP 18's plugin installer
**Then** the invocation uses the supported force-reinstall path
**And** Bun does not reject the unchanged Git source as a dependency loop

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Rewrite only explicit `<plugin-root>/scripts/*.mjs` controller references. | Must |
| FR2 | Preserve project-local `node scripts/*.mjs` text byte-for-byte. | Must |
| FR3 | Keep explicit missing-controller validation and installed delivery-controller preflight. | Must |
| FR4 | Cover both explicit plugin placeholders and unqualified project commands in regression tests. | Must |

## Out of Scope

- Restoring cwd-relative plugin-controller dispatch.
- Adding project scripts to the nmg-sdlc package.
- Weakening `resolvePluginController` validation.
- Changing Herdr orchestration, handoffs, or delivery behavior.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #266 | 2026-08-25 | Initial bug-fix spec |
