# Push, Poll, and Loop

**Consumed by**: `address-pr-comments` Step 5 at the end of every round, after `references/fix-loop.md` and `references/escalation.md` have processed every thread in the current fetch.

This reference owns the three concerns that bookend each round: pushing new commits to the remote, waiting for the automated reviewer to re-run, and deciding whether to start another round or exit. Every termination path is enumerated with a verbatim stdout message so the SDLC runner can tell them apart from log text alone — distinct messages are the only way for an operator to disambiguate "the round cap was reached" from "the polling timed out" from "the loop exited because it was about to livelock".

## Polling Constants

| Constant | Value | Mirrors |
|----------|-------|---------|
| Poll interval | 30 seconds | `skills/open-pr/references/ci-monitoring.md` |
| Poll timeout | 30 minutes | `skills/open-pr/references/ci-monitoring.md` |
| Max polls per round | 60 | `skills/open-pr/references/ci-monitoring.md` |
| Default max rounds | 10 | this skill (configurable via `--max-rounds=N`) |

These values match `$nmg-sdlc:open-pr` Step 7 exactly so interactive and unattended runs share a single "how long do we wait on GitHub" policy. A change to the constants here should be paired with a change to the `$nmg-sdlc:open-pr` reference in the same PR.

## Step 5a: Push This Round's Commits

If `commits_this_round == 0`, skip pushing and proceed to Step 5b.

Otherwise, push the branch to the remote using plain `git push` — no `--force`, no `--force-with-lease`, no `--force-if-includes`. The absence of any force variant is load-bearing: the retrospective on branch-state preconditions makes it clear that silent history rewrites on a PR under active review destroy the reviewer's context, so this skill refuses to rewrite history even when the remote has diverged.

```
git push
```

Success paths:

- Fast-forward push succeeds → proceed to Step 5b.

Failure paths:

- Non-fast-forward rejection (remote has diverged: someone else rebased or pushed to the branch). Exit non-zero with:

  ```
  git push was rejected (remote has diverged) on round {N}. Force-push is never used by this skill — reconcile the divergence manually (e.g., git pull --rebase, resolve, then re-run $nmg-sdlc:address-pr-comments).
  ```

- Any other push failure — exit non-zero surfacing the `git push` stderr verbatim.

## Step 5b: Livelock Guard (Unattended Only)

Applies only when the cached `.codex/unattended-mode` sentinel is present. The guard prevents the runner from burning budget re-polling for threads the skill will never change:

If `commits_this_round == 0` AND `escalations_this_round > 0`, exit with code **zero** and:

```
Round {N}: {M} threads escalated, 0 fixes applied — exiting unattended loop.
```

Where `{M}` is `escalations_this_round`. The zero exit code is deliberate — a runner that treated this as a failure would retry and re-escalate forever. The SDLC runner surfaces the escalation sentinels emitted in `references/escalation.md` for the human to act on later.

If the guard does not fire (either the mode is interactive, or commits were made, or no thread escalated), proceed to Step 5c.

## Step 5c: Poll for Reviewer Re-run

Wait for the automated reviewer to respond to the pushed commits. On each poll:

1. Run `sleep 30` to pause for the 30-second poll interval.
2. Run `references/fetch-threads.md` again for the same PR number, excluding any threadId in the in-process skipped-set from the returned set.
3. Also run `gh pr reviews $PR_NUMBER --json state,author` to check overall review state.

Terminate the poll loop on the first condition that matches:

| Condition | Next step |
|-----------|-----------|
| The excluded-set-filtered unresolved thread count is zero AND `gh pr reviews` shows no `CHANGES_REQUESTED` state | Go to Step 5d (success). |
| The excluded-set-filtered unresolved thread count is non-zero (reviewer has re-run and left new threads) | Go to Step 5e (next round). |
| 60 polls completed (30 minutes elapsed) without reaching either of the above | Go to Step 5f (re-review timeout). |

Print a progress line on each poll (e.g., `Polling for reviewer re-run on round {N}... {elapsed_seconds}s elapsed, {unresolved_count} unresolved threads, review state: {state}.`) so a watching operator can see progress.

## Step 5d: Review-Clean Exit

All current unresolved threads were either fixed-and-resolved this invocation or are in the skipped-set (user-skipped or escalation-skipped). Exit **zero** with:

```
PR #N is review-clean after {rounds} rounds — exiting.
```

Where `{rounds}` is the final round counter. This phrasing is distinct from the initial-fetch review-clean message in `references/fetch-threads.md` — operators use the difference to tell "the PR was already clean on entry" from "the skill actually closed the loop".

## Step 5e: Round Cap Check → Next Round

Before starting another round, check the cap. If `next_round > max_rounds` (where `max_rounds` is the value parsed in SKILL.md Step 1, default 10), exit **non-zero** with:

```
Round cap of {max_rounds} reached without reaching review-clean — exiting so you can investigate. {remaining_unresolved} unresolved, {skipped_size} skipped this invocation.
```

Otherwise, increment the round counter, reset `commits_this_round` and `escalations_this_round`, and return to SKILL.md Step 3 (classify) with the re-fetched thread set. Step 2 (`references/fetch-threads.md`) is re-run at the top of every round — this skill never caches a thread list across rounds.

## Step 5f: Re-Review Timeout

The reviewer did not post anything within 30 minutes and overall review state still shows `CHANGES_REQUESTED`. Exit **non-zero** with:

```
Re-review polling timeout reached after 30 min on round {N} — exiting so you can investigate.
```

Do NOT resolve any remaining threads. Do NOT amend or revert any commits. The operator investigates the root cause (reviewer disabled, quota exhausted, reviewer misconfigured, etc.) and re-runs the skill when ready.

## Exit Message Index

| Exit message | Code | AC | Triggered in |
|--------------|------|-----|--------------|
| `PR #N is review-clean — no action taken.` | 0 | AC3 | `references/fetch-threads.md` (round 1 short-circuit) |
| `No automated-reviewer threads found on PR #N — nothing to address.` | 0 | AC4 | `references/fetch-threads.md` (round 1 short-circuit) |
| `PR #N is review-clean after {rounds} rounds — exiting.` | 0 | AC12 | Step 5d |
| `Round {N}: {M} threads escalated, 0 fixes applied — exiting unattended loop.` | 0 | AC15 | Step 5b |
| `Round cap of {max_rounds} reached without reaching review-clean — exiting so you can investigate. {remaining_unresolved} unresolved, {skipped_size} skipped this invocation.` | non-zero | AC12 | Step 5e |
| `Re-review polling timeout reached after 30 min on round {N} — exiting so you can investigate.` | non-zero | AC13 | Step 5f |
| `git push was rejected (remote has diverged) on round {N}. Force-push is never used by this skill — reconcile the divergence manually (e.g., git pull --rebase, resolve, then re-run $nmg-sdlc:address-pr-comments).` | non-zero | AC11 / AC14 | Step 5a |

Any operator parsing this skill's output can map a single line to a single cause.
