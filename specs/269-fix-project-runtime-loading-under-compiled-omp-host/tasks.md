# Tasks: Fix project runtime loading under compiled OMP host

**Issue**: #269
**Date**: 2026-08-25
**Status**: Approved
**Author**: NMG

---

## T001: Launch project steering with Node

**File(s)**: `src/sdlc-prompt-snippets.mjs`
**Type**: Modify
**Depends**: none

**Acceptance**:

- Invoke `scripts/sdlc-steering.mjs` through the supported `node` command.
- Preserve the current controller arguments, timeout, and `shell: false` execution.
- Keep every invalid child-process and payload outcome mapped to `project_runtime_invalid`.

**Covers**: AC1, AC3

## T002: Add compiled-host regression coverage

**File(s)**: `scripts/__tests__/sdlc-prompt-snippets.test.mjs`
**Type**: Modify
**Depends**: T001

**Acceptance**:

- Set `process.execPath` to a non-Node host path for the regression scenario.
- Render `/sdlc-draft-issue` against valid project steering.
- Assert native plan rendering and project product guidance.
- Restore global process state after the scenario.

**Covers**: AC1, AC2, AC3

## T003: Preserve unknown controller context

**File(s)**: `scripts/plugin-controller-path.mjs`, `src/sdlc-commands.mjs`, `scripts/__tests__/extension-commands.test.mjs`
**Type**: Modify
**Depends**: none

**Acceptance**:

- Keep direct plugin-owned controller materialization fail-closed.
- Materialize available controllers in arbitrary extension context.
- Preserve unknown controller examples unchanged instead of crashing the context hook.
- Cover known, project-local, and unknown controller text.

**Covers**: AC5

## T004: Integrate current steering and live smoke

**File(s)**: `NMG_SDLC_STEERING_PLAN.md`, `steering/manifest.json`, `steering/snippets/project-product.md`, `steering/snippets/project-tech.md`, `steering/snippets/project-structure.md`, `steering/extensions/nmg-sdlc-smoke.mjs`
**Type**: Modify/Create
**Depends**: none

**Acceptance**:

- Synchronize registered snippet bounds and remove stale guidance.
- Document the current source, steering, extension, and contribution layout.
- Register an always-required read-only smoke provider.
- Require valid `/sdlc-status --json` next-action output for a pass.
- Classify unavailable prerequisites as incomplete and completed invalid output as failed.

**Covers**: AC6, AC7

## T005: Record and verify the correction

**File(s)**: `CHANGELOG.md`, `VERSION`, `package.json`, `specs/269-fix-project-runtime-loading-under-compiled-omp-host/verification-report.md`
**Type**: Modify/Create
**Depends**: T001, T002, T003, T004

**Acceptance**:

- `[Unreleased]` records the runtime, context, and steering corrections.
- `VERSION` and `package.json` advance together for the new verification capability.
- Focused and required repository validation outcomes are recorded.
- Actual TUI and required live-smoke exercises cover the changed surfaces.

**Covers**: AC2, AC4, AC5, AC6, AC7
