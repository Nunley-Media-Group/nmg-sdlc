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

