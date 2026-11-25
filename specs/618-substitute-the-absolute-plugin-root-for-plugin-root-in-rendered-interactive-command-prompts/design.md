# Root Cause Analysis: Substitute the absolute plugin root for <plugin-root> in rendered interactive command prompts

**Issue**: #618
**Date**: 2026-11-24
**Status**: Approved
**Author**: Claude Code

## Root Cause

`renderInteractiveWorkflow` in `src/sdlc-commands.mjs` renders every interactive command, `/sdlc-execute` included, and receives the absolute `pluginRoot`. Its last step, `materializeControllerPaths` (`scripts/plugin-controller-path.mjs`), rewrites only `<plugin-root>/scripts/<name>.mjs` controller operands to JSON-quoted absolute paths. No step rewrites any other `<plugin-root>`. That covers the `plugin.paths.<consumer>` preamble built by `pluginPathsNote` (`src/sdlc-prompt-snippets.mjs`) and prose such as `Controller paths (`<plugin-root>/scripts/...`)` in `workflows/execute/WORKFLOW.md`. The hooks module rewrites the placeholder only when the model writes it literally in a tool call, so a prompt that never states the root leaves the model guessing.

The `pluginPathsNote` doc comment also says the hooks module materializes `<plugin-root>` in "Bash commands and Read paths". That is stale: since #604 the hooks module also rewrites the `path` of Glob and Grep calls.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `src/sdlc-commands.mjs` | `renderInteractiveWorkflow` | Renders and materializes every interactive command prompt |
| `src/sdlc-commands.mjs` | new `materializeRenderedPluginRoot` | Substitutes the remaining placeholders |
| `src/host-events.mjs` | `materializePluginRootCommand` (reused, unchanged) | Quoting-aware placeholder rewrite for shell text |
| `src/sdlc-prompt-snippets.mjs` | `pluginPathsNote` doc comment | Describes where placeholders are materialized |

## Fix Strategy

1. Add an exported `materializeRenderedPluginRoot(text, root)` to `src/sdlc-commands.mjs`. It returns `text` unchanged when it holds no `<plugin-root>` or when `root` is not a non-empty string. Otherwise it trims trailing `/` or `\` from `root` to get the bare root. It then scans the Markdown in three kinds of region and rewrites only the `<plugin-root>` spelling:
   - **Fenced code blocks** (a line opening with three or more backticks, up to the matching closing fence). The block body passes through `materializePluginRootCommand(body, bareRoot)` from `src/host-events.mjs`. An unquoted operand becomes JSON-quoted (`"<root>/x"`), and a glob tail stays unquoted after the quoted root (`"<root>"/x/*.md`). Quoted segments get the raw root spliced in, and a `'` in a single-quoted splice becomes `'\''`.
   - **Inline code spans** (a single-backtick span on one line). A span whose original content contains whitespace is a command: its content passes through `materializePluginRootCommand`. A span with no whitespace is a single path or token, and each `<plugin-root>` in it becomes the bare root.
   - **All other text.** Each `<plugin-root>` becomes the bare root.
2. In `renderInteractiveWorkflow`, return `materializeRenderedPluginRoot(materializeControllerPaths(text, pluginRoot), pluginRoot)`. Controller materialization runs first and is unchanged. By the time the new step runs, every controller operand is already an absolute path with no placeholder, so its output is byte-identical to today's (FR4).
3. Leave the `pluginPathsNote` body unchanged. The worker prompts that also include it are out of scope and still rely on the literal placeholder, which the hooks module rewrites. For interactive prompts, step 2 turns the note into "Plugin paths: `<abs root>` is the installed nmg-sdlc plugin root…", with each workflow directory written as `<abs root>/workflows/<name>/` (FR3). Rewrite the note's doc comment to say that `<plugin-root>` is substituted with the absolute root in rendered interactive prompts. It should also say the hooks module materializes the literal placeholder in Bash commands, Read paths, and the `path` of Glob and Grep calls, and that command files use `${CLAUDE_PLUGIN_ROOT}`.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `src/sdlc-commands.mjs` | New exported `materializeRenderedPluginRoot`; `renderInteractiveWorkflow` applies it after `materializeControllerPaths` | AC1, AC2, AC3 |
| `src/sdlc-prompt-snippets.mjs` | `pluginPathsNote` doc comment names Bash commands, Read paths, and Glob and Grep `path` | AC4 |

## Blast Radius

`renderInteractiveWorkflow` feeds the six interactive commands, `/sdlc-execute`, and `renderWriteSpecContinuation`. Only text that contained `<plugin-root>` changes. Controller operands are already absolute before the new step, so hook recognizers that match rendered commands keep matching: `writeSpecMergeIssue`, `isExecuteSuperviseCommand`, and `EXECUTE_GOAL_RE`. `renderAutomatedCommandMarkdown` and worker prompts do not call `renderInteractiveWorkflow`, so they are unchanged.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Context-aware substitution reusing `materializePluginRootCommand` | Selected | Code gets shell-correct quoting, prose gets plain paths, and the quoting rules stay in one place |
| Plain `replaceAll` of the placeholder | Rejected | A shell operand under a root with spaces would split into several words (violates AC2) |
| Pass the root into `pluginPathsNote` at render time | Rejected | Fixes only the preamble, and the catalog fragments are built once at module load |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #618 | 2026-11-24 | Initial defect design |
