# Root Cause Analysis: Leave escaped plugin-root variables in double quotes unchanged and scan command substitutions inside double quotes as their own context

**Issue**: #621
**Date**: 2026-11-25
**Status**: Approved
**Author**: Claude Code

## Root Cause

`materializePluginRootCommand` in `src/host-events.mjs` scans a command left to right. Outside quotes it skips a backslash-escaped character, rewrites a placeholder operand through `materializedOperand`, and hands a quoted segment to one of two patterns.

The double-quoted pattern is `/"((?:[^"\\\r\n]|\\[^\r\n])*)"/y`. The whole body it matches is rewritten in one call, `quotedSegment[1].replace(everyToken, () => bareRoot)`. Two things go wrong:

- The replacement does not look at the character before a token, so `\$NMG_SDLC_PLUGIN_ROOT` is rewritten and its backslash is left in front of the path.
- The pattern has no notion of `$(`. With inner double quotes it closes the segment at the first inner `"`, so the inner operand is scanned as unquoted text between two empty-looking segments. With inner single quotes or an unquoted operand it treats the whole substitution as double-quoted text and splices the bare root raw.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `src/host-events.mjs` | `materializePluginRootCommand` | Scans the command and rewrites placeholders by quoting context |
| `src/host-events.mjs` | `materializedOperand` (unchanged) | Builds the replacement for an unquoted operand |

`hooks/register.ts` calls `materializePluginRootCommand` for Bash commands. Its signature and the declaration in `src/host-events.d.mts` do not change.

## Fix Strategy

Replace the double-quoted pattern with a character-by-character scan, and make the command scan reusable for a nested substitution. `src/host-events.mjs` stays free of Node imports.

1. **Command context.** The existing loop becomes a scan that can run at the top level or inside a substitution. Its rules are the current ones:
   - A backslash and the character after it are copied unchanged.
   - A `'` opens a single-quoted segment (pattern unchanged, `'` in the root spliced as `'\''`).
   - A `"` opens a double-quoted segment (step 2).
   - A placeholder operand is replaced through `materializedOperand`.
   - A quoted segment that does not close on the same line is not a segment: its opening quote is copied as an ordinary character and scanning continues after it.
   - Inside a substitution only, an unquoted `(` raises the depth and an unquoted `)` lowers it. The `)` at depth zero ends the substitution.
2. **Double-quoted segment.** From the opening `"`, scan to the closing `"` on the same line:
   - A backslash followed by `$`, `"` or another backslash is copied together with that character, and neither is examined further. Any other backslash is an ordinary character.
   - `$(` starts a nested command context (step 1). When its matching `)` is found, the output is `$(`, the rewritten body, and `)`, and the double-quoted scan continues after it. When no matching `)` is found before the end of the line, the `$(` is ordinary double-quoted text.
   - A placeholder token is replaced by the bare root, as today.
   - Any other character is copied.
3. Nested contexts recurse, so a double-quoted segment inside a substitution may hold another substitution.
4. Update the function's doc comment to state the escape rule and the nested substitution rule.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `src/host-events.mjs` | Scan double-quoted segments character by character with escape pairs and nested `$(...)` contexts | AC1, AC2, AC3, AC4, AC5 |

## Blast Radius

Every Bash command the hooks module rewrites passes through this function. Commands without `$(` inside double quotes and without a backslash before `$` inside double quotes produce the same output as before. The early return for a command with no placeholder is kept, so such commands are still returned untouched.

`materializePluginRootPath` and `materializePluginRootToolInput` are not changed.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Recursive scan with a nested command context | Selected | One set of rules serves the top level and every substitution |
| Add a lookbehind for backslashes to the token replacement only | Rejected | Fixes AC1 but not the substitution cases |
| Extend the double-quoted regular expression to match `$(...)` | Rejected | A regular expression cannot match nested quotes and parentheses |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #621 | 2026-11-25 | Initial defect design |
