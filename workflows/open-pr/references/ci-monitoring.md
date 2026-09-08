# Terminal Exact-Head Delivery Loop (v3)

Let the controller observe the exact PR, pull_request checks, complete reviews
and threads with author login and typename, closing-issue references, and
mergeability. Pending checks remain observations without a workflow deadline.

A safely reconciled base/head change requires a failed
`mergeability_reverification_required` control handoff and all review/fix/verify
gates rerun before delivery. Keep exact-head CAS guards and old artifacts.

For automatic reviews, `authorTypename: Bot` or `coderabbitai` or a registered
technical-steering login establishes attribution. Consume `automatic_review`
once before returning a supported path-bearing bot packet. Pathless threads or
bot `CHANGES_REQUESTED` without actionable threads fail
`automatic_review_unactionable`, not `human_review`. Human or unattributed
requests stay `human_review`; never resolve or override them. Apply only the
workflow's explicit safe packet and never issue an identical packet again.

Ready only when all: success checks, no active CHANGES_REQUESTED, resolved non-outdated (for bots), merge CLEAN, not draft, verification matches head.

Consume `post_merge_observation` before issuing the one squash merge with
`--match-head-commit`. Persist `mergeIssued` first. On command/transport failure
or reinvocation, observe instead of replaying merge. Make at most three full
read-only PR/issue observations at the normal poll interval.

If the last observation proves the exact expected PR/head is merged and its
closing references link the same-repository issue N, but N remains open, the
authorized delivery namespace may persist `closeIssued`, close that exact issue
URL once, then read its exact closure result. Never replay close on a transport
error or new session. Unproven linkage or authorization, or still-open state,
fails `merged_pr_child_still_open`; unreadable closure remains non-passing.

Proof (mandatory for passed handoff):
- PR state MERGED + exact head
- exact closing linkage to issue N in the same repository and issue state CLOSED

Then delete local branch (checkout default, branch -D).

Only after full proof write passed deliver handoff and print NMG line.

Any missing proof → failed handoff. No success until both merged+closed.
