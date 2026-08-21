---
name: draft-issue
description: "Interview user about a feature need, create groomed GitHub issue with BDD acceptance criteria. Use when `/sdlc-draft-issue`. Supports feature and bug templates. First step — next is write-spec."
---

# Draft Issue

Read `../../references/codex-tooling.md` (maps to current OMP tools: read/grep/glob/ask/write to local:// and xd://propose).

Read `../../references/interactive-gates.md` (replaced by native /plan + ask + xd://propose contract).

## Core Flow

1. Gather need: if $ARGUMENTS present use as initialDescription. Else use one ask for the need (free-form via Other if needed, but prefer short).

2. If multi-issue signals (see references/multi-issue.md), run detection, then ONE ask to confirm split (options: approve split / adjust / single). Max questions budget: 3 total across whole run.

3. Classification ask (exactly these 2 options, recommended first based on text):

   Use ask:

   question: "What type of issue is this?"

   options:

   - "Enhancement — New capability or improvement to existing behavior (recommended for most)"

   - "Bug — Something is broken or behaving incorrectly"

   Map to: feature | bug. Never epic. Never spike.

4. Milestone (if root VERSION parses as semver X.Y.Z):

   Read VERSION.

   Extract major.

   One ask:

   options:

   - `v${major} (current)`

   - `v${major+1} (next)`

   Recommended first. Record milestone or null.

   (The plan execution will ensure the milestone exists via gh before create if chosen.)

5. Investigate (use glob/grep/read, no subagents unless scoped):

   - For enhancement/feature: read relevant steering, use glob for specs/ and source; summarize Current State.

   - For bug: search error/func, read files, form root-cause hypothesis.

   Record signals for depth.

6. Interview (adaptive, but total asks <=3 across all, including above):

   Use at most the remaining ask slots (2-4 options preferred, rec first).

   Core probes: persona/outcome, key ACs, scope in/out, for bug: repro/expected.

   One "anything missed?" if slots allow.

   Do NOT use ask for final approval or review of draft. Synthesis happens, then propose.

7. Synthesize per classification using the payload templates:

   Read references/feature-template.md | bug-template.md as execution payload.

   Fill from understanding + investigation.

   For multi (from references/multi-issue.md): insert at end of each body the topo Depends on: / Blocks: lines using summaries (human readable). No placeholders for later rewrite.

8. Build per-issue plan entries in topo order (single = 1).

   Each:

   - classification: feature|bug

   - title: verb-first concise

   - milestone: "vX" | null

   - labels: ["enhancement"] | ["bug"]

   - body: full markdown (from template fill + dep lines)

   - ghCreateArgs: exact argv array e.g. ["gh","issue","create","--title", t, "--body", b, "--label", l, (milestone? ["--milestone", m] : []) ]

9. Write the plan file:

   Derive slug = "draft-" + kebab(need or first title)  (lowercase, non alnum to -, collapse)

   Write full structured content (JSON or markdown table of the list) to:

   local://draft-<slug>-plan.md

10. Finish:

    Write plain text to xd://propose :
    ```
    draft-<slug>
    <chosen primary title>
    ```
    (The /plan system will present for approval; execution of approved plan runs the ghCreateArgs in order and emits "/sdlc-write-spec #N" for the created issues.)
## Multi-Issue Notes

- One ask only for split confirm (see references/multi-issue.md for updated rules).

- One plan file covers all; lists in topo order.

- Bodies contain the Depends on: / Blocks: lines (parseable later).

- No epic coordination, no fan-out, no child creation inside this skill.

- Leftover spike issues are upgrade inputs, not a draft-issue type.

## Guidelines

- Title: concise, verb first.

- ACs: Given/When/Then.

- No implementation details in bodies.

- Scope explicit.
