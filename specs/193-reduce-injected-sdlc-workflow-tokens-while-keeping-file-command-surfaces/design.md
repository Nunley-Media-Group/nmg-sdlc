# Design: Reduce injected SDLC workflow tokens while keeping file-command surfaces

**Issue**: #193
**Date**: 2026-08-21
**Status**: Approved
**Author**: NMG
---

## Overview

Injection is a string pipeline, not a new runtime. `workflowBody(name)` reads `workflows/{name}/WORKFLOW.md` and `stripWorkflowFrontmatter` only. Interactive `/plan` uses that body via `rewriteInteractiveInput` / `sendUserMessage(\`/plan\\n\\n${withArguments(workflowBody(skill), args)}\`)`. Automated file commands write `renderAutomatedCommandMarkdown` into `commands/sdlc-execute.md`, `commands/sdlc-status.md`, `commands/sdlc-verify-code.md`, `commands/sdlc-open-pr.md`. `workerPrompt({ step, issue })` joins a worker header plus `workflowBody` for `STEP_SKILL[step]` plus `STEP_EXTRA_WORKFLOWS` extras.

This issue deletes the Integration heading from every workflow file so it leaves that pipeline, stops treating the heading as an audit/steering requirement, shrinks the status workflow to the script contract, and freezes post-change UTF-8 sizes with +256 byte ceilings. No new public command. No execute `run` subcommand. No `startIssue()` module.

## Architecture

Prompt submission remains workflow-owned. A stalled atomic prompt is recoverable only when Herdr's detection view shows the exact prompt pasted but not submitted: send one logical `enter`, observe `working`, then wait for a settled state. The existing handoff remains the source of truth; failed recovery keeps the pane open.

Skill-bundled authoring resolves the installed `skill://skill-creator` URI through OMP. Repository-local `skills/skill-creator/SKILL.md` discovery is not part of the contract.

The deterministic exercise pointer grammar is `Read \`path\` when ...`. Normalize only the two existing shared-reference instructions at the start of `draft-issue`; preserve `../../references/codex-tooling.md`, `../../references/interactive-gates.md`, and each instruction's behavior. This exact repair is the sole exception to T001's pre-Integration prose-preservation rule.

Pointer validation is conditional by workflow shape: `draft-issue` continues to require one or more conforming pointers, while a compact workflow such as `status` may validly contain none. The inventory validator reports only the metadata validation it still executes after structure validation is removed.

