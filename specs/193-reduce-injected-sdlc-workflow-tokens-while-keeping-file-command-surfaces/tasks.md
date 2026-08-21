# Tasks: Reduce injected SDLC workflow tokens while keeping file-command surfaces

**Issue**: #193
**Date**: 2026-08-21
**Status**: Approved
**Author**: NMG
---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Workflows | 2 | [ ] |
| Audit / steering | 2 | [ ] |
| Ceilings / surface | 2 | [ ] |
| Worker reliability | 2 | [ ] |
| **Total** | 8 | |

---

### T001: Delete Integration sections from all workflow entrypoints

**File(s)**: `workflows/address-pr-comments/WORKFLOW.md`, `workflows/draft-issue/WORKFLOW.md`, `workflows/execute/WORKFLOW.md`, `workflows/migrate-project/WORKFLOW.md`, `workflows/onboard-project/WORKFLOW.md`, `workflows/open-pr/WORKFLOW.md`, `workflows/run-retro/WORKFLOW.md`, `workflows/simplify/WORKFLOW.md`, `workflows/start-issue/WORKFLOW.md`, `workflows/upgrade-project/WORKFLOW.md`, `workflows/verify-code/WORKFLOW.md`, `workflows/write-code/WORKFLOW.md`, `workflows/write-spec/WORKFLOW.md`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Each file no longer contains `## Integration with SDLC Workflow`
- [ ] No other heading or step in these files is rewritten
- [ ] `workflows/start-issue/WORKFLOW.md` still contains `# Start Issue` and the listed reasonCodes
- [ ] `workflows/write-code/WORKFLOW.md` still contains its pre-Integration behavioral steps
- [ ] `workflows/verify-code/WORKFLOW.md` still contains its pre-Integration behavioral steps
- [ ] `workflows/open-pr/WORKFLOW.md` still contains its pre-Integration behavioral steps
- [ ] `workflows/simplify/WORKFLOW.md` still contains `# Simplify`
- [ ] `workflows/address-pr-comments/WORKFLOW.md` still contains `# Address PR Comments`

### T002: Compact status workflow

**File(s)**: `workflows/status/WORKFLOW.md`, `scripts/__tests__/status-skill-contract.test.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Frontmatter `name` / `description` unchanged
- [ ] Body matches the compact text in design.md (Arguments, Execution, Read-Only only)
- [ ] File still contains `Usage: /sdlc-status [--json]`
- [ ] File still contains `git rev-parse --show-toplevel`
- [ ] File still says pass output through unchanged
- [ ] File does not contain `## Integration with SDLC Workflow`, `## JSON Contract`, or `## Recommendations (from evidence)`
- [ ] `scripts/sdlc-status.mjs` is unmodified
- [ ] Status contract test still asserts Usage and forbidden strings; recommendation strings are asserted against `scripts/sdlc-status.mjs`

### T003: Stop requiring Integration in audit and steering

**File(s)**: `scripts/skill-inventory-audit.mjs`, `scripts/__tests__/skill-inventory-audit.test.mjs`, `AGENTS.md`, `steering/tech.md`, `steering/structure.md`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] `validateSkillStructure` Integration check is gone; the empty function and `runCheck` `structureErrors` path are deleted
- [ ] Tests no longer fail a WORKFLOW.md solely for omitting the heading
- [ ] `AGENTS.md` no longer says all workflows include the section
- [ ] `steering/tech.md` Workflow Bundles table and Skill Interface no longer require the section
- [ ] `steering/structure.md` skill template and New public workflow extension point no longer require the section
- [ ] Managed spec-context block in `AGENTS.md` is unchanged

### T004: Add renderedPromptBytes and ceiling tests

**File(s)**: `src/sdlc-workflows.mjs`, `scripts/__tests__/rendered-prompt-bytes.test.mjs`
**Type**: Create | Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] `export function renderedPromptBytes(text)` lives next to `workflowBody` and returns `Buffer.byteLength(String(text), "utf8")`
- [ ] New test hardcodes automated-body and worker-prompt ceilings as measured post-change size + 256
- [ ] Worker extras `# Simplify` and `# Address PR Comments` still asserted
- [ ] Injected automated markdown and `workflowBody` contain no Integration heading

### T005: Regenerate automated file commands and inventory baseline

**File(s)**: `commands/sdlc-execute.md`, `commands/sdlc-status.md`, `commands/sdlc-verify-code.md`, `commands/sdlc-open-pr.md`, `scripts/skill-inventory.baseline.json`
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] Each automated command file equals `renderAutomatedCommandMarkdown(name, skill, description, packageRoot)`
- [ ] `commands/sdlc-write-spec.md` still does not exist
- [ ] `node scripts/skill-inventory-audit.mjs --baseline` then `--check` exits 0
- [ ] `src/extension.ts` still has the comment that automated names must not be `registerCommand`

### T006: Confirm unchanged execute substrate and interactive surface

**File(s)**: `scripts/sdlc-execute.mjs`, `src/extension.ts`, `scripts/__tests__/extension-commands.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `README.md`
**Type**: Modify
**Depends**: T004, T005
**Acceptance**:
- [ ] `STEP_EXTRA_WORKFLOWS` still `{ implement: ['simplify'], deliver: ['address-pr-comments'] }`
- [ ] No `run` subcommand and no `startIssue()` added
- [ ] Existing workerPrompt tests still pass
- [ ] `README.md` still contains the `/sdlc-draft-issue [need]` → `/sdlc-write-spec #N` → `/sdlc-execute [#N …]` diagram
- [ ] Interactive rewrite still uses `/plan` and still fails closed without UI

### T007: Recover stalled execute prompt submission

**File(s)**: `workflows/execute/WORKFLOW.md`, `scripts/__tests__/sdlc-execute.test.mjs`, `commands/sdlc-execute.md`
**Type**: Modify
**Depends**: T005
**Acceptance**:
- [ ] A visibly pasted `agent_prompt_stalled` prompt is submitted with `herdr agent send-keys s<N>-<step> enter`
- [ ] Execute proves the worker reaches `working`, waits for settlement, and then applies ordinary handoff rules
- [ ] Failed recovery keeps the worker pane open and fails the step
- [ ] The prompt is never resent
- [ ] The generated execute file command matches its workflow source

### T008: Resolve installed skill creator

**File(s)**: `workflows/write-code/WORKFLOW.md`, `workflows/write-code/references/plan-mode.md`, `workflows/verify-code/WORKFLOW.md`, `workflows/verify-code/references/autofix-loop.md`, `agents/spec-implementer.md`, `steering/product.md`, `steering/tech.md`, `steering/structure.md`, `scripts/__tests__/skill-creator-resolution.test.mjs`
**Type**: Create | Modify
**Depends**: T003
**Acceptance**:
- [ ] Skill-bundled edits resolve and read `skill://skill-creator`
- [ ] Contracts no longer probe `skills/skill-creator/SKILL.md`
- [ ] A missing repository-local `skills/` directory does not produce `skill_creator_missing`
- [ ] Focused tests cover installed-skill resolution

---


## Dependency Graph

