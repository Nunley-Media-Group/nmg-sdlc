# Spike Issue Body Template

**Consumed by**: `draft-issue` Step 6.
**Triggering condition**: `classification === 'spike'`.

Use this template as the body of the drafted GitHub issue when the current iteration classifies as a Spike. Fill each placeholder from the confirmed `understanding` block produced by Step 5c and the `investigation.summary` from Step 4. Spikes do not carry acceptance criteria — the deliverable is an ADR, not a working implementation.

## Template

```markdown
## Spike Summary

{1-2 sentence research goal. Start with a verb: "Evaluate…", "Investigate…", "Determine…".
Describe what decision this spike will enable — not the implementation steps.}

## Research Questions

- {Question 1 — phrased so the answer is a concrete decision}
- {Question 2}
- {Add more as needed}

## Candidate Set

{List known options at draft time, or leave as placeholder if unknown.
Include the "status quo / no-change" option when it is a valid choice.
If the candidate set is entirely unknown, write: "To be determined during research."}

## Time-box

{e.g., "8 hours of research before Human Review Gate"}

Rationale: a spike without a time-box drifts. The researcher must commit to a scope of research and stop when the time-box is reached, even with gaps remaining.

## Expected Output Shape

The research produces a gap-analysis ADR under docs/decisions/ (YYYY-MM-DD-slug.md) plus recommendation. The ADR is the primary artifact.

## Honest-Gap Protocol

The researcher MUST explicitly enumerate what was NOT determined — silent gaps are failure.

If a candidate cannot be evaluated within the time-box, list it under "Honest Gaps".

## Out of Scope

{What this spike will NOT attempt. Be explicit — prevents the researcher from over-scoping the research and ensures the time-box is achievable.}
```

## Authoring Guidance (v3)

- Title starts with "Spike: Evaluate..." or "Investigate...".
- No ACs (ADR is the deliverable; see write-spec spike path for ADR creation).
- Time-box required to bound research.
- Candidate set accelerates; honest gaps must be listed.

For multi-issue the caller appends Depends on:/Blocks: lines using topo plan data before the plan file is written.
