# Design: Fix project runtime loading under compiled OMP host

**Issue**: #269
**Date**: 2026-08-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/213-add-a-prompt-snippet-registry-for-command-and-worker-composition/

---

## Overview

Use the package-supported `node` command for project prompt-fragment loading because `process.execPath` identifies the compiled OMP host in the distributed extension. Separately, distinguish strict plugin-owned prompt materialization from best-effort arbitrary context materialization: known packaged controllers resolve, while unknown controller examples remain data and cannot crash the extension context hook.

Retain strict direct resolution and project-runtime validation. Missing Node, controller failure, malformed project fragments, and plugin-owned missing controller paths still fail closed.

## Steering Alignment

- `steering/manifest.json` and registered technical guidance: use Node.js ESM controllers, remain cross-platform, and retain fail-closed runtime validation.
- Registered structure guidance: prompt composition remains in `src/sdlc-prompt-snippets.mjs`; focused coverage remains in `scripts/__tests__/sdlc-prompt-snippets.test.mjs`.
- Product guidance: interactive issue drafting works in the distributed OMP host and includes project-owned product context.
- Updated project steering removes stale guidance, synchronizes snippet bounds, and registers a read-only live consumer smoke as a required verification provider.

## Runtime Flow

```text
/sdlc-draft-issue
  → rewriteInteractiveInput
  → defaultPromptRegistry(projectRoot)
  → spawn node scripts/sdlc-steering.mjs prompt-fragments --project <root>
  → validate exit + JSON payload
  → register project fragments
  → render native /plan prompt
```

## Changes

### `src/sdlc-prompt-snippets.mjs`

Replace `spawnSync(process.execPath, ...)` with `spawnSync("node", ...)`. Keep argument-array execution with `shell: false`, the existing timeout, and all payload checks.

### `scripts/__tests__/sdlc-prompt-snippets.test.mjs`

Add a regression that temporarily sets `process.execPath` to a non-Node executable path, renders `/sdlc-draft-issue` for a valid project steering fixture, and proves project guidance is present. Restore the original value in `finally` so the suite remains isolated.

### `scripts/plugin-controller-path.mjs` and `src/sdlc-commands.mjs`

Keep `materializeControllerPaths` strict for plugin-owned prompt generation. Add `materializeAvailableControllerPaths` for the extension context hook; it rewrites controllers that exist in the package and preserves unresolved placeholder text byte-for-byte.

### `scripts/__tests__/extension-commands.test.mjs`

Prove known packaged controller placeholders still resolve in runtime context, project commands remain local, and an unknown `missing.mjs` example remains unchanged. Existing direct resolver tests retain fail-closed missing-controller coverage.

### `steering/manifest.json`, `steering/snippets/`, and `steering/extensions/nmg-sdlc-smoke.mjs`

Accept the concurrently approved steering update: synchronize snippet byte bounds, remove stale version and temporary authoring guidance, document the current runtime layout, and register `repository.nmg-sdlc-smoke` as an always-required provider. The provider clones the public smoke repository into a temporary directory, exercises `/sdlc-status --json` with this checkout, validates `/sdlc-` next-action output, and always removes the clone. It never mutates the smoke repository.

### `CHANGELOG.md`

Record the compiled-host runtime correction, safe context materialization, and required live consumer smoke under `[Unreleased]`.

## Failure Behavior

The explicit `node` lookup is required. Spawn errors, non-zero status, malformed output, and invalid fragments still throw `project_runtime_invalid`. Strict `materializeControllerPaths` still throws `controller_unresolved`; only arbitrary context materialization preserves unknown examples. Smoke clone or launch unavailability is incomplete, while completed invalid status output fails.

## Verification

- Focused Jest coverage for prompt snippets, extension command context, and strict controller resolution.
- Full repository tests, plugin-surface validation, current-spec validation, and managed steering validation.
- Actual OMP TUI exercise of `/sdlc-draft-issue` from a disposable project.
- Required live smoke provider exercise through `sdlc-verify-steering.mjs`.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #269 | 2026-08-25 | Initial bug-fix design |
