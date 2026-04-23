# Fetch Unresolved Review Threads

**Consumed by**: `address-pr-comments` Step 2 (initial fetch on round 1) and the top of every subsequent round (re-fetch after polling). Re-deriving from `gh` on every round — rather than caching a thread list across rounds — is intentional: GitHub is the ground truth for thread state, and pulling it fresh prevents stale-state bugs when the reviewer adds new threads or the user resolves one manually between rounds.

## GraphQL Query

Use `gh api graphql` with variables passed via `-F` / `-f` — never string-interpolate the PR number or owner into the query body. Inline variables would be unsafe if any downstream reviewer login or repo name contained shell metacharacters, and the `-F` / `-f` form is enforced by `steering/tech.md` → Security.

```
gh api graphql \
  -F owner="$OWNER" \
  -F name="$REPO" \
  -F number="$PR_NUMBER" \
  -f query='
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              comments(first: 50) {
                nodes {
                  databaseId
                  body
                  path
                  line
                  diffHunk
                  author {
                    login
                    __typename
                  }
                }
              }
            }
          }
        }
      }
    }
  '
```

Resolve `$OWNER` and `$REPO` from `gh pr view $PR_NUMBER --json baseRepository` (use the base repo — that's where review threads live). `$PR_NUMBER` is the value resolved in Step 1.

The query returns up to 100 threads, each with up to 50 comments. For larger PRs see the `> 100 threads fallback` section below.

## Reviewer-Identity Filter

Keep a thread only when **both** conditions hold:

1. `isResolved == false`, and
2. At least one comment in the thread was authored by the automated reviewer per `steering/tech.md` → **Automated Review**. Read that subsection's `bots` and `logins` values each time Step 2 runs — a reviewer-login change is a data edit, not a skill edit.

A comment matches the automated reviewer when either:

- `bots` is `true` AND `author.__typename == "Bot"`, or
- `author.login` appears in the `logins` allow-list.

If the **Automated Review** subsection of `steering/tech.md` is missing or malformed (cannot parse `bots` / `logins`), fail closed: treat every thread as out of scope, log a one-line warning naming the missing or malformed field, and take the AC4 "no-reviewer" exit below.

Human-reviewer threads are out of scope for this skill. They stay unresolved on the PR and this skill never replies to them.

## Short-Circuit Exits

Both exits below return code zero. The stdout messages are distinct so the SDLC runner can log the difference between "the reviewer ran and found nothing to flag" and "the reviewer never ran at all" — operators rely on that distinction when diagnosing why a PR did not go through the loop.

| Condition | Exit message | AC |
|-----------|--------------|-----|
| Filtered thread set is empty AND `gh pr reviews $PR_NUMBER --json state` reports no `CHANGES_REQUESTED` entry | `PR #N is review-clean — no action taken.` | AC3 |
| Filtered thread set is empty AND no automated-reviewer review was ever posted (either `gh pr reviews` returns `[]`, or every returned review fails the reviewer-identity filter) | `No automated-reviewer threads found on PR #N — nothing to address.` | AC4 |

These messages apply only when the short-circuit fires on round 1 (initial fetch). The identical "set is empty" condition on round 2+ is the normal review-clean success path described in `references/polling.md`, which uses the rounds-aware phrasing `PR #N is review-clean after {rounds} rounds — exiting.` — preserving the distinction between an entry short-circuit and a loop-completion success.

## Error Handling

GraphQL or network failures exit non-zero with the `gh` stderr surfaced verbatim — retry semantics are the SDLC runner's responsibility, not this skill's. Example exit line: `GraphQL fetch failed on round {N}: {gh stderr}`.

## > 100 Threads Fallback

If `reviewThreads.nodes.length == 100`, additional threads may exist on subsequent pages. Paging is intentionally not implemented here: a PR with > 100 review threads indicates a review process that should not be automated end-to-end. Emit the single-line warning `PR #{N} has 100+ review threads — processing the first page only. Consider splitting the PR.` and continue with the first-page set.
