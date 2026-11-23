# Root Cause Analysis: Resolve <plugin-root> in single-quoted and glob shell operands and in Glob and Grep paths

**Issue**: #604
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code

## Root Cause

`materializePluginRootCommand` in `src/host-events.mjs` makes two passes. The first rewrites placeholders inside double-quoted strings raw. The second replaces every remaining placeholder operand (`<plugin-root>`, `${NMG_SDLC_PLUGIN_ROOT}` or `$NMG_SDLC_PLUGIN_ROOT`, plus its `/...` tail) with `JSON.stringify(path)`. That pass does not know whether the operand sits inside single quotes, so `'<plugin-root>/workflows'` becomes `'"/root/workflows"'`; and it quotes the whole tail, so the glob characters of `<plugin-root>/x/*.md` are quoted and never expand.

`materializePluginRootPath` is applied only in the `Read` `tool.call` handler of `hooks/register.ts`. No handler rewrites a Glob or Grep `path`, so those tools receive the raw placeholder.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `src/host-events.mjs` | `materializePluginRootCommand` | Rewrites placeholders in a Bash command |
| `src/host-events.mjs` | `materializePluginRootPath` | Rewrites a leading placeholder in a file path |
| `src/host-events.d.mts` | exported declarations | Types the helpers for `hooks/register.ts` |
| `hooks/register.ts` | `tool.call` handlers | Applies the rewrites before a tool runs |

## Fix Strategy

1. Replace the two regex passes of `materializePluginRootCommand` with one left-to-right scan that tracks the quoting context of each character:
   - Inside a single-quoted segment, each placeholder is replaced by the bare root raw; a `'` inside the root is written as `'\''` so the segment stays one literal word. No other character is added.
   - Inside a double-quoted segment, each placeholder is replaced by the bare root raw, exactly as today.
   - In unquoted text, a placeholder and its `/...` tail (the same tail character class as today) are rewritten as today — the `/scripts/<name>.mjs` controller form through `controllerPath`, any other path as `JSON.stringify(path)` — except that a tail containing `*`, `?` or `[` becomes `JSON.stringify(bareRoot)` followed by the tail unquoted, so a root with spaces stays one word and the glob still expands.
   The early return for a command with no placeholder, the bare-root trailing-separator trim, and the treatment of all three placeholder spellings are unchanged.
2. Add `materializePluginRootToolInput(input, root)` to `src/host-events.mjs` and declare it in `src/host-events.d.mts`. When `input.tool` is `Glob` or `Grep` and `input.path` is a string, it returns `{ ...input, path: materializePluginRootPath(input.path, root) }` if that changes the path; otherwise it returns `input` itself.
3. In `hooks/register.ts`, add an untyped `on('tool.call', ...)` handler that forwards `materializePluginRootToolInput(e, $.plugin.root)` to `next`. It is untyped because the host tool declarations declare no `Glob` or `Grep` input, so a `{ tool: 'Grep' }` selector does not type-check.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `src/host-events.mjs` | Quote-aware scan in `materializePluginRootCommand`; new `materializePluginRootToolInput` | AC1, AC2, AC3, AC4 |
| `src/host-events.d.mts` | Declare `materializePluginRootToolInput` | AC3 |
| `hooks/register.ts` | Glob/Grep `tool.call` handler | AC3 |

## Blast Radius

Every Bash call in a session with the plugin loaded passes through `materializePluginRootCommand`, including the `sdlc-execute.mjs supervise` and `publish-approved-spec.mjs merge` commands the hooks module recognizes after rewriting. Those use the bare controller and double-quoted forms, whose output is unchanged (AC4), so `isExecuteSuperviseCommand` and `writeSpecMergeIssue` keep matching. The new handler changes only Glob and Grep calls whose `path` begins with a placeholder.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| One quote-aware scan | Selected | Each placeholder is rewritten once, for the quoting context it is actually in |
| Add a single-quote regex pass before the operand pass | Rejected | Independent regex passes misjudge quotes nested in the other quote kind |
| Typed `{ tool: 'Glob' }` / `{ tool: 'Grep' }` handlers | Rejected | The host tool declarations do not declare those tools |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #604 | 2026-11-23 | Initial defect design |
