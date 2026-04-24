# Spike Issue Body Template

**Consumed by**: `draft-issue` Step 6.
**Triggering condition**: `classification === 'spike'`.

Use this template as the body of the drafted GitHub issue when the current iteration classifies as a Spike. Fill each placeholder from the confirmed `understanding` block produced by Step 5c and the `investigation.summary` from Step 4. Unlike feature and bug templates, spikes do not carry acceptance criteria — the spike deliverable is an ADR, not a working implementation.

## Template Structure vs. Feature / Bug Templates

| Section | Spike Template | (Feature Template) |
|---------|----------------|--------------------|
| Opening | Spike Summary (research goal) | User Story (As a / I want / So that) |
| Questions | Research Questions | Background + Current State |
| Candidates | Candidate Set (optional at draft time) | N/A |
| Scope bound | Time-box | Out of Scope |
| Deliverable | Expected Output Shape (ADR / umbrella / redraft) | Acceptance Criteria |
| Protocol | Honest-Gap Protocol | N/A |
| Exclusions | Out of Scope | Out of Scope |

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

After Phase 0 research completes, the Human Review Gate (HRG) chooses one:

- [ ] **ADR only (single-PR)** — findings appended to the spike issue as a comment; ADR shipped in the same PR as the gap-analysis file.
- [ ] **ADR + umbrella + child implementation issues** — umbrella issue created; child issues capture each independent implementation component.
- [ ] **ADR + re-drafted spike scope** — spike issue body edited with refined scope; `/write-spec` re-runs to revisit the research with narrower questions.

## Honest-Gap Protocol

The researcher MUST explicitly enumerate what was NOT determined — silent gaps are failure.

If a candidate cannot be evaluated within the time-box, list it under "Honest Gaps" in the research output and propose a follow-up spike. A partial answer with an honest gap acknowledgement is more valuable than silence.

## Out of Scope

{What this spike will NOT attempt. Be explicit — prevents the researcher from over-scoping the research and ensures the time-box is achievable.}
```

## Authoring Guidance

- **Title**: start with "Spike:" or "Evaluate:" or "Investigate:" — makes the issue type obvious at a glance (e.g., "Spike: evaluate OAuth vs session-cookie auth for the API gateway").
- **No acceptance criteria**: spike issues do not have ACs. The deliverable is the ADR and scope-shape decision, not a working feature. `/verify-code` and `/write-code` abort on spike-labelled issues.
- **Time-box is required**: a spike without a time-box becomes scope creep. The researcher stops when the time-box is reached and reports what was found, including honest gaps.
- **Candidate Set at draft time**: filling in known candidates accelerates the researcher and focuses research. Leave as a placeholder if the candidates are entirely unknown — the researcher will enumerate them during Phase 0.
