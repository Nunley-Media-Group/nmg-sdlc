# Interview Probes (v3 ask contract)

**Budget rule (enforced in caller)**: total ask() invocations in the draft-issue run is at most 3. This budget covers split-confirm (if any), classification ask, milestone ask (if any), and all interview probes. Use ask() only for preferences and tradeoffs. List recommended option first. 2–4 options. Never ask for final draft approval or "does this match" — approval is exclusively by writing to xd://propose.

## Depth

Compute from investigation signals for logging only. No separate ask for override (saves budget).

## Probes (use remaining slots; 1 ask preferred)

After prior asks have consumed their slots:

Present one ask:

question: classification === 'bug' ? 'Reproduction and risk?' : 'Persona, outcome, ACs and scope?'

options (rec first):

- "Synthesize directly from the initial description + investigation summary (recommended)"
- "Focus the next answer on missing acceptance criteria"
- "Focus the next answer on out-of-scope boundaries"
