# Tasks: Prompt-snippet registry for command and worker composition

**Issue**: #213
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/193-reduce-injected-sdlc-workflow-tokens-while-keeping-file-command-surfaces/

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Registry | 2 | [ ] |
| Wiring | 2 | [ ] |
| Tests | 3 | [ ] |
| **Total** | 7 | |

---

### T001: Add prompt-snippet registry module

**File(s)**: `src/sdlc-prompt-snippets.mjs`
**Type**: Create
**Depends**: None
**Acceptance**:
- [ ] Exports `ALLOWED_SLOTS`, `COMMAND_CONSUMERS`, `WORKER_CONSUMERS`, `ALLOWED_CONSUMERS`, `createPromptSnippetRegistry`, `registerPromptSnippet`, `renderPrompt`, `writePromptProvenance`, `pluginPromptFragments`, `defaultPromptRegistry`
- [ ] Does not import `src/sdlc-commands.mjs` or `scripts/sdlc-execute.mjs`
- [ ] Throws exact reasonCode strings listed in design
- [ ] File sources resolve only under `packageRoot/workflows`

### T002: Ship the built-in plugin catalog

**File(s)**: `src/sdlc-prompt-snippets.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] `pluginPromptFragments()` contains exactly the 16 ids in the design table
- [ ] Header body is the exact eight-element `join('\\n')` string
- [ ] File-backed `byteBound` values are measured loaded size + 256; header is 512
- [ ] `defaultPromptRegistry` registers all of them and does not scan project trees

### T003: Compose interactive and automated commands through the registry

**File(s)**: `src/sdlc-commands.mjs`, `src/extension.ts`, `scripts/__tests__/extension-commands.test.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] `rewriteInteractiveInput` uses `renderPrompt` + existing `withArguments` and `/plan\\n\\n` prefix
- [ ] `renderAutomatedCommandMarkdown` uses `renderPrompt` and no longer special-cases `selection.md`
- [ ] `commands/sdlc-*.md` stay byte-identical to the renderer
- [ ] Extension `registerCommand` handler sends `rewriteInteractiveInput(...).text`
- [ ] Optional `provenanceRoot` writes `.omp/sdlc/prompt-provenance/<consumer>.json`

### T004: Compose workerPrompt through the registry

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] `workerPrompt` renders `worker:${step}` with `issue`, `step`, `handoffPath` vars
- [ ] Does not concatenate `workflowBody` or `STEP_EXTRA_WORKFLOWS`
- [ ] `STEP_EXTRA_WORKFLOWS` remains `{ deliver: ['address-pr-comments'] }`
- [ ] `runExecute` agentPrompt, `hasPastedWorkerPrompt`, and the `worker-prompt` CLI all call `workerPrompt({ step, issue, cwd })`
- [ ] Issue-42 prompts keep current headings and stay within existing UTF-8 ceilings
- [ ] Production `workflowBody(` grep outside the adapter/registry/tests is empty

### T005: Cover registry contracts

**File(s)**: `scripts/__tests__/sdlc-prompt-snippets.test.mjs`
**Type**: Create
**Depends**: T001, T002
**Acceptance**:
- [ ] Consumer lists match command tables and `VALID_STEPS`
- [ ] Order + provenance + every named fail-closed reasonCode
- [ ] Default registry inserts no project-directory snippet
- [ ] Provenance sidecar write under a temp root

### T006: Keep existing composition tests green

**File(s)**: `scripts/__tests__/sdlc-commands.test.mjs`, `scripts/__tests__/rendered-prompt-bytes.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/simplify-contract.test.mjs`
**Type**: Modify
**Depends**: T003, T004, T005
**Acceptance**:
- [ ] Interactive rewrite tests pass `provenanceRoot` temp dirs and still assert `/plan`, `# Write Spec`, `$ARGUMENTS`
- [ ] Existing workerPrompt heading assertions still pass
- [ ] Ceilings in `rendered-prompt-bytes.test.mjs` are unchanged and pass

### T007: Run full suite and no-loss smoke

**File(s)**: tests listed in Verification
**Type**: Modify
**Depends**: T006
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand` exits 0
- [ ] `node scripts/verify-plugin-surface.mjs --root . --label repository` exits 0
- [ ] Smoke commands in Verification prove every interactive rewrite, automated file command, and worker-prompt step still match today’s text
- [ ] `/sdlc-status` smoke still reaches `scripts/sdlc-status.mjs`; headless `/sdlc-write-spec` still prints `Run /sdlc-write-spec in the TUI.\\n`

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #213 | 2026-08-23 | Initial feature spec |
