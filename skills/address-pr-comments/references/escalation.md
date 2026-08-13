# Decide Ambiguous, Disagreement, or Failed-Fix Threads

**Consumed by**: `address-pr-comments` Step 4 when the current thread is `ambiguous` or `disagreement`, and by `references/fix-loop.md` when a `clear-fix` postcondition fails.

Read `../../../references/interactive-gates.md` before presenting the decision. Show the PR number, path and line, classification, one-sentence rationale, and the first four lines of the comment body before calling `request_user_input`.

Offer these actions:

| Selection | Action | Skipped-set? |
|-----------|--------|--------------|
| `Fix it anyway` | Route through `references/fix-loop.md` as `clear-fix` for this invocation. If postconditions fail again, leave unresolved and add it to the skipped-set. | Only on failed postconditions |
| `Skip — leave unresolved` | Do not reply or resolve. | Yes |
| `Reply without fixing` | Post a concise reply naming the classification and rationale; do not resolve. | Yes |

Treat free-form `Other` text as the reply body and take the `Reply without fixing` path.

## Skipped-Set Semantics

Key the in-process skipped-set by GraphQL `threadId`. Exclude skipped threads from subsequent re-fetches during this invocation so the user is not asked about the same thread repeatedly. Do not persist the set; a later invocation re-evaluates unresolved threads from current evidence.
