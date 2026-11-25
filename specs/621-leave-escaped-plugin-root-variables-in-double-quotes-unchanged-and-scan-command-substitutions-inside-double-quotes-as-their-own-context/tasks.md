# Tasks: Leave escaped plugin-root variables in double quotes unchanged and scan command substitutions inside double quotes as their own context

**Issue**: #621
**Date**: 2026-11-25
**Status**: Approved
**Author**: Claude Code

## Implementation Tasks

### T001: Scan double-quoted segments with escape pairs and nested substitutions

**File(s)**: `src/host-events.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1: inside a double-quoted segment a backslash followed by `$`, `"` or another backslash is copied with that character and neither is rewritten. With root `/Fast Brick/p`, `echo "\$NMG_SDLC_PLUGIN_ROOT/x"` and `echo "\${NMG_SDLC_PLUGIN_ROOT}/x"` are returned unchanged, and `echo "\\$NMG_SDLC_PLUGIN_ROOT/x"` becomes `echo "\\/Fast Brick/p/x"`.
- Any other backslash inside a double-quoted segment is ordinary text: `echo "\<plugin-root>/x"` becomes `echo "\/Fast Brick/p/x"`.
- FR2: a `$(` inside a double-quoted segment is scanned as a nested command context up to its matching unquoted `)`, and the outer segment continues after it. With root `/Fast Brick/p`:
  - `echo "$(cat "<plugin-root>/x")"` becomes `echo "$(cat "/Fast Brick/p/x")"`.
  - `echo "$(cat <plugin-root>/x)"` becomes `echo "$(cat "/Fast Brick/p/x")"`.
  - `echo "$(ls <plugin-root>/a/*.md)"` becomes `echo "$(ls "/Fast Brick/p"/a/*.md)"`.
  - `echo "$(cat <plugin-root>/x) <plugin-root>/y"` becomes `echo "$(cat "/Fast Brick/p/x") /Fast Brick/p/y"`.
  - `echo "$(echo "$(cat <plugin-root>/x)")"` becomes `echo "$(echo "$(cat "/Fast Brick/p/x")")"`.
  - `echo "$( (cat <plugin-root>/x) )"` becomes `echo "$( (cat "/Fast Brick/p/x") )"`.
- With root `/u/o'n/p`, `echo "$(cat '<plugin-root>/x')"` becomes `echo "$(cat '/u/o'\''n/p/x')"`.
- A `$(` with no matching `)` before the end of the line is ordinary double-quoted text: with root `/Fast Brick/p`, `echo "$(cat <plugin-root>/x"` becomes `echo "$(cat /Fast Brick/p/x"`.
- A double-quoted segment that does not close on the same line is not a segment: `echo "<plugin-root>/x` becomes `echo ""/Fast Brick/p/x"`.
- A command with no placeholder is returned as the same string.
- The file imports no Node built-in, and the function's doc comment states both rules.

### T002: Implement the Regression Scenarios

**File(s)**: `scripts/__tests__/plugin-root-nested-context.test.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- Each `@SCN` tag is cited in a describe or test title. The tests call `materializePluginRootCommand` and `materializePluginRootToolInput` imported from `src/host-events.mjs`.
- `@SCN001` (AC1): with root `/Fast Brick/p`, `echo "\$NMG_SDLC_PLUGIN_ROOT/x"` and `echo "\${NMG_SDLC_PLUGIN_ROOT}/x"` are returned unchanged.
- `@SCN002` (AC2): with root `/Fast Brick/p`, `echo "$(cat "<plugin-root>/x")"` becomes `echo "$(cat "/Fast Brick/p/x")"`.
- `@SCN003` (AC3): with root `/u/o'n/p`, `echo "$(cat '<plugin-root>/x')"` becomes `echo "$(cat '/u/o'\''n/p/x')"`.
- `@SCN004` (AC4): with root `/Fast Brick/p`, `echo "$(cat <plugin-root>/x)"` becomes `echo "$(cat "/Fast Brick/p/x")"` and `echo "$(ls <plugin-root>/a/*.md)"` becomes `echo "$(ls "/Fast Brick/p"/a/*.md)"`.
- `@SCN005` (AC5): with root `/Fast Brick/p`, each input below gives the listed output:

  | Input | Output |
  |-------|--------|
  | `ls '<plugin-root>/a'` | `ls '/Fast Brick/p/a'` |
  | `ls <plugin-root>/a/*.md` | `ls "/Fast Brick/p"/a/*.md` |
  | `node "<plugin-root>/scripts/a.mjs" x` | `node "/Fast Brick/p/scripts/a.mjs" x` |
  | `node <plugin-root>/scripts/a.mjs x` | `node "/Fast Brick/p/scripts/a.mjs" x` |
  | `cat "${NMG_SDLC_PLUGIN_ROOT}/x"` | `cat "/Fast Brick/p/x"` |
  | `echo \"<plugin-root>/x\"` | `echo \""/Fast Brick/p/x"\"` |
  | `echo "a \" <plugin-root>/x"` | `echo "a \" /Fast Brick/p/x"` |

  and `materializePluginRootToolInput` returns the path `/Fast Brick/p/a` for a Glob call and for a Grep call whose `path` is `<plugin-root>/a`.
- `@SCN001` through `@SCN004` fail without T001, and `@SCN005` passes with and without it.
- `cd scripts && npm test -- __tests__/plugin-root-nested-context.test.mjs __tests__/plugin-root-materialization.test.mjs` passes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #621 | 2026-11-25 | Initial defect tasks |
