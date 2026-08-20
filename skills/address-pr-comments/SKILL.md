---
name: address-pr-comments
description: "Address bot PR review threads on open PR from automated delivery. Clear bot findings: apply fix via edit + verify inline, reply+resolve. Ambiguous or human threads: failed handoff with intervention. No user questions. Invoked from open-pr terminal loop or /sdlc-execute."
---

# Address PR Comments

Focused bot-only automated review closer. Called in same session by open-pr.

## Preconditions

- Open PR for the branch (from open-pr)
- Working tree clean
- N or current branch identifies the issue

## Fetch Unresolved Threads

Use gh api graphql for reviewThreads on the PR (first 100, comments).

Filter to unresolved.

Apply automated reviewer identity from steering/tech.md (bots: true, logins: ["coderabbitai"] plus __typename Bot).

If no unresolved bot threads: short-circuit success (no-op for this round).

## Classify (bots only)

For each unresolved bot thread:
- clear-fix: the comment describes an obvious, local, safe, behavior-preserving change with file:line context.
- Otherwise (ambiguous instruction, disagreement, needs design, human-like): treat as non-clear.

## Route

- clear-fix: 
  - read the hunk/file
  - use edit (or follow the skill-creator file on disk if the path is skill-bundled and the file is present) to apply the minimal fix
  - run relevant verify (inline) or tests
  - if now clean, gh api to reply to thread and resolveReviewThread mutation
  - commit with "fix: address review ... (#N)"
  - push (no force)
- any non-clear bot or any human thread present: write failed handoff
  reasonCode: "human_review" or "ambiguous_thread"
  intervention: true
  step: "deliver"
  Stop. Do not resolve or merge.

Loop bounded rounds (default 10) with push + short poll for re-review between.

## Handoff from this utility (when called standalone)

On clean bots or after fixes: passed, but typically returns control to open-pr which does the merge proof.

When invoked from open-pr for bots, no separate handoff unless top level fail.

If this skill is top-level and finishes clean, handoff passed step deliver? But contract routes through open-pr.

For direct: produce appropriate handoff.

Always end by writing handoff when it owns the step.

## Integration with SDLC Workflow

```
/sdlc-draft-issue [need] → /sdlc-write-spec #N → /sdlc-execute [#N …] → /sdlc-status
                                                                                       ▲ address bots inline inside deliver
```
