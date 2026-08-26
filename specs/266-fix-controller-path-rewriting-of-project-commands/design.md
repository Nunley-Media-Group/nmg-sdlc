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

The separate nmg-pi bootstrap fix reads OMP's plugin manifest and compares the configured official Git source revision with remote `HEAD`. Exact matches skip the installer, avoiding Bun's same-source dependency loop; changed revisions use OMP's `--force` replacement path.

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

### nmg-pi `src/bootstrap-plan.ts` and `scripts/bootstrap.mjs`

Recognize OMP's canonical `github:owner/repo#sha` form for the configured SSH source. `planOmpSdlcEnsure` returns no command when that full revision matches remote `HEAD`; bootstrap prints the skip. Different or unreadable revisions retain `--force` installation. Do not alter nmg-pi's own plugin install plan or local-link behavior.

### nmg-pi `test/bootstrap-plan.test.ts`

Cover canonical-source exact matches, same-ref no-op planning, changed-ref forced replacement, and unchanged unrelated nmg-pi planning.

## Failure Behavior

An explicit plugin placeholder for a missing packaged controller still throws `controller unresolved: <name>` with `reasonCode: controller_unresolved` and exit code 2. Unqualified project script text performs no package lookup during materialization.

## Verification

- Focused Jest coverage for `plugin-controller-path.test.mjs` and `extension-commands.test.mjs`.
- Live current-manifest/current-remote-HEAD planning proof returns no install command, plus focused nmg-pi bootstrap-plan coverage.
- Focused nmg-pi bootstrap-plan test.
- Each repository's full required verification before PR delivery.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #266 | 2026-08-25 | Initial bug-fix design |
