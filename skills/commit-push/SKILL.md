---
name: commit-push
description: "Deprecated compatibility stub. Use $nmg-sdlc:open-pr instead; open-pr now stages eligible work, applies version bumps, commits, rebases safely, pushes, and creates the pull request in one delivery step."
---

# Commit and Push (Deprecated)

`$nmg-sdlc:commit-push` is no longer a public SDLC workflow step.

Use `$nmg-sdlc:open-pr #N` instead. It now owns the delivery handoff: stage eligible non-runner work, apply the version bump, create the conventional delivery commit when needed, reconcile with `origin/main`, push safely, verify no unpushed commits remain, and create the pull request.

## Workflow

Print this message and stop without mutating files or git state:

```
$nmg-sdlc:commit-push is deprecated. Run $nmg-sdlc:open-pr #N to commit, push, and create the pull request.
```

## Integration with SDLC Workflow

```
$nmg-sdlc:draft-issue  →  $nmg-sdlc:start-issue #N  →  $nmg-sdlc:write-spec #N  →  $nmg-sdlc:write-code #N  →  $nmg-sdlc:simplify  →  $nmg-sdlc:verify-code #N  →  $nmg-sdlc:open-pr #N  →  $nmg-sdlc:address-pr-comments #N
```
