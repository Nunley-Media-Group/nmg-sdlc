# Edge-Case Handling

**Consumed by**: `run-retro` whenever an input file is missing, malformed, or in an unexpected state.

`/run-retro` must run reliably over an accumulating archive of defect specs — a partially hand-edited state file, a deleted defect spec, or a `**Related Spec**` chain that no longer resolves cannot halt the retrospective. Every graceful-degradation path below is safe to apply silently or with a one-line warning; none of them should escalate in unattended mode.

## Defect-spec and chain conditions

| Condition | Behavior |
|-----------|----------|
| No defect specs found | Report "No defect specs with Related Spec links found." — do not create / modify `retrospective.md`. |
| Defect spec missing `**Related Spec**` field | Skip that defect spec silently (expected for defects unrelated to existing features). |
| `**Related Spec**` link points to a nonexistent spec directory | Warn `Related Spec link in [defect] points to [path] which does not exist — skipping`. |
| `**Related Spec**` points to another defect spec | Follow the chain to the root feature spec; if circular or dead-end, warn and skip. |
| All learnings filtered out by Step 6 | Report "N defect specs analyzed, but no spec-quality learnings identified." — do not create / modify `retrospective.md`. |

## Output-directory conditions

| Condition | Behavior |
|-----------|----------|
| `steering/` directory does not exist | Create it before writing `retrospective.md` and `retrospective-state.json`. |

## State-file conditions

| Condition | Behavior |
|-----------|----------|
| State file missing (first run) | Treat every defect spec as "new" — full analysis; state file is created on completion. |
| State file contains malformed JSON | Warn `State file contains invalid JSON — falling back to full re-analysis` and treat as first run. |
| State file has unrecognised `version` | Warn `State file has unrecognized version [N] — falling back to full re-analysis` and treat as first run. |
| Deleted spec in state file | Remove the entry from the written state file; remove learnings sourced solely from the deleted spec. |

The retrospective accrues state over releases against human-edited inputs, so the skill prefers a successful partial run with warnings over a halted run — the warnings are the audit trail, and the next invocation picks up cleanly from the same state file.
