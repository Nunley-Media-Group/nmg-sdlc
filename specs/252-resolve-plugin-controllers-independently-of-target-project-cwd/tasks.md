# Tasks: Resolve plugin controllers independently of target project cwd

**Issue**: #252
**Date**: 2026-08-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/
---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Helper | 2 | [ ] |
| Surfaces | 3 | [ ] |
| Verification | 3 | [ ] |
| **Total** | 8 | |

---

### T001: Add the shared plugin-controller path helper

**File(s)**: `scripts/plugin-controller-path.mjs`
**Type**: Create
**Depends**: None
**Acceptance**:
- [ ] Exports `isCliEntry`, `resolvePluginRoot`, `resolvePluginController`, and `materializeControllerPaths` with the signatures in design.md
- [ ] Env root wins only when absolute, `package.json` name is `nmg-sdlc`, and `scripts/<name>.mjs` exists
- [ ] `importMetaUrl` fallback uses the `scripts/` or `src/` parent and the same checks
- [ ] No branch joins `process.cwd()` to `scripts/`
- [ ] `materializeControllerPaths` rewrites both `node <plugin-root>/scripts/<name>.mjs` and `node scripts/<name>.mjs` to `node` plus `JSON.stringify(absolutePath)`

### T002: Switch applicable controllers to `isCliEntry`

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/sdlc-status.mjs`, `scripts/start-issue.mjs`, `scripts/sdlc-apply-review.mjs`, `scripts/sdlc-review-main.mjs`, `scripts/publish-approved-spec.mjs`, `scripts/spec-created-label.mjs`, `scripts/sdlc-upgrade.mjs`, `scripts/verification-readiness.mjs`, `scripts/exercise-omp.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Each listed file calls `isCliEntry(import.meta.url)` instead of an inline argv/import.meta string compare
- [ ] Importing the module still does not invoke `runCli` / `main`
- [ ] Existing CLI argv and exit-code contracts stay the same

### T003: Publish plugin root and materialize runtime prompts

**File(s)**: `src/extension.ts`, `src/sdlc-commands.mjs`, `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] `nmgSdlc` sets `process.env.NMG_SDLC_PLUGIN_ROOT` to `packageRoot` on load
- [ ] `rewriteInteractiveInput` materializes controller paths after `workflowBody`
- [ ] `workerPrompt` materializes each inlined workflow body with `packageRoot`
- [ ] `workflowBody` and `renderAutomatedCommandMarkdown` stay portable (no host-absolute paths)
- [ ] Automated `/sdlc-*` names remain unregistered

### T004: Rewrite public and worker invocation markdown

**File(s)**: `workflows/execute/WORKFLOW.md`, `workflows/execute/references/selection.md`, `workflows/status/WORKFLOW.md`, `workflows/start-issue/WORKFLOW.md`, `workflows/apply-review/WORKFLOW.md`, `workflows/review-main/WORKFLOW.md`, `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md`, `workflows/onboard-project/WORKFLOW.md`, `workflows/onboard-project/references/brownfield.md`, `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/v3-detectors.md`, `workflows/verify-code/WORKFLOW.md`, `workflows/verify-code/references/exercise-testing.md`, `workflows/verify-code/checklists/report-template.md`, generated `commands/sdlc-execute.md`, `commands/sdlc-status.md`, `commands/sdlc-verify-code.md`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- [ ] Read `skill://skill-creator` before any workflow-bundle edit
- [ ] Every listed spawn uses `node <plugin-root>/scripts/<name>.mjs` plus existing argv
- [ ] Status no longer tells the model to walk two directories above `WORKFLOW.md`
- [ ] No dispatch `node scripts/<name>.mjs` remains under `commands/` or `workflows/`
- [ ] Generated automated commands stay byte-identical to `renderAutomatedCommandMarkdown`

### T005: Update spawn-string contract tests and prompt ceilings

**File(s)**: `scripts/__tests__/start-issue-selection-contract.test.mjs`, `scripts/__tests__/extension-commands.test.mjs`, `scripts/__tests__/rendered-prompt-bytes.test.mjs`, other tests that assert the old `node scripts/` dispatch string
**Type**: Modify
**Depends**: T004
**Acceptance**:
- [ ] Start-issue contract expects `node <plugin-root>/scripts/start-issue.mjs --issue N`
- [ ] Command synchronization still passes byte-for-byte
- [ ] Any ceiling exceeded by the new token is set to measured UTF-8 bytes + 256; untouched ceilings stay
- [ ] Existing execute/start/review/apply-review behavioral tests remain green without handoff or worker-name changes

### T006: Add path-resolution and link-topology tests

**File(s)**: `scripts/__tests__/plugin-controller-path.test.mjs`
**Type**: Create
**Depends**: T001, T002
**Acceptance**:
- [ ] Missing, relative, and non-nmg-sdlc env values fail with `controller_unresolved` and never read consumer `scripts/`
- [ ] A disposable consumer cwd that contains a decoy `scripts/sdlc-execute.mjs` is not used
- [ ] Copied install: spawn via the copied path, cwd is the consumer, CLI runs once
- [ ] Unix symlink install: same assertion, `describe.skip` on `win32`
- [ ] Windows junction install: same assertion, `describe.skip` off `win32`
- [ ] `import(pathToFileURL(controller))` does not run the CLI
- [ ] `materializeControllerPaths` quotes a plugin root that contains a space

### T007: Run focused automated verification

**File(s)**: helper, execute, extension-command, start-issue, and rendered-prompt tests
**Type**: Verify
**Depends**: T005, T006
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/plugin-controller-path.test.mjs __tests__/extension-commands.test.mjs __tests__/start-issue-selection-contract.test.mjs __tests__/rendered-prompt-bytes.test.mjs` exits 0
- [ ] `cd scripts && npm test -- --runInBand` exits 0
- [ ] `node scripts/verify-plugin-surface.mjs --root . --label repository` exits 0

### T008: Prove installed OMP dispatch from a disposable project

**File(s)**: `specs/252-resolve-plugin-controllers-independently-of-target-project-cwd/verification-report.md`
**Type**: Create
**Depends**: T007
**Acceptance**:
- [ ] Disposable target project has no `scripts/` and no project-local `.omp` command override
- [ ] Packaged candidate is enabled through OMP's supported plugin install (copied package or documented `file:` link), not only `--plugin-dir` plus `--add-dir`
- [ ] Invoking `/sdlc-execute #N` or `/sdlc-status --json` from that project reaches the plugin controller without `MODULE_NOT_FOUND`
- [ ] Observed `process.cwd()` for the controller is the disposable project
- [ ] Empty and explicit execute paths share that same controller file
- [ ] Main-pane non-mutation and sibling-worker ownership are unchanged if execute proceeds past dispatch

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [ ] Each task has single responsibility
- [ ] Dependencies are correctly mapped
- [ ] Acceptance criteria are verifiable
- [ ] File paths match `steering/structure.md`
- [ ] Test tasks cover AC1–AC8
- [ ] No circular dependencies
