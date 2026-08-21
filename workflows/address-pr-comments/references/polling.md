# Push, Poll, and Loop

**Consumed by**: `address-pr-comments` Step 5 after every current-round thread has been processed.

## Polling Constants

| Constant | Value |
|----------|-------|
| Poll interval | 30 seconds |
| Poll timeout | 30 minutes |
| Max polls per round | 60 |
| Default max rounds | 10, configurable with `--max-rounds=N` |

Keep the interval and timeout aligned with `workflows/open-pr/references/ci-monitoring.md`.

## Push This Round

If `commits_this_round > 0`, run plain `git push`. Never use any force variant. On a non-fast-forward rejection, exit non-zero and tell the user to reconcile the divergence before re-running. Surface any other push stderr verbatim. If no commits were created, skip the push.

## Poll for Re-Review

On each poll:

1. Wait 30 seconds.
2. Re-run `references/fetch-threads.md` for the same PR, excluding the in-process skipped-set.
3. Run `gh pr reviews $PR_NUMBER --json state,author`.
4. Print elapsed time, unresolved count, and current review state.

Route the first matching result:

| Condition | Result |
|-----------|--------|
| No unresolved non-skipped threads and no `CHANGES_REQUESTED` review | Exit zero: `PR #N is review-clean after {rounds} rounds — exiting.` |
| New unresolved non-skipped threads | Start the next round unless the cap would be exceeded. |
| 60 polls without either result | Exit non-zero: `Re-review polling timeout reached after 30 min on round {N} — exiting so you can investigate.` |

Before a next round, exit non-zero if `next_round > max_rounds`:

```text
Round cap of {max_rounds} reached without reaching review-clean — exiting so you can investigate. {remaining_unresolved} unresolved, {skipped_size} skipped this invocation.
```

Otherwise increment the round, reset `commits_this_round`, and return to Step 3 with the re-fetched threads. Do not resolve, amend, or revert remaining work on timeout or cap exit.
