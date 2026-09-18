# write-spec Exercise Rubric

**Consumed by**: `scripts/skill-exercise-runner.mjs`.

## Rubric-Graded Checks

| ID | Check | Grade |
|----|-------|-------|
| W1 | Four artifacts | JSON keys `requirements`, `design`, `tasks`, and `feature` contain nonempty strings |
| W2 | Executable requirements | Requirements contain AC and FR content with no external or control burden |
| W3 | Focused design | Design omits forbidden generic process sections and external burdens |
| W4 | Executable tasks | Canonical issue-specific tasks have Acceptance and no delivery or external acceptance |
| W5 | Observable Gherkin | Each scenario has a unique stable `@SCN...` tag, Given/When/Then, and no instructional content |
| W6 | Complete mapping | One distinct scenario exists per requirements AC and all four artifacts have zero execute-feasibility violations |

The evaluator is artifact-scoped. Bare domain words such as `owner`, `audit`, `authorization`, and `latency` remain valid when they describe repository-implementable, observable software behavior.

## Invocation

```text
node scripts/skill-exercise-runner.mjs --skill write-spec --artifact scripts/__fixtures__/skill-exercise/write-spec/artifacts/write-spec-pass.json --base HEAD
```
