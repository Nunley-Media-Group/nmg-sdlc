# Requirements: Reduce injected SDLC workflow tokens while keeping file-command surfaces

**Issue**: #193
**Date**: 2026-08-21
**Status**: Approved
**Author**: NMG

---

## User Story

**As a** nmg-sdlc plugin author
**I want** injected `/sdlc-*` workflow text to stop carrying documentation and duplicated policy that code already owns
**So that** every automated and interactive command spends fewer tokens before any real work starts

---

## Background

`workflowBody()` in `src/sdlc-workflows.mjs` only strips YAML frontmatter, so every `## Integration with SDLC Workflow` section is copied into `commands/*.md` via `renderAutomatedCommandMarkdown` and into Herdr worker prompts via `workerPrompt`. `scripts/skill-inventory-audit.mjs` `validateSkillStructure` and `AGENTS.md` currently require that heading. `/sdlc-status` already delegates to `scripts/sdlc-status.mjs`, but `workflows/status/WORKFLOW.md` restates JSON, recommendation, and read-only policy the script implements.

Public command behavior is unchanged. Prompts and workflow prose may shrink only when the same observable outcomes remain in code, README, or scripts. If a controller cannot yet reproduce a current branch, keep that branch in the compact workflow instead of dropping it.

---

## Acceptance Criteria

### AC1: Integration sections leave workflow files and injected prompts

**Given** `workflows/*/WORKFLOW.md` after this change
**When** `workflowBody()` or `renderAutomatedCommandMarkdown()` produces injected text
**Then** neither the workflow files nor the injected text contain `## Integration with SDLC Workflow`
**And** `commands/sdlc-*.md` stay byte-identical to `renderAutomatedCommandMarkdown` for `AUTOMATED_COMMANDS`
**And** `README.md` still contains the primary user journey diagram

### AC2: Audit no longer requires Integration sections

**Given** `validateSkillStructure` / skill-inventory audit
**When** it runs on the repo
**Then** missing Integration sections are not errors
**And** `AGENTS.md` no longer requires the section
**And** tests no longer fail a workflow solely for omitting that heading

### AC3: Status command output is unchanged

**Given** `/sdlc-status` or `/sdlc-status --json` against the same project
**When** the file command expands and the model runs the documented script
**Then** `node scripts/sdlc-status.mjs --project <root> [--json]` is still the only status implementation
**And** stdout, exit codes, `--json` shape, Depends-on ready/blocked reporting, and recommended next commands are produced by that script, not dropped from the product
**And** the compact workflow still documents `Usage: /sdlc-status [--json]`, still rejects any other argument with that usage line, still resolves `git rev-parse --show-toplevel`, and still says pass script stdout through unchanged

### AC4: Rendered-byte ceilings exist without shrinking workers

**Given** the post-change `workflowBody` and `workerPrompt` byte lengths
**When** contract tests run
**Then** each automated command body and each `workerPrompt` step (`start`, `implement`, `verify`, `deliver`) has a `toBeLessThanOrEqual` ceiling equal to the measured post-change size plus 256 bytes
**And** `workerPrompt({ step: 'deliver', issue: 42 })` still contains `# Address PR Comments`
**And** `workerPrompt({ step: 'implement', issue: 42 })` still contains `# Simplify`
**And** start/write-code/verify-code/open-pr behavioral steps other than the deleted Integration section remain in those workflows

### AC5: File-command surface and interactive surface unchanged

**Given** print or RPC execution of an automated `/sdlc-*`
**When** this issue lands
**Then** `src/extension.ts` still does not `registerCommand` for `AUTOMATED_COMMANDS`
**And** there is still no `commands/sdlc-write-spec.md`
**And** interactive commands still rewrite to native `/plan` in the TUI and still fail closed without UI

### AC6: Stalled pasted prompts recover without duplicate submission

**Given** `herdr agent prompt s<N>-<step> <exact prompt> --wait` returns `agent_prompt_stalled`
**When** the exact prompt is visibly pasted but Enter was not submitted
**Then** execute sends one logical `enter`, proves the worker reaches `working`, and waits for a settled state
**And** execute applies the ordinary handoff close-or-keep rules after settlement
**And** execute keeps the pane and fails only when recovery cannot start or settle correctly

### AC7: Installed skill creator resolves without a repository-local copy

**Given** implementation or verification must edit a skill-bundled path
**When** the repository has no `skills/skill-creator/SKILL.md`
**Then** the worker resolves and reads `skill://skill-creator`
**And** absence of the repository-local directory does not produce `skill_creator_missing`

### AC8: Draft reference pointers satisfy exercise grammar

**Given** the two existing shared-reference pointers at the start of `workflows/draft-issue/WORKFLOW.md`
**When** the workflow is validated by the deterministic skill exercise
**Then** each pointer uses the required `Read \`path\` when ...` grammar
**And** both referenced paths and their existing behavioral meaning remain unchanged
**And** `node scripts/skill-exercise-runner.mjs --skill draft-issue` exits 0

### AC9: Exercise and inventory verification remain accurate

**Given** a compact workflow intentionally has no reference pointers
**When** deterministic checks run
**Then** zero pointers pass for that compact workflow
**And** `draft-issue` still requires at least one conforming pointer
**And** skill-inventory metadata failures no longer claim that removed structure validation ran

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Delete `## Integration with SDLC Workflow` sections from all `workflows/*/WORKFLOW.md` files, including `migrate-project`. | Must | Heading plus body through next same-or-higher heading or EOF. Do not rewrite remaining workflow steps except the exact T009 pointer normalization authorized by AC8. |
| FR2 | Update `AGENTS.md`, `steering/tech.md`, `steering/structure.md`, `scripts/skill-inventory-audit.mjs`, and `scripts/__tests__/skill-inventory-audit.test.mjs` so the section is not required. | Must | Remove the Integration check from `validateSkillStructure`. If that leaves the function as `return []` only, delete the function and its `runCheck` `structureErrors` path. |
| FR3 | Compact `workflows/status/WORKFLOW.md` to argument validation + script invocation + pass-through. Do not change `scripts/sdlc-status.mjs` recommendation or JSON behavior. | Must | Keep Usage line, non-zero reject of other args, `git rev-parse --show-toplevel`, and pass-through. |
| FR4 | Add exported `renderedPromptBytes` next to `workflowBody` (no equivalent exists) and tests with per-surface ceilings. | Must | UTF-8 `Buffer.byteLength`. Ceilings = measured post-change size + 256. |
| FR5 | Do not add `run` to `sdlc-execute.mjs`. Do not extract `startIssue()`. Do not change `STEP_EXTRA_WORKFLOWS`. | Must | `implement: ['simplify']`, `deliver: ['address-pr-comments']` stay. |
| FR6 | No reduction of function: every current public command, handoff reasonCode, and script CLI still exists and still accepts the same inputs. | Must | README primary journey remains. |
| FR7 | Recover a visibly pasted `agent_prompt_stalled` prompt with one logical Enter, then wait for `working` and settlement before applying handoff rules. | Must | Never resend the prompt; failed recovery keeps the pane open. |
| FR8 | Resolve and read `skill://skill-creator` for skill-bundled edits instead of probing a repository-local path. | Must | Absence of repository-local `skills/` is not a failure. |
| FR9 | Normalize the two existing `draft-issue` shared-reference pointers to `Read \`path\` when ...` without changing either target or instruction meaning. | Must | This is the only authorized pre-Integration prose change in `draft-issue`. |
| FR10 | Make deterministic pointer checks accept zero pointers for compact workflows while keeping the stricter `draft-issue` requirement, and correct the stale inventory diagnostic. | Must | Focused tests must prove both branches. |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #193 | 2026-08-21 | Initial feature spec |
