---
name: open-pr
description: "Deliver a verified issue through the controller, remediate only explicit bot or CI packets in the same worker, and stop safely for human review."
---

# Open PR

Run deterministic delivery for issue N. No user questions and no nested worker.

## Controller Loop

1. Resolve N from `$ARGUMENTS` or the current `N-*` branch.
2. Run:

   ```bash
   node <plugin-root>/scripts/sdlc-deliver.mjs --issue N
   ```

3. Route the exit:
   - `0`: validate the controller-written deliver handoff, print its marker, and stop.
   - `1`: preserve the controller-written failed handoff and stop.
   - `2`: stop on the invalid controller invocation; do not invent a handoff.
   - `3`: parse the single `NMG_SDLC_REMEDIATION: <json>` line and continue below.


The controller writes a passed handoff only after the pull request is `MERGED` at
the exact observed head and issue N is `CLOSED`. Failures such as
`major_bump_required` remain controller-owned intervention handoffs.

## On-Demand Remediation

Use only the packet's failing checks and bot-thread context. Apply a fix only when it
is obvious, local, safe, and inside the approved issue scope. For a workflow-bundled
target, resolve and read `skill://skill-creator` before editing.

After a clear fix:

1. Run the narrow verification covering the changed behavior.
2. Stage only the remediation paths, excluding `.omp/`.
3. Commit with a conventional `fix:` subject when the staged diff is non-empty.
4. Push the current branch without force.
5. Rerun `node <plugin-root>/scripts/sdlc-deliver.mjs --issue N`. The controller always re-fetches
   the current PR head, checks, reviews, and threads.

Never resolve a review thread, merge the PR, resend a prompt, invoke OMP, or start
another worker from this loop.

If a request is ambiguous, design-affecting, human-authored, unsafe, or outside
scope, run:

```bash
node <plugin-root>/scripts/sdlc-deliver.mjs --issue N --remediation-result human_review
```

Preserve that controller-owned intervention handoff and stop.
