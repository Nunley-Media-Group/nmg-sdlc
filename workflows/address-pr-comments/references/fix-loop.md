# Per-Thread Fix Loop

**Consumed by**: `address-pr-comments` Step 4 when the current thread's classification is `clear-fix`. Every step below runs inside the session that invoked address-pr-comments; do not spawn subprocesses.

## Why a postcondition gate

Self-reported success from a delegate is never sufficient to close a loop. `write-code` can return "done" when a soft failure (missing specs, permission denial, plan-mode abort, turn-limit exhaustion) left the tree unchanged; `verify-code` can return a pass while a regression sneaks in through an unrelated test. Replying and resolving a thread on self-report alone would silently close threads the reviewer flagged, which would erode trust faster than any bug. So: `write-code` + `verify-code` produce a candidate fix, and a postcondition gate inspects the observable artifacts (commit graph, file diff, verify report) before we tell GitHub the thread is resolved.

## Following Inlined Workflows

Follow the write-code workflow then the verify-code workflow in this order. Both run inside the current session — do not spawn subprocesses. The address-pr-comments caller drives them directly.

### 1. Follow write-code with synthetic task context

The write-code workflow normally loads from specs/.../tasks.md. For a review thread, drive it with a synthetic task block in place of (or next to) the tasks content:

```
## Synthetic task — PR review finding on PR #{PR_NUMBER}

**Source**: GitHub review thread {threadId} on {path}:{line} by {reviewer login}

**Reviewer body**:
{full comment body}

**Diff hunk the reviewer highlighted**:
{diffHunk}

**Classification**: clear-fix — {rationale}

**Requested change**: apply the minimal code change needed to address this reviewer finding. Do not refactor surrounding code or add features. If the reviewer's premise is incorrect or the change requires a spec-level decision, report that blocker without changing code.

**Commit message**: use exactly `fix: address review finding on {path}:{line}`. Omit the `:{line}` segment when `line` is null.
```

Follow the full write-code steps (steering load, spec context if present for the branch, apply change to satisfy the acceptance for this synthetic task, self-verify, bundle simplify). The synthetic task is treated as the task of record for this pass.

### 2. Follow verify-code

After write-code returns, follow the verify-code workflow in the same session.

It reads the branch's specs and runs the review / exercise / verification-gate path defined by its WORKFLOW.md. It will produce a report naming any regressions. If it reports findings, treat the thread as postcondition-failed (below).
## Postcondition Gate

Before posting any reply or resolving any thread, verify every item in the table. Failing any item means the thread is not actually fixed, so escalate rather than lying to GitHub.

| Postcondition | How to check | Reason |
|---------------|--------------|--------|
| Commit SHA moved forward | `git rev-parse HEAD` changed from the SHA captured before the sub-skill invocation | Silently no-op delegations produce "success" but no commit; this catches them. |
| Fix commit touches the referenced file | `git diff {prior_sha}..HEAD --name-only` includes `path` (skip this check when `path` is null — the reviewer did not name a file) | A commit that does not touch the reviewer's file is addressing something else; do not claim it fixed the thread. |
| verify-code reported no regressions | Read the verify-code report output; treat a non-pass overall status (e.g. `Fail` / `Partial`) or any remaining-issue bullet flagged as a regression against a prior AC as a failure for this check | Regressions introduced by the fix attempt must not be silently published as a "resolved" thread. |
| No sub-skill blocker | Review both sub-skill results for a reported blocker or unresolved decision | A blocked sub-skill means the reviewer's comment is not yet addressable in this invocation. |

If every postcondition holds, proceed to Reply and Resolve below. If any fails, route the thread through the decision gate in `references/escalation.md`, preserving `clear-fix` and updating the rationale to name the failed postcondition. Other threads in the round may still be fixable.

## Reply and Resolve

### Reply via REST

Post a reply to the original thread via `gh api`:

```
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  /repos/{owner}/{repo}/pulls/{pr_number}/comments/{commentId}/replies \
  -f body="$REPLY_BODY"
```

`$REPLY_BODY` is a 1–3 sentence description of the change that names the fix commit SHA so a human can inspect or revert it in one step. Always pass the body via `-f body="..."` — never string-interpolate the reviewer's text into the shell, since a comment could contain shell metacharacters.

Suggested template:

```
Addressed in {short_sha}: {one-sentence description of the change}. {optional: note any collateral change like "also updated adjacent test expectations."}
```

### Resolve via GraphQL

Mark the thread resolved:

```
gh api graphql \
  -F threadId="$THREAD_ID" \
  -f query='
    mutation($threadId: ID!) {
      resolveReviewThread(input: { threadId: $threadId }) {
        thread { isResolved }
      }
    }
  '
```

Confirm the mutation response has `isResolved: true`. If the mutation fails (e.g., another actor resolved or deleted the thread between the fetch and now), log the failure and continue — the fix commit still stands; the skill does not roll back on a reply/resolve race.

## Commit Message Convention

Every fix commit in this loop MUST use the exact prefix `fix: address review finding on {path}:{line}`. When the thread has no file context (`path` is null), use `fix: address review finding on PR #{pr_number} thread {short_thread_id}`. The commit message tail may contain free-form explanation, but the prefix stays exact for retrospective parsing.

## Force-push prohibition

Nothing in this reference issues any `git` command with `--force`, `--force-with-lease`, or `--force-if-includes` flags. That restriction holds even when a push rejection or rebase conflict appears — the rejection path lives in `references/polling.md` and exits non-zero rather than retrying with force.
