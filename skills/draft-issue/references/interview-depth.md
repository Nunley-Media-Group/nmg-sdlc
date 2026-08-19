# Interview Probes (v3 ask contract)

**Budget rule (enforced in caller)**: total ask() invocations in the draft-issue run is at most 3. This budget covers split-confirm (if any), classification ask, milestone ask (if any), and all interview probes. Use ask() only for preferences and tradeoffs. List recommended option first. 2–4 options. Never ask for final draft approval or "does this match" — approval is exclusively by writing to xd://propose.

## Depth

Compute from investigation signals for logging only. No separate ask for override (saves budget).

## Probes (use remaining slots; 1 ask preferred)

After prior asks have consumed their slots:

Present one ask:

question: classification === 'bug' ? 'Reproduction and risk?' : (classification === 'spike' ? 'Research focus and output?' : 'Persona, outcome, ACs and scope?')

options (rec first):
  - "Synthesize directly from the initial description + investigation summary (recommended)"
  - "Let me adjust the persona / ACs / repro / research questions"

If one slot remains after the above, follow with:

question: "Anything I have not asked that matters?"
options: [ "No, proceed (recommended)", "Yes — [free text in Other]" ]

A non-empty missed answer is folded in.

## Output
- interviewAnswers
No playback confirm, no depth gate, no old input gate, no consecutive revise.
