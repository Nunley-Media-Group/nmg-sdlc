# Defect Report: Substitute the absolute plugin root for <plugin-root> in rendered interactive command prompts

**Issue**: #618
**Date**: 2026-11-24
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/604-resolve-plugin-root-in-single-quoted-and-glob-shell-operands-and-in-glob-and-grep-paths/

## Reproduction

1. Render an interactive command prompt with `renderInteractiveWorkflow("sdlc-draft-issue", <checkout>, <scratch project>)` from `src/sdlc-commands.mjs`. The command `node scripts/sdlc-render-prompt.mjs --project <project> --consumer sdlc-draft-issue` does the same.
2. Search the rendered text for the absolute plugin root and for `<plugin-root>`.
3. Observe that the plugin-paths preamble (`Plugin paths: ...`, `... resolve under <plugin-root>/workflows/draft-issue/`, `../../references/... resolves under <plugin-root>/references/`) still reads `<plugin-root>`. Only controller operands such as `node "<abs>/scripts/<name>.mjs"` carry the absolute root.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Every rendered interactive command prompt names packaged plugin files by the absolute root of the plugin that rendered it. No `<plugin-root>` remains, and a substituted path used as a shell operand stays one shell word when the root contains spaces |
| **Actual** | The rendered prompt keeps `<plugin-root>` everywhere except controller-script operands, so the model must infer where the plugin lives |

## Acceptance Criteria

### AC1: Interactive prompts carry the absolute plugin root

**Given** an interactive command (`sdlc-draft-issue`, `sdlc-write-spec`, `sdlc-onboard-project`, `sdlc-upgrade-project`, `sdlc-steering`, `sdlc-run-retro` or `sdlc-execute`) rendered by a plugin installed at an absolute root
**When** its prompt is rendered
**Then** the rendered text contains no `<plugin-root>` placeholder
**And** the plugin-paths preamble names the absolute root and each inlined workflow's absolute directory

### AC2: Shell operands stay one word under a root with spaces

**Given** a plugin root that contains a space
**When** an interactive prompt that contains a shell command naming a packaged path is rendered
**Then** that path is quoted in the rendered command so it remains one shell word
**And** a glob tail on that path stays unquoted so the shell still expands it

### AC3: Existing controller-path rendering is preserved

**Given** a workflow that runs `node <plugin-root>/scripts/<name>.mjs`
**When** its prompt is rendered
**Then** the command reads `node "<absolute root>/scripts/<name>.mjs"` exactly as before

### AC4: The plugin-path note describes current hook behavior

**Given** the `pluginPathsNote` doc comment in `src/sdlc-prompt-snippets.mjs`
**When** it is read
**Then** it no longer says the hooks module materializes `<plugin-root>` only in Bash commands and Read paths, and it names Glob and Grep `path` too

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `renderInteractiveWorkflow` replaces every `<plugin-root>` in a rendered interactive prompt with the absolute plugin root it was given | Must |
| FR2 | A substituted path used as a shell operand is quoted so a root with spaces stays one word, keeping any glob tail unquoted | Must |
| FR3 | `pluginPathsNote` states the absolute root and each workflow's absolute directory, and its doc comment lists Bash commands, Read paths, and Glob and Grep `path` | Must |
| FR4 | Controller-script operands render exactly as they do today | Must |

## Out of Scope

- Prompts rendered for `/sdlc-execute` stage subagents (`nmg-sdlc:execute-<entry>`)
- Automated command files under `commands/`, which already use `${CLAUDE_PLUGIN_ROOT}`
- Changing how the hooks module rewrites literal placeholders in tool calls

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #618 | 2026-11-24 | Initial defect report |
