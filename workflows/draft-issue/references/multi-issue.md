# Multi-Issue Split

v3 supports proposing multiple executable issues (feature/bug) from one description. No Epic type, no spike type, no coordination aggregates, no child fan-out, no native sub-issue links, no coordinationParentNumber.

Relations are expressed only as `Depends on:` and `Blocks:` lines inside the issue bodies (parsed by parseBodyRelationships from scripts/epic-relationships.mjs; do not fork).

Use ask with 2-4 options, recommended first:

question: "Create separate issues for this split?"

options:

- "Yes — create the listed issues in dependency order (recommended)"
- "Adjust the split"
- "Keep a single issue"

On adjust: take Other text, re-segment simply (one re-ask max), re-render, ask again or accept.

On single: collapse.

Only this one ask for the split decision. No graph review gate (deps simple or flat).

## Deps for Bodies

- explicit "depends on X", "blocks Y" phrases in sourceText
- precursor language on shared component

Feature/bug templates are used as payload for body synthesis regardless of single/multi.

## State (simplified for plan emission)

- dag or ordered list of ask entries
- per ask: description, classification (later), milestone (later), investigation, interview, draft body (with dep lines inserted), title

The final plan serializes the ordered array of fully populated issue specs.
