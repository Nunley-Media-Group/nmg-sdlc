# Defect Report: Leave escaped plugin-root variables in double quotes unchanged and scan command substitutions inside double quotes as their own context

**Issue**: #621
**Date**: 2026-11-25
**Status**: Approved
**Author**: Claude Code
**Related Spec**: `specs/604-resolve-plugin-root-in-single-quoted-and-glob-shell-operands-and-in-glob-and-grep-paths/`

## Reproduction

1. Call `materializePluginRootCommand` from `src/host-events.mjs` with the root `/Fast Brick/p`.
2. Pass `echo "\$NMG_SDLC_PLUGIN_ROOT/x"`. The result is `echo "\/Fast Brick/p/x"`.
3. Pass `echo "$(cat "<plugin-root>/x")"`. The result is `echo "$(cat ""/Fast Brick/p/x"")"`.
4. Pass `echo "$(cat <plugin-root>/x)"`. The result is `echo "$(cat /Fast Brick/p/x)"`.
5. Pass `echo "$(cat '<plugin-root>/x')"` with the root `/u/o'n/p`. The result is `echo "$(cat '/u/o'n/p/x')"`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | An escaped variable inside double quotes is left unchanged. A placeholder inside `$(...)` within double quotes is rewritten by the rule for its own context (unquoted, single-quoted or double-quoted), so it stays one word and quoting stays balanced |
| **Actual** | The escaped variable is rewritten and keeps a stray backslash. Placeholders inside `$(...)` within double quotes are spliced as double-quoted text, so they split into several words or leave a quote unbalanced |

## Acceptance Criteria

### AC1: An escaped variable inside double quotes is left unchanged

**Given** a command containing `"\$NMG_SDLC_PLUGIN_ROOT/x"` or `"\${NMG_SDLC_PLUGIN_ROOT}/x"`
**When** it is materialized
**Then** the command is returned unchanged

### AC2: Inner double quotes inside a substitution stay one word

**Given** the root `/Fast Brick/p`
**When** `echo "$(cat "<plugin-root>/x")"` is materialized
**Then** the result is `echo "$(cat "/Fast Brick/p/x")"`

### AC3: Inner single quotes inside a substitution keep balanced quoting

**Given** the root `/u/o'n/p`
**When** `echo "$(cat '<plugin-root>/x')"` is materialized
**Then** the result is `echo "$(cat '/u/o'\''n/p/x')"`

### AC4: Unquoted operands inside a substitution follow the unquoted rules

**Given** the root `/Fast Brick/p`
**When** `echo "$(cat <plugin-root>/x)"` and `echo "$(ls <plugin-root>/a/*.md)"` are materialized
**Then** the results are `echo "$(cat "/Fast Brick/p/x")"` and `echo "$(ls "/Fast Brick/p"/a/*.md)"`

### AC5: Existing rewrites are preserved

**Given** single-quoted operands, glob operands, Glob and Grep paths, double-quoted and bare controller paths, and escaped quotes outside double quotes
**When** they are materialized
**Then** each output is the same as before this change

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Inside a double-quoted segment, a `$NMG_SDLC_PLUGIN_ROOT` or `${NMG_SDLC_PLUGIN_ROOT}` token preceded by an odd number of backslashes is not rewritten | Must |
| FR2 | A `$(` inside a double-quoted segment starts a nested command context, scanned with the same unquoted, single-quoted and double-quoted rules up to its matching `)`, after which the outer double-quoted segment continues | Must |
| FR3 | Every current output covered by the scenarios of #604 is unchanged | Must |

## Out of Scope

- Backtick command substitution, here-documents, and quoted segments that span lines
- Placeholders inside Glob or Grep `pattern` arguments
- A command substitution that contains an unbalanced `)`, such as a `case` pattern

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #621 | 2026-11-25 | Initial defect report |
