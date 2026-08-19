# Multi-Issue for Draft (v3, non-epic)

**Consumed by**: draft-issue multi-issue path.

v3 supports proposing multiple executable issues (feature/bug/spike) from one description. No Epic type, no coordination aggregates, no child fan-out, no native sub-issue links, no coordinationParentNumber.

Relations are expressed only as `Depends on:` and `Blocks:` lines inside the issue bodies (parsed by parseBodyRelationships from scripts/epic-relationships.mjs; do not fork).

## Detection

Compute signals from initialDescription exactly as before (conjunctionHits, bulletListCount, distinctComponents, sentenceCount).

Propose split when high/medium/low thresholds met; segment into {id: "A1", summary, sourceText}[] .

Emit trail note always.

Single path: proposedSplit = null.

## One Confirm Ask (Step for split)

When proposed:

Render:

Multi-issue proposed:

A1: ...

A2: ...

Use ask with 2-4 options, recommended first (max total questions budget across skill):

question: "Create separate issues for this split?"

options:

- "[1] Yes — create N separate issues in topo order (recommended)"

- "[2] Adjust summaries or grouping"

- "[3] Single issue instead"

On adjust: take Other text, re-segment simply (one re-ask max), re-render, ask again or accept.

On single: collapse.

Only this one ask for the split decision. No graph review gate (deps simple or flat).

## Deps for Bodies

Infer minimal edges:

- explicit "depends on X", "blocks Y" phrases in sourceText → map to ask ids

- precursor language on shared component

Produce topo order list of the asks (use Kahn or stable sort preserving input when no edges).

For each planned issue, its body (from template + understanding) will have appended at end (when edges exist):

Depends on: <parent summary or title>

Blocks: <child summary or title>

(Use human readable titles; parse will handle later. No #N yet because numbers assigned on create.)

## In Plan Payload (no per-iteration create loop here)

The draft skill emits ONE plan file listing ALL in topo order.

No Step 10 autolink, no createdIssues mutation in skill.

The approved plan execution will:

- run each gh create argv in listed order

- the bodies already contain the Depends/Blocks text lines

- after creates, print next: Run /plan /skill:write-spec #N for each or the lead one.

No epic coordination template text remains.

Feature/bug/spike templates are used as payload for body synthesis regardless of single/multi.

## State (simplified for plan emission)

Only need:

- proposedSplit (after confirm)

- dag or ordered list of ask entries

- per ask: description, classification (later), milestone (later), investigation, interview, draft body (with dep lines inserted), title

The final plan serializes the ordered array of fully populated issue specs.
