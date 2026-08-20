# Status Skill Exercise Rubric

The status exercise evaluates the committed JSON artifact against six deterministic criteria. Every criterion must pass; placeholder skips are not accepted for this skill.

| ID | Criterion |
|----|-----------|
| S1 | Schema version 1 and every stable top-level status field are captured. |
| S2 | A complete spec with no implementation infers `specified` and recommends `/sdlc-execute #145`. |
| S3 | Passing verification without implementation evidence stops at `specified` and records the conflict. |
| S4 | Unavailable GitHub evidence preserves the strongest supported local stage and records a named gap. |
| S5 | Status reports its next action without prompting or executing that action. |
| S6 | Text and JSON runs preserve repository state, agree on stage, and keep JSON stdout pure. |

Retired orchestration evidence and behavior are outside this exercise because they are outside the issue #145 status contract.
