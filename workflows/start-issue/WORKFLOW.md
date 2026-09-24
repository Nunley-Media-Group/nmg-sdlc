---
name: start-issue
description: "Select an executable GitHub issue, create a linked feature branch, and set it to In Progress. Requires explicit #N. Re-proves Depends on parents. No picker, no milestone gate, no ready-to-start gate, leftover spike or epic labels are ordinary. Use when /sdlc-execute needs to begin delivery for #N."
---

# Start Issue

Automated start for issue #N. No user questions, no pickers, no gates. Missing preconditions produce failed handoff with intervention.
When reusing an old issue branch after a squash-merged approved spec, require the managed script to prove default/spec provenance, reconcile only the authorized history without force, synchronize the exact branch head upstream, and include the actual branch and full head in a passed handoff. A branch checked out in another worktree or an unproven merge remains a failed handoff; never detach, reset, force-checkout, or remove that worktree.

## Arguments

The invocation must supply an explicit issue number in the form `#N` or `N` matching `^#?([1-9]\d*)$`.

If the argument is missing or does not match, write failed handoff at the worker header `Handoff path:` (`.omp/sdlc/handoffs/<N>-start.json`) with reasonCode `no_issue_number`, summary `start-issue requires explicit #N argument`, step `start`, intervention true, status `failed`, next null. Print `NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/<N>-start.json` and stop.

## Execution

Invoke from the repository root:

node <plugin-root>/scripts/start-issue.mjs --issue N

Pass stdout and stderr through unchanged. Exit with the controller exit code.

Do not call start from the execute orchestrator. Do not skip the sibling `s<N>-start` worker.
