# Push, Poll, and Loop

**Consumed by**: `address-pr-comments` Step 5 after every current-round thread has been processed.

## Polling Contract

Wait 30 seconds between observations to avoid wasteful requests. The interval is scheduling only: there is no poll timeout, maximum poll count, or maximum review-round count. Continue while the PR and reviewer processes remain observable.

End only when the PR is review-clean, a genuine command/review failure occurs, the caller explicitly cancels, or the relevant process is confirmed lost. Keep this state-based contract aligned with `workflows/open-pr/references/ci-monitoring.md`.

## Push This Round

If `commits_this_round > 0`, run plain `git push`. Never use any force variant. On a non-fast-forward rejection, exit non-zero and tell the user to reconcile the divergence before re-running. Surface any other push stderr verbatim. If no commits were created, skip the push.

## Poll for Re-Review

On each poll:

1. Wait 30 seconds.
2. Re-run `references/fetch-threads.md` for the same PR, excluding the in-process skipped-set.
3. Run `gh pr reviews $PR_NUMBER --json state,author`.
4. Print the unresolved count and current review state.

Route the first matching result:

| Condition | Result |
|-----------|--------|
| No unresolved non-skipped threads and no `CHANGES_REQUESTED` review | Exit zero: `PR #N is review-clean after {rounds} rounds — exiting.` |
| New unresolved non-skipped threads | Start the next round. |
| Poll command or review state reports a genuine failure | Exit non-zero with the exact failure evidence. |
| Explicit cancellation | Exit non-zero as cancelled without resolving, amending, or reverting remaining work. |
| PR or reviewer process is confirmed lost | Exit non-zero as process loss with the last observed state. |

Otherwise keep polling. Before a next round, increment the round, reset `commits_this_round`, and return to Step 3 with the re-fetched threads.
