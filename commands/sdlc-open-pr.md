---
name: sdlc-open-pr
description: "Deliver verified work through exact-head PR merge"
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

Before editing, if either condition holds, run the controller with
`--remediation-result human_review` and stop:

- any packet thread has no `path`; or
- the packet repeats the immediately preceding packet's `headSha`, failing-check
  names and URLs, and thread URLs.

After a clear fix:

1. Run the narrow verification covering the changed behavior.
2. Stage only the remediation paths, excluding `.omp/`.
3. If the staged diff is empty, run the controller with
   `--remediation-result human_review`, preserve its intervention handoff, and stop.
4. Commit with a conventional `fix:` subject.
5. Push the current branch without force.
6. Rerun `node <plugin-root>/scripts/sdlc-deliver.mjs --issue N`. The controller
   always re-fetches the current PR head, required checks, reviews, and threads.

Never resolve a review thread, merge the PR, resend a prompt, invoke OMP, or start
another worker from this loop.

If a request is ambiguous, design-affecting, human-authored, unsafe, outside
scope, pathless, unchanged after the attempted fix, or repeated unchanged, run:

```bash
node <plugin-root>/scripts/sdlc-deliver.mjs --issue N --remediation-result human_review
```

Preserve that controller-owned intervention handoff and stop.
