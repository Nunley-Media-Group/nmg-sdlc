# Tasks: Move write-spec publication lifecycle into code while keeping native plan

**Issue**: #197
**Date**: 2026-08-21
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/5-write-spec-skill/

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Discovery | 2 | [ ] |
| Candidates | 2 | [ ] |
| Workflow | 2 | [ ] |
| Verification | 2 | [ ] |
| **Total** | 8 | |

---

### T001: Add complete discovery subcommand

**File(s)**: `scripts/publish-approved-spec.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `discover --issue N` validates a positive integer and reads issue number/title/body/labels/state
- [ ] Returns classification, slug, targetDir, resolved spec dir, approved flag, and status source
- [ ] Slug algorithm and `issue` fallback match the approved design
- [ ] Bug label selects bug; spike is neutral
- [ ] GitHub failures or malformed/mismatched output fail `issue_unreadable` without mutation

### T002: Reuse shared approval resolver

**File(s)**: `scripts/publish-approved-spec.mjs`, `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Discovery imports and calls `specStatus` / `resolveSpecDir`
- [ ] Existing unique worktree directory becomes targetDir even when title slug changed
- [ ] Approved branch-only package source is reported
- [ ] Ambiguous directory or branch status fails closed
- [ ] No second approval or four-file validation implementation is added

### T003: Add sorted candidates subcommand

**File(s)**: `scripts/publish-approved-spec.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] `candidates` accepts repeated `--published N` and deduplicates them
- [ ] Reads open issues with the exact 100-item GitHub query
- [ ] Drops published and shared-status Approved issues
- [ ] Returns all remaining number/title rows sorted numerically
- [ ] Does not generate ask labels or truncate to three

### T004: Cover lifecycle helper read paths

**File(s)**: `scripts/__tests__/publish-approved-spec.test.mjs`
**Type**: Modify
**Depends**: T001-T003
**Acceptance**:
- [ ] Tests cover discovery issue failures, slug fallback, classification, spike, existing dir, branch approval, and ambiguity
- [ ] Tests cover candidates published filtering, dedupe, sorting, worktree/local/remote approval, malformed GitHub output, and ambiguity
- [ ] Read-only commands record no git checkout, commit, push, PR create, or merge
- [ ] Existing publication tests remain intact

### T005: Compact write-spec discovery and continue filtering

**File(s)**: `workflows/write-spec/WORKFLOW.md`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- [ ] Discovery invokes helper and consumes complete JSON
- [ ] Continue loop invokes candidates with every in-memory published number
- [ ] Workflow shows at most three returned candidates plus Finished
- [ ] Continue ask remains outside the interview budget
- [ ] Deterministic glob/branch-ref/approval filtering prose is removed

### T006: Preserve native plan and publish reference

**File(s)**: `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md`
**Type**: Modify
**Depends**: T005
**Acceptance**:
- [ ] Native plan still contains full requirements, design, tasks, and Gherkin text
- [ ] First issue alone calls `xd://propose`
- [ ] Post-approval sequence remains prepare, write Approved package, commit-push, merge
- [ ] Reference documents six helper subcommands and JSON/failure contracts
- [ ] Finish text and default-branch final state remain exact

### T007: Preserve TUI-only public surface

**File(s)**: `src/extension.ts`, command/workflow surface tests
**Type**: Modify
**Depends**: T005
**Acceptance**:
- [ ] TUI `/sdlc-write-spec` still rewrites to native `/plan`
- [ ] Print/RPC still emits `Run /sdlc-write-spec in the TUI.`
- [ ] No `commands/sdlc-write-spec.md` exists
- [ ] No automated or interactive extension handler bypasses native planning

### T008: Run focused lifecycle regression

**File(s)**: lifecycle, execute-status, workflow, command-rendering, extension tests
**Type**: Modify
**Depends**: T004-T007
**Acceptance**:
- [ ] Publication mutation tests pass unchanged
- [ ] Shared `specStatus` branch/worktree tests pass
- [ ] Workflow contract tests prove full-text plan and continue ask behavior
- [ ] Public-surface tests prove no generated write-spec command
- [ ] Focused Jest suite exits 0

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #197 | 2026-08-21 | Initial feature spec |
