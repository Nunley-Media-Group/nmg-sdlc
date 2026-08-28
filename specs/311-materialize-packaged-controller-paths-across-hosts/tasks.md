# Tasks: Materialize packaged controller paths across hosts

**Issue**: #311
**Date**: 2026-08-28
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/266-fix-controller-path-rewriting-of-project-commands/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Recognize foreign absolute plugin-controller paths during materialization | [ ] |
| T002 | Restore host-neutral packaged artifacts and reject host-absolute controller paths | [ ] |
| T003 | Add regression coverage for AC1–AC5 | [ ] |

---

### T001: Recognize foreign plugin-controller paths

**File(s)**: `scripts/plugin-controller-path.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `materializeControllerPathsWithPolicy` still rewrites shell and quoted `<plugin-root>/scripts/<name>.mjs`
- [ ] It also rewrites quoted and unquoted absolute paths that match the locked recognition rule in design.md
- [ ] Successful rewrites use existing `resolvePluginController` and emit `node ${JSON.stringify(controller)}` or `JSON.stringify(controller)` as today
- [ ] Missing packaged controllers still throw `controller unresolved: <name>` with `reasonCode: controller_unresolved` and `exitCode: 2` in strict mode
- [ ] `materializeAvailableControllerPaths` still leaves unresolved matches unchanged
- [ ] `node scripts/check-gate.mjs` and absolute paths that do not contain `/nmg-sdlc/scripts/` remain byte-for-byte unchanged
- [ ] No new public export is added

**Notes**: Read `skill://skill-creator` is not required for this scripts file.

### T002: Restore host-neutral packaged artifacts

**File(s)**: `workflows/**/*.md`, `commands/sdlc-execute.md`, `commands/sdlc-status.md`, `commands/sdlc-verify-code.md`, `commands/sdlc-open-pr.md`, `scripts/__tests__/extension-commands.test.mjs`, `scripts/__tests__/start-issue-selection-contract.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Resolve and read `skill://skill-creator` before editing workflow-bundled files
- [ ] Every plugin-owned controller invocation under `workflows/` uses `<plugin-root>/scripts/<name>.mjs` (quoted or unquoted to match surrounding prose)
- [ ] Contributor prefix `/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/` is absent from `workflows/` and `commands/`
- [ ] Each `AUTOMATED_COMMANDS` file equals `renderAutomatedCommandMarkdown(name, skill, description, packageRoot)`
- [ ] The public-surface audit still rejects `node scripts/[A-Za-z0-9._-]+\.mjs` and also rejects absolute `nmg-sdlc/scripts/<name>.mjs` controller invocations in `commands/` and `workflows/`
- [ ] `start-issue-selection-contract.test.mjs` asserts the canonical token, not the contributor-host path
- [ ] Do not rewrite `specs/` or historical reports

### T003: Add materialization regression coverage

**File(s)**: `scripts/__tests__/plugin-controller-path.test.mjs`, `scripts/__tests__/extension-commands.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] POSIX foreign `node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/sdlc-execute.mjs"` materializes to `node ${JSON.stringify(path.join(activeRoot, "scripts", "sdlc-execute.mjs"))}`
- [ ] Windows-separator foreign `node "C:\\Users\\other\\.omp\\plugins\\node_modules\\nmg-sdlc\\scripts\\sdlc-execute.mjs"` materializes the same way on any host (string rewrite; do not require win32)
- [ ] Quoted argv `"<plugin-root>/scripts/c.mjs"` and foreign quoted argv still become `JSON.stringify(controller)`
- [ ] `node scripts/check-gate.mjs` and `node "/opt/app/scripts/check-gate.mjs"` are unchanged
- [ ] Missing `node <plugin-root>/scripts/missing.mjs` and missing foreign `.../nmg-sdlc/scripts/missing.mjs` throw `controller_unresolved` in strict mode
- [ ] Keep the existing extension-commands assertion that runtime text `node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/sdlc-status.mjs" --project .` becomes `node ${statusController} --project .`

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #311 | 2026-08-28 | Initial defect report |
