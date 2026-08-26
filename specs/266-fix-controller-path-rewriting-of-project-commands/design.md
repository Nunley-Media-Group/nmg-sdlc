# Design: Fix controller path rewriting of project commands

**Issue**: #266
**Date**: 2026-08-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/252-resolve-plugin-controllers-independently-of-target-project-cwd/

---

## Overview

Narrow `materializeControllerPaths` to the explicit ownership token introduced by #252. The helper will continue to replace shell and quoted-argv forms of `<plugin-root>/scripts/<name>.mjs`, resolving each named file through `resolvePluginController`. It will stop matching unqualified `node scripts/<name>.mjs`, because such text belongs to the consumer project unless explicitly marked otherwise.

No new resolver, fallback, or compatibility alias is introduced. All current nmg-sdlc command and workflow dispatch surfaces already use `<plugin-root>`, and the existing surface audit prevents a regression to cwd-relative plugin dispatch.

The separate nmg-pi bootstrap fix adds `--force` to its deterministic pinned nmg-sdlc install plan. OMP 18 documents and implements that path for replacing an existing pinned Git source without Bun's dependency-loop failure.

## Steering Alignment

- `steering/manifest.json` and registered technical guidance: retain Node ESM, explicit path ownership, fail-closed controller validation, and focused behavioral tests.
- Registered structure guidance: resolver behavior remains in `scripts/plugin-controller-path.mjs`; tests remain in `scripts/__tests__/`.
- Product guidance: installed commands load from unrelated consumer projects without requiring plugin knowledge of project-local scripts.

## Runtime Flow

```text
runtime message
  ├─ node <plugin-root>/scripts/sdlc-execute.mjs
  │    → validate plugin root and controller
  │    → node "/absolute/plugin/scripts/sdlc-execute.mjs"
  └─ node scripts/check-gate.mjs
       → unchanged project text
```

## Changes

### `scripts/plugin-controller-path.mjs`

Remove the second replacement pass that matches `node scripts/*.mjs`. Keep the quoted placeholder replacement and explicit shell placeholder replacement. Both call `resolvePluginController`, preserving missing-controller failures.

### `scripts/__tests__/plugin-controller-path.test.mjs`

Replace the legacy-dispatch expectation with a project-command preservation assertion. Keep coverage for shell placeholders, quoted argv placeholders, spaces in plugin paths, and missing explicit controllers.

### nmg-pi `src/bootstrap-plan.ts`

Add `--force` to only `planOmpSdlcEnsure`. Do not alter nmg-pi's own plugin install plan or local-link behavior.

### nmg-pi `test/bootstrap-plan.test.ts`

Update exact command-plan expectations and assert the nmg-sdlc plan carries `--force` while the unrelated nmg-pi plan does not inherit the change.

## Failure Behavior

An explicit plugin placeholder for a missing packaged controller still throws `controller unresolved: <name>` with `reasonCode: controller_unresolved` and exit code 2. Unqualified project script text performs no package lookup during materialization.

## Verification

- Focused Jest coverage for `plugin-controller-path.test.mjs` and `extension-commands.test.mjs`.
- Installed-topology smoke through OMP plugin force install followed by extension loading from a disposable consumer project.
- Focused nmg-pi bootstrap-plan test.
- Each repository's full required verification before PR delivery.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #266 | 2026-08-25 | Initial bug-fix design |
