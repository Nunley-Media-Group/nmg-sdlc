# Defect Report: Resolve <plugin-root> in single-quoted and glob shell operands and in Glob and Grep paths

**Issue**: #604
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code

## Reproduction

1. With plugin root `/Volumes/Fast Brick/plugins/nmg-sdlc`, call `materializePluginRootCommand("ls '<plugin-root>/workflows'", root)` from `src/host-events.mjs`; it returns `ls '"/Volumes/Fast Brick/plugins/nmg-sdlc/workflows"'`, a path with literal double quotes.
2. Call `materializePluginRootCommand('ls <plugin-root>/workflows/draft-issue/references/*.md', root)`; it returns `ls "/Volumes/Fast Brick/plugins/nmg-sdlc/workflows/draft-issue/references/*.md"`, so the shell never expands `*.md`.
3. In a session with the plugin loaded, call Grep with `path` set to `<plugin-root>/workflows`; the hooks module forwards the raw placeholder and Grep searches a nonexistent path.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Each form resolves to the installed plugin's absolute path with the shell meaning the author wrote preserved: a single-quoted operand stays one literal path, a glob still expands, and Glob and Grep search the plugin directory |
| **Actual** | The single-quoted form gains literal double quotes, the glob form is quoted so it never expands, and Glob and Grep receive the raw placeholder |

## Acceptance Criteria

### AC1: Single-quoted operands resolve

**Given** a Bash command with a `<plugin-root>/...` path inside single quotes
**When** the hooks module rewrites the command
**Then** the command names the installed plugin path inside the single quotes with no added quote characters

### AC2: Glob operands still expand

**Given** a Bash command with an unquoted `<plugin-root>/...` operand containing `*`, `?` or `[...]`
**When** the hooks module rewrites the command
**Then** the plugin path is substituted, a plugin root containing spaces stays one word, and the glob characters remain unquoted so the shell expands them

### AC3: Glob and Grep paths resolve

**Given** a Glob or Grep tool call whose `path` begins with `<plugin-root>`
**When** the call runs in a session with the plugin loaded
**Then** the tool receives the installed plugin's absolute path

### AC4: Existing rewrites are preserved

**Given** Bash commands with a double-quoted `<plugin-root>` path, a bare `<plugin-root>/scripts/<name>.mjs` operand, or `${NMG_SDLC_PLUGIN_ROOT}`, and a Read call with a `<plugin-root>` path
**When** they are rewritten
**Then** the results are the same as before this change

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Placeholder rewriting inside single quotes substitutes the raw path without adding quote characters | Must |
| FR2 | Placeholder rewriting of a bare operand with glob characters keeps the glob characters unquoted | Must |
| FR3 | The hooks module rewrites a leading `<plugin-root>` in Glob and Grep `path` arguments | Must |
| FR4 | Existing double-quoted, bare-script, environment-variable and Read rewrites are unchanged | Must |

## Out of Scope

- Rewriting placeholders in tools other than Bash, Read, Glob and Grep
- Rewriting placeholders in Glob or Grep arguments other than `path`
- Changing how workflow text names plugin files

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #604 | 2026-11-23 | Initial defect report |
