# Requirements: Prompt-snippet registry for command and worker composition

**Issue**: #213
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/193-reduce-injected-sdlc-workflow-tokens-while-keeping-file-command-surfaces/

---

## User Story

**As a** Herdr OMP plugin maintainer
**I want** nmg-sdlc to compose command and worker prompts from named reusable fragments
**So that** shared instructions have one owner and later project steering can contribute context without concatenating whole workflow files

---

## Background

Today every public command and execute worker prompt is assembled by reading one or more complete `WORKFLOW.md` bodies and concatenating them with a few wrapper lines. There is no named fragment registry, no insertion slot, no provenance, and no way for project steering to contribute reusable prompt snippets. The next issue needs that registry so managed steering modules and project snippets can inject guidance without forking workflow files.

---

## Acceptance Criteria

Each criterion becomes a Gherkin scenario.

### AC1: existing surfaces render through the registry

**Given** the current plugin workflows and worker step map
**When** an interactive command rewrite, automated command Markdown render, or execute `worker-prompt` is produced
**Then** the text is composed by the prompt-snippet registry from named fragments
**And** the observable prompt content for those existing consumers matches the current owned workflow text plus the current argument/handoff wrapper behavior

### AC2: named fragments compose in declared order

**Given** two or more registered fragments that share an allowed consumer and slot
**When** the registry renders that consumer
**Then** fragments appear in a stable documented order
**And** each rendered prompt has a machine-readable provenance record naming every fragment id, provider, source path, and hash

### AC3: invalid composition fails closed

**Given** a duplicate fragment id, a missing source, an unknown placeholder, a path outside its allowed root, or a fragment that names a disallowed consumer or slot
**When** registration or render runs
**Then** the operation fails with a named error
**And** no partial prompt is treated as success

### AC4: project fragments stay inactive until registered later

**Given** only the plugin’s built-in workflow fragments are registered
**When** current commands and workers render
**Then** no project-directory snippet is inserted
**And** documented prompt byte ceilings still apply to those built-in renders

### AC5: every composer is cut over and existing function still works

**Given** the production command, extension, and execute prompt paths after this change
**When** the full `scripts` Jest suite and the smoke commands in Verification run
**Then** no production file under `src/` or `scripts/` concatenates `workflowBody` or reads `selection.md` outside the registry
**And** every interactive rewrite, automated `commands/sdlc-*.md` body, and `workerPrompt` step still matches today’s observable text
**And** `/sdlc-status` still reports through `scripts/sdlc-status.mjs` and interactive `/sdlc-write-spec` still fails closed without a TUI

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | A plugin-owned prompt-snippet registry is the only composer for interactive rewrites, automated command Markdown instruction bodies, and execute worker prompts. | Must | `/plan\n\n` prefix and `withArguments` stay outside the registry. |
| FR2 | Built-in workflow bodies remain the source of current command and worker instruction text until a later issue registers project fragments. | Must | Do not scan project directories. |
| FR3 | Fragments declare identity, allowed consumers, slot, order, and a byte bound. Unknown keys and empty bodies are rejected. | Must | Allowed keys are exactly those in the design. |
| FR4 | Variable substitution is limited to registry-supplied scalars. Unknown placeholders fail render. | Must | Only `{{name}}`. `$ARGUMENTS` is literal workflow text. |
| FR5 | Duplicate ids are errors. Last-registration-wins is forbidden. | Must | |
| FR6 | Each live interactive rewrite and each execute worker-prompt persist provenance (fragment id, provider, source, hash, byte count) under `.omp/sdlc/prompt-provenance/`. | Must | `renderAutomatedCommandMarkdown` composes via the registry but does not persist a sidecar (packaging). |
| FR7 | `workflowBody` remains the file-reader adapter used only by the registry loader. Every production composition callsite is migrated. | Must | Do not delete `workflowBody` or `renderedPromptBytes`. |
| FR8 | Implementation verification runs the full `scripts` Jest suite and the smoke commands in Verification before the work is treated as done. | Must | Fail the issue if any existing heading, file-command byte identity, ceiling, or status/TUI-fail-closed contract regresses. |

---

## Out of Scope

- `/sdlc-steering` and any new public command
- Replacing `steering/product.md`, `steering/tech.md`, or `steering/structure.md`
- Changing verify-code gate execution or status aggregation
- Letting project files contribute fragments yet
- Changing execute step order or handoff schema
- Prompt templates with loops, includes, shell expansion, or expression evaluation

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #213 | 2026-08-23 | Initial feature spec |
