# Root Cause Analysis: Reconcile remote spec merge after local checkout failure

**Issue**: #415
**Date**: 2026-09-23
**Status**: Approved
**Author**: NMG

---

## Root Cause

`mergeSpec` equates a nonzero `gh pr merge --delete-branch` exit with remote rejection. GitHub CLI can first merge remotely and subsequently fail its local branch checkout, so the exit status alone does not establish publication state. The default `gh pr list` search excludes merged PRs, making a subsequent invocation liable to create another PR.

## Fix Strategy

Record the local exact head before merging and inspect the identified PR directly on CLI failure. Accept remote completion only for the same numeric PR in `MERGED` state with the expected `headRefOid`, `headRefName`, and `baseRefName`. In the re-entry path, search the spec branch's PRs including merged state, disambiguate the exact PR, and prove the same identity before skipping readiness and merge. Preserve the existing double readiness snapshots and exact-head merge flag for open PRs. No fallback may turn an unreadable or inconsistent PR into success.

Post-merge, attempt default checkout and fast-forward only when safe; surface a worktree checkout conflict as `default_checkout_failed` with `merged: true`, PR, and original CLI diagnostic. Apply the independent `spec-created` label even if local checkout fails, without masking checkout failure. Re-entry should repeat only incomplete bookkeeping and preserve the spec branch/worktree.

## Affected Paths

- `scripts/publish-approved-spec.mjs`: exact PR identity proof, merged-PR re-entry, safe post-merge bookkeeping.
- `scripts/__tests__/publish-approved-spec.test.mjs`: simulated remote merge/local error, unmerged and contradictory remote evidence, real worktree conflict, repeat invocation.
- `workflows/write-spec/references/publish.md`: document proven-merge classification and checkout remediation without republishing.
- `README.md`, `CHANGELOG.md`: document user-facing recovery and pending fix.

## Risks and Boundaries

A merged state without matching immutable head and branch/base does not prove this publication. Never retry `gh pr merge` after a possible remote side effect; never treat CLI output text as proof. A local checkout limitation is not a remote merge failure. Missing PR discovery or ambiguous matches must fail closed rather than create a duplicate.
