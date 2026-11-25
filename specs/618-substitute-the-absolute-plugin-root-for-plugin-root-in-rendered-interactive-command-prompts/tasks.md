# Tasks: Substitute the absolute plugin root for <plugin-root> in rendered interactive command prompts

**Issue**: #618
**Date**: 2026-11-24
**Status**: Approved
**Author**: Claude Code

## Implementation Tasks

### T001: Substitute the plugin root in rendered interactive prompts

**File(s)**: `src/sdlc-commands.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1: `materializeRenderedPluginRoot(text, root)` is exported. It replaces every `<plugin-root>` with the bare root (trailing separators trimmed) in text outside code, and in inline code spans whose content has no whitespace.
- FR2: in fenced code blocks, and in inline code spans whose content contains whitespace, the content is rewritten by `materializePluginRootCommand` from `src/host-events.mjs`. An unquoted operand becomes JSON-quoted, and a glob tail stays unquoted after the JSON-quoted root.
- FR1: `renderInteractiveWorkflow` returns `materializeRenderedPluginRoot(materializeControllerPaths(text, pluginRoot), pluginRoot)`.
- FR4: text without `<plugin-root>` and every already-materialized controller operand are returned unchanged.

### T002: Correct the plugin-path note doc comment

**File(s)**: `src/sdlc-prompt-snippets.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR3: the `pluginPathsNote` doc comment says rendered interactive prompts substitute the absolute root. It also says the hooks module materializes the literal placeholder in Bash commands, Read paths, and the `path` of Glob and Grep calls, and that command files use `${CLAUDE_PLUGIN_ROOT}`. It no longer reads "(Bash commands and Read paths)".
- The `pluginPathsNote` return value is unchanged.

### T003: Implement the Regression Scenarios

**File(s)**: `scripts/__tests__/rendered-plugin-root.test.mjs`
**Type**: Create
**Depends**: T001, T002
**Acceptance**:
- Each `@SCN` tag is cited in a describe title.
- `@SCN001` (AC1): for each of the seven interactive commands, `renderInteractiveWorkflow(command, repoRoot, <temp project>)` contains no `<plugin-root>`. It contains `` `${repoRoot}` is the installed nmg-sdlc plugin root ``, contains `resolve under `${repoRoot}/workflows/<name>/`` for the command's inlined workflow (for example `draft-issue` for `sdlc-draft-issue`), and contains `resolves under `${repoRoot}/references/``.
- `@SCN002` (AC2): with root `/Volumes/Fast Brick/plugins/nmg-sdlc`, `materializeRenderedPluginRoot` maps a fenced block line `cat <plugin-root>/references/a.md` to `cat "/Volumes/Fast Brick/plugins/nmg-sdlc/references/a.md"`. It maps a fenced `ls <plugin-root>/workflows/draft-issue/references/*.md` to `ls "/Volumes/Fast Brick/plugins/nmg-sdlc"/workflows/draft-issue/references/*.md`. It maps an inline span `` `ls <plugin-root>/workflows/*.md` `` to `` `ls "/Volumes/Fast Brick/plugins/nmg-sdlc"/workflows/*.md` ``. It maps prose `under <plugin-root>/references/` to `under /Volumes/Fast Brick/plugins/nmg-sdlc/references/`.
- `@SCN003` (AC3): `renderInteractiveWorkflow('sdlc-steering', repoRoot, ...)` contains `node "${path.join(repoRoot, 'scripts', 'sdlc-steering.mjs')}" inspect --project .`. `materializeRenderedPluginRoot` returns a text containing `node "/opt/x/scripts/sdlc-status.mjs" --json` and no placeholder unchanged.
- `@SCN004` (AC4): the source of `src/sdlc-prompt-snippets.mjs` contains a `pluginPathsNote` doc comment naming `Glob` and `Grep`, and no longer contains `(Bash commands and Read paths)`.
- `@SCN001` fails without T001, and `@SCN004` fails without T002.
- `cd scripts && npm test -- __tests__/rendered-plugin-root.test.mjs __tests__/sdlc-commands.test.mjs __tests__/sdlc-prompt-snippets.test.mjs __tests__/execute-goal.test.mjs __tests__/execute-safe-remediation-contract.test.mjs __tests__/test-layers-contract.test.mjs` passes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #618 | 2026-11-24 | Initial defect tasks |
