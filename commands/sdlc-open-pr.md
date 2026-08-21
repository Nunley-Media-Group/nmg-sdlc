---
name: sdlc-open-pr
description: "Deliver verified work through exact-head PR merge"
---


# Open PR

Terminal exact-head delivery. No user gates. Automated only.

## Context and Resolver

Resolve N from arg or branch.

Resolve specs/N-SLUG/ using first leading-N dir + frontmatter **Issue**:#N **Status**:Approved check (same resolver as write/verify). Fail with spec_not_approved if not.

Read issue full (title, body, labels, state).

A leftover `spike` label does not skip the version bump. Classify from the bug/enhancement matrix only.

Check for BREAKING:
- if title or body contains "BREAKING" (case-insens)
- AND no line in requirements.md or design.md matching ^\*\*Version bump\*\*:\s*major\s*$ (case-insens)
  then failed handoff reasonCode:"major_bump_required" intervention:true

Read verification report from spec dir. Require local pass or valid pr_evidence_pending.

## Version Bump (automatic, no gate)

Read steering/tech.md for ## Versioning / bump matrix (label → patch|minor ; default minor). There is no spike skip.

Read current VERSION if present.

Classify bump_type from labels + matrix.

If BREAKING major approved by spec note, allow major.

Compute new semver.

Update (always stage together):
- VERSION
- package.json version (if present, use json edit)
- CHANGELOG.md : move [Unreleased] content under new ## [X.Y.Z] - DATE heading, leave [Unreleased] empty
- any other files listed in tech.md versioned-files table

Use node for safe json updates.

Commit the delivery + version if changes: `feat: ... (#N)` or `fix:...` or `chore: bump version to X.Y.Z`

## Push and Create/Resume PR

Use preflight logic (clean scope, fetch, merge base safely no rewrite, push -u or push).

Create PR if none for exact branch:
gh pr create --title "..." --body "..."   (use pr-body template without epic lines)

For pr_evidence_pending path: create as --draft if needed, but follow the pending evidence contract for H1/H2 etc.

Add labels from issue.

## Terminal Loop: Monitor, Address Bots, Merge, Proof

While PR open:
- Fetch full PR state: gh pr view --json , checks, reviews, threads (graphql for threads + comments)
- Identify review threads that are unresolved.
- For threads:
  - Bot: __typename === "Bot" or comment author login "coderabbitai" (or per steering/tech.md automated review logins)
    → in same session run the address logic from address-pr-comments (or inline equivalent: classify, for clear-fix apply via edit + verify, resolve thread)
  - Human or ambiguous: write failed handoff reasonCode:"human_review" intervention:true ; keep pane open; stop. Do not merge.
- Fix actionable CI (safe in-scope only, re-verify, push)
- Re-observe head after changes.
- Ready when: success checks, no CHANGES_REQUESTED, no unresolved non-outdated bot threads, mergeStateStatus CLEAN, not draft, verification current for head.

Then:
gh pr merge <num> --squash --match-head-commit <head> --delete-branch   (or per tech policy)

## Success Proof and Handoff (only here)

Re-fetch:
- PR state === "MERGED" and head matches
- issue state === "CLOSED"

Only then:
- delete local branch if safe (git checkout main; git branch -D the-feature)
- write handoff:
  status:"passed"
  intervention:false
  step:"deliver"
  next: null
  artifacts: [pr url]
  summary: "PR #P merged, issue #N closed, branch cleaned"

Print NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/N-deliver.json

If any proof missing, failed handoff with appropriate reason (e.g. merge_failed).
