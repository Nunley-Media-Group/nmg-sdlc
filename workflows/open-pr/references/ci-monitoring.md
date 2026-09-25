# Terminal Exact-Head Delivery

Observe the live PR, exact head, `pull_request` checks, complete reviews and threads with author identity, same-repository closing issue references, and mergeability. Pending checks remain observations until their state changes; no numeric observation limit.

Attributable bot failures and actionable threads supply an exact repair packet to an implementation worker. A pathless bot review is not human approval; investigate the concrete failure rather than replaying the same packet. Human-required review remains blocked until actual approval. A changed implementation head requires full registered verification before returning to this PR.

Ready requires passing required checks at the actual final head, no outstanding blocking review, clean mergeability, a non-draft PR, and a full Pass report with registered local results. Merge with `--match-head-commit`. If acknowledgment is lost, inspect the PR and linked issue before another action. Do not force push or replay a merge on the basis of a failed command alone.

A passed handoff requires exact expected PR/head MERGED, same-repository closing linkage and issue CLOSED. Keep the branch and report the precise gap if proof is unavailable; old cursors and one-use allowances do not substitute for remote state.
