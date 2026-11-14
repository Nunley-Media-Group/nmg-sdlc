---
name: start-issue
description: "Select an executable GitHub issue, create a linked feature branch in its own worktree, and set it to In Progress. Requires explicit #N. Re-proves Depends on parents. No picker, no milestone gate, no ready-to-start gate, leftover spike or epic labels are ordinary. Use when /sdlc-execute needs to begin delivery for #N."
---

# Start Issue

Automated start for issue #N. No user questions, no pickers, no gates. Missing preconditions produce failed handoff with intervention.

The issue branch `{N}-{slug}` lives in its own git worktree. The managed script creates that worktree from the remote issue branch, or from the freshly fetched remote default branch for a new branch, and reuses it when it already exists. The checkout the command was invoked from is never switched to the issue branch and does not have to be clean: its branch, HEAD and working tree are left exactly as they were. Only a checkout that is already on the issue branch is used in place. A passed handoff names the branch, its full head and, when the branch is not the invoking checkout's, the `worktree` path where every later stage works. When the steering manifest declares a worktree `setup` command, it runs once in a new worktree.

When reusing an old issue branch after a squash-merged approved spec, require the managed script to prove default/spec provenance, reconcile only the authorized history without force, synchronize the exact branch head upstream, and include the actual branch and full head in a passed handoff. An unproven merge remains a failed handoff; never detach, reset, force-checkout, or remove a worktree by hand.

## Arguments

The invocation must supply an explicit issue number in the form `#N` or `N` matching `^#?([1-9]\d*)$`.

If the argument is missing or does not match, write failed handoff at the worker header `Handoff path:` (`.nmg-sdlc/handoffs/<N>-start.json`) with reasonCode `no_issue_number`, summary `start-issue requires explicit #N argument`, step `start`, intervention true, status `failed`, next null. Print `NMG_SDLC_HANDOFF: .nmg-sdlc/handoffs/<N>-start.json` and stop.

## Execution

Invoke from the checkout the worker was started in:

node <plugin-root>/scripts/start-issue.mjs --issue N

Pass stdout and stderr through unchanged. Exit with the controller exit code.

Do not call start from the execute orchestrator. Do not skip the sibling `s<N>-start` worker.
