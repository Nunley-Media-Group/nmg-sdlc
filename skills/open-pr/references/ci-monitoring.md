# Terminal Exact-Head Delivery Loop (v3)

Poll state (PR, checks exact event:pr, reviews, threads, issue close refs, mergeState).

Head change → discard prior, re-verify + re-observe.

Safe actionable → fix (skill-bundled via the skill-creator file on disk if present), re-verify, push, restart loop.

For unresolved review threads:
- bot (Bot typename or coderabbitai login or per tech automated list): follow inlined address-pr-comments logic (or equivalent clear-fix apply+resolve) in same session.
- human or ambiguous: produce failed handoff intervention:true reasonCode human_review ; do not merge.

Ready only when all: success checks, no active CHANGES_REQUESTED, resolved non-outdated (for bots), merge CLEAN, not draft, verification matches head.

Merge with --match-head-commit.

Proof (mandatory for passed handoff):
- PR state MERGED + exact head
- issue state CLOSED

Then delete local branch (checkout default, branch -D).

Only after full proof write passed deliver handoff and print NMG line.

Any missing proof → failed handoff. No success until both merged+closed.
