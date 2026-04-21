# Per-Defect Learning Extraction

**Consumed by**: `run-retro` Step 3 (analyse new / modified eligible defects) and Step 3.5 (carry forward learnings from the existing retrospective for unchanged specs).

Step 3 analyses each new / modified defect spec that survived Step 2's eligibility filter. Step 3.5 avoids redundant LLM work by lifting learnings from the existing `steering/retrospective.md` when every piece of evidence that produced them is unchanged. Both feed Step 4 a combined set of learnings to aggregate.

## Step 3: Analyse each eligible defect

Report progress before starting analysis:

```
Analyzing [N] specs, skipping [M] unchanged
```

For each new / modified defect spec with a resolved feature spec from Step 2:

1. **Read the defect spec** (`requirements.md`) — extract reproduction steps, acceptance criteria, severity, and root-cause context.
2. **Read the resolved feature spec** — the `requirements.md` at the path resolved through Step 2's chain resolution. Extract the original acceptance criteria, functional requirements, and scope.
3. **Compare**: what did the feature spec cover? What scenario caused the defect? What was the gap?
4. **Identify the transferable spec-writing pattern** — strip project-specific details and frame as a principle applicable to any domain.
5. **Formulate a recommendation** — actionable guidance for writing future specs.

### Generalisation guidance

Each learning must be a forward-looking principle, not a backward-looking description of what one spec missed. Remove project-specific terminology, file names, and implementation details.

| Framing | Example |
|---------|---------|
| **Bad** (project-specific) | "Feature spec for `emulate status` did not account for CDP session isolation" |
| **Good** (transferable) | "When specifying features that interact with external systems via session-scoped protocols, include ACs for state persistence across invocations" |

## Step 3.5: Load existing retrospective and carry forward

Read `steering/retrospective.md` if it exists.

### Carry-forward strategy

Rather than re-analysing every spec, extract learnings from the existing `retrospective.md` that can be carried forward unchanged. This avoids redundant LLM analysis for specs that haven't changed.

### Extracting learnings from the existing retrospective

1. Parse the three pattern-type sections by heading: "Missing Acceptance Criteria", "Undertested Boundaries", "Domain-Specific Gaps".
2. For each section, read the markdown table rows (skip the header row and the separator row).
3. For each learning row, extract:
   - **Learning** text (column 1).
   - **Recommendation** text (column 2).
   - **Evidence paths** (column 3 — split on `,` and trim whitespace to recover individual spec directory paths).

### Carry-forward decision per learning

- **Carry forward** the learning if **all** of its evidence spec paths correspond to specs in the "unchanged" set from Step 1.5.
- **Do NOT carry forward** the learning if **any** of its evidence spec paths correspond to specs in the "new", "modified", or "deleted" sets — those learnings will be re-derived from fresh analysis.
- If the existing `retrospective.md` does not exist (first run), there are no carried-forward learnings.

## Output

The carried-forward learnings join the freshly analysed learnings from Step 3 as input to Step 4's cross-cutting pattern aggregation.
