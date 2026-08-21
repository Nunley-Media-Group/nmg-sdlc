# draft-issue Exercise Rubric

**Consumed by**: `scripts/skill-exercise-runner.mjs`.
**Triggering condition**: The runner is invoked with `--skill draft-issue` against the fixture at `scripts/__fixtures__/skill-exercise/draft-issue/`.

Two classes of check: **deterministic** (byte- or structure-equivalent — these map 1:1 to issue #146 ACs and must pass byte-exactly against any pre-refactor baseline) and **rubric-graded** (model-authored content judged by shape, not exact bytes).

## Deterministic Checks

| ID | Check | Pass Criteria | Maps To |
|----|-------|---------------|---------|
| D1 | WORKFLOW.md line count | `wc -l workflows/draft-issue/WORKFLOW.md ≤ 320` | AC1 (issue #146) |
| D2 | Frontmatter Codex compatibility | Frontmatter either omits `model` or uses a `gpt-*` model, and contains no legacy provider model terms | Codex compatibility |
| D3 | Pointer grammar | `grep -cE '^Read \`(\.\./\.\./)?references/[^\`]+\.md\` when ' workflows/draft-issue/WORKFLOW.md` ≥ 1 and every reference-pointer line in the file matches the grammar | AC3 (issue #146) / AC7 (epic) |
| D4 | Reference file budget | `ls workflows/draft-issue/references/ | wc -l ≤ 6` | AC8 (epic) |
| D5 | Every referenced file exists | Every path named in a pointer line resolves to a real file | Pointer correctness |
| D6 | Audit passes | `node scripts/skill-inventory-audit.mjs --check` exits 0 | AC5 (issue #146) / AC6 (epic) |
| D7 | Loader-facing metadata | The surviving `name:` is stable and `description:` is non-empty and at most 1024 characters; intentional trigger-description migrations are allowed | AC4 (epic) |
| D8 | References > 300 lines have a TOC | Any `draft-issue/references/*.md` over 300 lines includes a Markdown TOC within the first 30 lines | AC8 (epic) |

## Rubric-Graded Checks

These run through the evaluator-backed rubric path in `scripts/skill-exercise-runner.mjs`. In default CI mode, the runner grades deterministic fixture artifacts under `scripts/__fixtures__/skill-exercise/draft-issue/artifacts/` without live Codex or API access. When `RUN_EXERCISE_TESTS=1` is set and Codex is available, the runner captures live exercise output, extracts the authored issue artifact, and sends it through the same evaluator.

Captured artifacts produce `pass` or `fail` for applicable criteria. A criterion may report `skipped` only with a specific reason such as `exercise-mode unavailable`, `artifact missing`, `unsupported interactive gate`, `criterion not applicable`, or `missing evaluator for skill <name>`. Captured artifacts must never report `rubric evaluation not yet implemented`.

| ID | Check | Grade |
|----|-------|-------|
| R1 | Title shape | Starts with a verb (first word matches `/^[A-Z][a-z]+\b/` and is an action verb like Add/Fix/Implement/Refactor) |
| R2 | AC count | ≥ 3 acceptance criteria for feature classification; ≥ 2 for bug |
| R3 | AC format | Every AC block contains `**Given**`, `**When**`, and `**Then**` lines (or the equivalent unbolded prefix) |
| R4 | User Story present (feature) | Body contains `**As a**`, `**I want**`, `**So that**` lines under a `## User Story` heading |
| R5 | Root-Cause Analysis present (bug) | Body contains a `## Root Cause Analysis` heading with a non-empty paragraph and a `**User Confirmed**` line |
| R6 | Out of Scope section | Body contains a `## Out of Scope` heading with at least one bullet |

## Deterministic Fixture Artifacts

| Fixture | Purpose |
|---------|---------|
| `draft-issue/artifacts/feature-pass.md` | Passing feature artifact for default non-live evaluation |
| `draft-issue/artifacts/malformed-fail.md` | Negative artifact used by Jest to prove malformed structures fail with actionable details |

## Pre-Refactor Baseline

The pre-refactor baseline for command-surface checks is derived from `git show main:workflows/draft-issue/WORKFLOW.md` at the merge-base of this branch, with legacy skill and monorepo paths supported for older baselines. Model-authored artifacts (R1–R6) are evaluated from deterministic fixture artifacts by default, or from captured live Codex output when `RUN_EXERCISE_TESTS=1` is explicitly enabled.

## Invocation

```
node scripts/skill-exercise-runner.mjs --skill draft-issue
```

Exits 0 when every deterministic check passes and every rubric check is either `pass` or `skipped`; exits 1 otherwise.
