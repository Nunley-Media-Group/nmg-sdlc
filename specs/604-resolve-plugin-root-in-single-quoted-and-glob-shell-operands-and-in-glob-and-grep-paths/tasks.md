# Tasks: Resolve <plugin-root> in single-quoted and glob shell operands and in Glob and Grep paths

**Issue**: #604
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code

## Implementation Tasks

### T001: Make Bash placeholder rewriting quote-aware

**File(s)**: `src/host-events.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1: a placeholder inside a single-quoted segment is replaced by the bare plugin root with no added quote characters; a `'` in the root is written as `'\''`.
- FR2: an unquoted placeholder operand whose tail contains `*`, `?` or `[` is rewritten as the JSON-quoted bare root followed by the unquoted tail.
- FR4: double-quoted placeholders, bare `/scripts/<name>.mjs` operands, other bare operands, `${NMG_SDLC_PLUGIN_ROOT}` and `$NMG_SDLC_PLUGIN_ROOT` produce the same output as before; a command without a placeholder is returned unchanged.

### T002: Rewrite Glob and Grep paths

**File(s)**: `src/host-events.mjs`, `src/host-events.d.mts`, `hooks/register.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR3: `materializePluginRootToolInput(input, root)` is exported and declared; for a `Glob` or `Grep` input whose `path` begins with a placeholder it returns a copy with `path` rewritten by `materializePluginRootPath`, and otherwise returns `input` itself.
- FR3: `hooks/register.ts` has a `tool.call` handler that passes `materializePluginRootToolInput(e, $.plugin.root)` to `next`.
- FR4: the Read handler and `materializePluginRootPath` are unchanged.

### T003: Implement the Regression Scenarios

**File(s)**: `scripts/__tests__/plugin-root-materialization.test.mjs`
**Type**: Create
**Depends**: T001, T002
**Acceptance**:
- Tests use root `/Volumes/Fast Brick/plugins/nmg-sdlc` and cite each `@SCN` tag in a describe title.
- `@SCN001` (AC1): `ls '<plugin-root>/workflows'` becomes `ls '/Volumes/Fast Brick/plugins/nmg-sdlc/workflows'`, and `cat '${NMG_SDLC_PLUGIN_ROOT}/references/a.md'` becomes `cat '/Volumes/Fast Brick/plugins/nmg-sdlc/references/a.md'`.
- `@SCN002` (AC2): `ls <plugin-root>/workflows/draft-issue/references/*.md` becomes `ls "/Volumes/Fast Brick/plugins/nmg-sdlc"/workflows/draft-issue/references/*.md`; the `?` form `ls <plugin-root>/workflows/?.md` and the bracket form `ls <plugin-root>/workflows/[ab]*.md` keep `?.md` and `[ab]*.md` unquoted after the quoted root.
- `@SCN003` (AC3): `materializePluginRootToolInput` maps `{ tool: 'Grep', path: '<plugin-root>/workflows', pattern: 'x' }` and `{ tool: 'Glob', path: '<plugin-root>/workflows', pattern: '**/*.md' }` to the same input with `path` `/Volumes/Fast Brick/plugins/nmg-sdlc/workflows`; it returns the identical object for a Grep path without a leading placeholder and for a non-Glob/Grep tool; and the `hooks/register.ts` source contains `materializePluginRootToolInput(e, $.plugin.root)` inside an `on('tool.call'` handler.
- `@SCN004` (AC4): `node "<plugin-root>/scripts/sdlc-status.mjs" --json`, `node <plugin-root>/scripts/sdlc-status.mjs --json`, `node "${NMG_SDLC_PLUGIN_ROOT}/scripts/exercise-claude.mjs" --cwd .`, `ls $NMG_SDLC_PLUGIN_ROOT/workflows` and `cat <plugin-root>/references/claude-code-tooling.md` produce the outputs listed in `scripts/__tests__/sdlc-commands.test.mjs` "plugin-root materialization", and `materializePluginRootPath('<plugin-root>/references/a.md', root)` returns `/Volumes/Fast Brick/plugins/nmg-sdlc/references/a.md`.
- `@SCN001` and `@SCN002` fail without T001; `@SCN003` fails without T002.
- `cd scripts && npm test -- __tests__/plugin-root-materialization.test.mjs __tests__/sdlc-commands.test.mjs __tests__/execute-goal.test.mjs` passes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #604 | 2026-11-23 | Initial defect tasks |
