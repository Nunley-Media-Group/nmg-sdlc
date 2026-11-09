# Defect Report: Pasted nmg-sdlc command text is sent to the model instead of running the command

**Issue**: #541
**Date**: 2026-11-09
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/538-replace-herdr-panes-with-hooks-module-subagents-for-sdlc-execute/

## Reproduction

1. Start an interactive Claude Code session with the nmg-sdlc hooks module loaded in a project.
2. Submit, as a single multi-line paste, text whose first non-blank line is `/sdlc-draft-issue Fix X` followed by further description lines.
3. Observe that no plan mode starts and no nmg-sdlc workflow is rendered; the text is sent to the model as a plain prompt.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | A person-originated prompt with no engine-parsed `command`, whose text after leading whitespace begins with `/<name>` for a name in `INTERACTIVE_COMMANDS` followed by end of text or whitespace, is not sent to the model; the named command runs with the remaining text, multi-line content included, as its arguments, exactly as if `/<name> <args>` had been typed (headless refusal, model gate, workflow rendering, plan mode and model override) |
| **Actual** | The text is sent to the model as a plain prompt and no nmg-sdlc command handler runs |

## Acceptance Criteria

### AC1: A pasted command runs as the command

**Given** an interactive session with the hooks module loaded
**When** a person-originated prompt with no engine-parsed command has text beginning `/sdlc-draft-issue` followed by a multi-line description
**Then** the prompt is not sent to the model, and `/sdlc-draft-issue` runs with the full remaining text as its arguments, rendering its workflow in plan mode as when typed

### AC2: Typed commands and ordinary prompts are unchanged

**Given** an interactive session with the hooks module loaded
**When** a prompt is a typed slash command (engine-parsed `command` present), a plugin-submitted or `isMeta` prompt, or text that does not begin with a registered nmg-sdlc command name (including `/sdlc-unknown`, a command name mentioned mid-text, and `/sdlc-draft-issuex`)
**Then** it passes through exactly as before, and the existing model-override clearing still applies

### AC3: Headless behavior matches the typed command

**Given** a headless session
**When** a person-originated prompt's text begins with an interactive command other than `/sdlc-execute`
**Then** the prompt is not sent to the model and the outcome is the same `Run /<name> in the TUI.` refusal the typed command gives, with no workflow rendered

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Detect a leading registered `INTERACTIVE_COMMANDS` name in a `prompt.submit` whose origin is `composer` or `bridge`, that is not `isMeta`, and that has no engine-parsed `command`, matching only at the start of the trimmed text and only when the name is followed by end of text or whitespace | Must |
| FR2 | Drop the plain prompt and run the matched command with the remainder as arguments through the same handling the command's `command.run` hook uses, so every gate applies | Must |
| FR3 | Leave typed commands, plugin-submitted and `isMeta` prompts, and non-matching text unchanged, keeping the existing model-override clearing for person-originated prompts | Must |
| FR4 | Unit tests in `hooks/register.test.ts` cover AC1-AC3 | Must |

## Out of Scope

- Recognizing commands from other plugins or built-in Claude Code commands inside pasted text
- Changing how terminal drivers deliver pasted text

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #541 | 2026-11-09 | Initial defect report |
